"""Resumable market-reference coverage worker.

The worker reconciles every eligible active catalog city/type into a durable
queue. City baselines are completed before optional neighborhood refinement;
empty/blocked sources back off instead of starving the rest of the catalog.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from loguru import logger
from sqlalchemy import and_, delete, or_, select

from db.base import get_engine, make_session_factory
from db.models import (
    MarketReferenceJob, Property, RegionalMarketComparable, RegionalMarketPrice,
)
from enrichment.market_coverage import canonical_property_type, is_eligible_market_property
from enrichment.run import metadata_from_property
from graph.market import calculate_market
from ingestion.geocode import NominatimClient
from tools.market_reference_collector import (
    MarketReferenceCollector,
    scrape_comparables,
)


MARKET_REFERENCE_SOURCE = "listing_median_confidence_v7"
DEFAULT_CONCURRENCY = 2
LEASE_TIMEOUT = timedelta(minutes=10)


@dataclass(frozen=True)
class ClaimedMarketJob:
    job_id: int
    neighborhood: str
    property_type: str
    claimed_at: datetime
    metadata: object


class BatchGeocoder:
    """Serialize Nominatim access and reuse normalized addresses in one run."""

    def __init__(self, geocoder) -> None:
        self._geocoder = geocoder
        self._lock = threading.Lock()
        self._cache: dict[str, tuple[float, float] | None] = {}

    def geocode(self, address: str):
        key = " ".join((address or "").casefold().split())
        with self._lock:
            if key not in self._cache:
                self._cache[key] = self._geocoder.geocode(address)
            return self._cache[key]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value):
    return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value


async def _ensure_subject_coordinates(metadata, geocoder) -> None:
    """Geocode the representative before a city job clears its search street."""
    if metadata.lat is not None and metadata.lng is not None:
        return
    if not metadata.address.strip():
        return
    raw_address = metadata.address.strip()
    first_part = raw_address.split(",", 1)[0].strip()
    # Caixa commonly separates the number as `N. 1076` and appends apartment,
    # block and parking details. Nominatim resolves the civic address once that
    # unit noise is removed.
    number_match = re.search(
        r"(?:^|,)\s*(?:N(?:UMERO|[ºO.]*)\s*\.?\s*)?(\d{1,6})(?:\s|,|$)",
        raw_address,
        flags=re.IGNORECASE,
    )
    street = re.split(
        r"\s+N(?:UMERO|[ºO.]*)\s*\.?\s*(?:\d+|SN)\b",
        first_part,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0].strip()
    civic_address = street
    if number_match and not re.search(r"\b\d{1,6}\s*$", street):
        civic_address = f"{street} {number_match.group(1)}"
    queries = [
        ", ".join(part for part in (
            civic_address, metadata.city.strip(), metadata.state.strip(), "Brasil",
        ) if part),
        ", ".join(part for part in (
            street, metadata.city.strip(), metadata.state.strip(), "Brasil",
        ) if part),
    ]
    for query in dict.fromkeys(queries):
        try:
            coordinates = await asyncio.to_thread(geocoder.geocode, query)
        except Exception as exc:
            logger.warning("Market reference subject geocoding failed: {}", exc)
            return
        if coordinates:
            metadata.lat, metadata.lng = coordinates
            return


def _closing_at(prop):
    now = _now()
    dates = [_aware(value) for value in (prop.first_auction_at, prop.second_auction_at) if value]
    future = [value for value in dates if value >= now]
    return min(future) if future else None


def _property_priority(prop, baseline: bool) -> int:
    closing = _closing_at(prop)
    if closing and closing <= _now() + timedelta(hours=72):
        return 1 if baseline else 50
    return 10 if baseline else 100


def reconcile_coverage(session_factory, ufs: list[str]) -> dict[str, int]:
    """Ensure every active city/type has a baseline job.

    Neighborhood jobs are added only after their city baseline exists, keeping
    broad catalog coverage ahead of refinements.
    """
    wanted_ufs = {uf.strip().upper() for uf in ufs}
    with session_factory() as session:
        props = session.execute(select(Property).where(
            Property.status == "active", Property.uf.in_(wanted_ufs),
        ).order_by(Property.last_seen_at.desc())).scalars().all()
        eligible = [prop for prop in props if is_eligible_market_property(prop)]
        existing_jobs = {
            (job.uf, job.city, job.neighborhood, job.property_type): job
            for job in session.execute(select(MarketReferenceJob).where(
                MarketReferenceJob.uf.in_(wanted_ufs),
            )).scalars().all()
        }
        existing_refs = {
            (ref.uf, ref.city, ref.neighborhood, ref.property_type)
            for ref in session.execute(select(RegionalMarketPrice).where(
                RegionalMarketPrice.uf.in_(wanted_ufs),
                RegionalMarketPrice.price_per_m2 > 0,
            )).scalars().all()
        }

        representatives = {}
        for prop in eligible:
            key = (
                (prop.uf or "").strip().upper(), (prop.city or "").strip(), "",
                canonical_property_type(prop.property_type),
            )
            current = representatives.get(key)
            current_closing = _closing_at(current) if current else None
            candidate_closing = _closing_at(prop)
            if current is None or (candidate_closing and (not current_closing or candidate_closing < current_closing)):
                representatives[key] = prop

        created = 0
        for key, prop in representatives.items():
            if key in existing_jobs:
                existing_jobs[key].representative_property_id = prop.id
                existing_jobs[key].priority = _property_priority(prop, True)
                continue
            status = "successful" if key in existing_refs else "pending"
            job = MarketReferenceJob(
                uf=key[0], city=key[1], neighborhood="", property_type=key[3],
                representative_property_id=prop.id, status=status,
                priority=_property_priority(prop, True),
            )
            session.add(job)
            existing_jobs[key] = job
            created += 1

        # Add refinements only in cities whose baseline is already persisted.
        covered_city_keys = {(key[0], key[1], key[3]) for key in existing_refs if not key[2]}
        for prop in eligible:
            neighborhood = (prop.neighborhood or "").strip()
            city_key = ((prop.uf or "").strip().upper(), (prop.city or "").strip(),
                        canonical_property_type(prop.property_type))
            if not neighborhood or city_key not in covered_city_keys:
                continue
            key = (city_key[0], city_key[1], neighborhood, city_key[2])
            if key in existing_jobs:
                existing_jobs[key].representative_property_id = prop.id
                existing_jobs[key].priority = _property_priority(prop, False)
                continue
            status = "successful" if key in existing_refs else "pending"
            job = MarketReferenceJob(
                uf=key[0], city=key[1], neighborhood=neighborhood, property_type=key[3],
                representative_property_id=prop.id, status=status,
                priority=_property_priority(prop, False),
            )
            session.add(job)
            # Multiple listings commonly share a neighborhood. Record staged
            # jobs immediately so this same reconciliation pass stays idempotent.
            existing_jobs[key] = job
            created += 1
        session.commit()
    return {"eligible_properties": len(eligible), "city_types": len(representatives), "jobs_created": created}


def _retry_delay(attempt_count: int, empty: bool = False) -> timedelta:
    base_hours = 24 if empty else 2
    return timedelta(hours=min(base_hours * (2 ** max(attempt_count - 1, 0)), 24 * 30))


def _claim_jobs(
    session_factory,
    ufs: list[str],
    limit: int,
    max_age_days: int,
    property_id: int | None,
) -> list[ClaimedMarketJob]:
    """Claim due jobs atomically; PostgreSQL workers skip each other's rows."""
    now = _now()
    cutoff = now - timedelta(days=max_age_days)
    lease_cutoff = now - LEASE_TIMEOUT
    reference_join = and_(
        RegionalMarketPrice.uf == MarketReferenceJob.uf,
        RegionalMarketPrice.city == MarketReferenceJob.city,
        RegionalMarketPrice.neighborhood == MarketReferenceJob.neighborhood,
        RegionalMarketPrice.property_type == MarketReferenceJob.property_type,
    )
    stale_lease = and_(
        MarketReferenceJob.status == "running",
        MarketReferenceJob.updated_at <= lease_cutoff,
    )
    legacy_snapshot = and_(
        RegionalMarketPrice.id.is_not(None),
        MarketReferenceJob.status == "successful",
        RegionalMarketPrice.source != MARKET_REFERENCE_SOURCE,
    )
    due = or_(
        stale_lease,
        and_(
            MarketReferenceJob.status != "running",
            or_(
                MarketReferenceJob.next_attempt_at.is_(None),
                MarketReferenceJob.next_attempt_at <= now,
                legacy_snapshot,
            ),
        ),
    )
    with session_factory() as session:
        stmt = (
            select(MarketReferenceJob, Property, RegionalMarketPrice)
            .join(Property, MarketReferenceJob.representative_property_id == Property.id)
            .outerjoin(RegionalMarketPrice, reference_join)
            .where(
                MarketReferenceJob.uf.in_(ufs),
                Property.status == "active",
                due,
            )
        )
        if property_id is not None:
            stmt = stmt.where(
                MarketReferenceJob.representative_property_id == property_id,
            )
        else:
            stmt = stmt.where(or_(
                stale_lease,
                legacy_snapshot,
                MarketReferenceJob.status != "successful",
                RegionalMarketPrice.id.is_(None),
                RegionalMarketPrice.computed_at < cutoff,
            ))
        stmt = stmt.order_by(
            MarketReferenceJob.priority.asc(),
            MarketReferenceJob.next_attempt_at.asc(),
            MarketReferenceJob.last_attempted_at.asc(),
            MarketReferenceJob.id.asc(),
        ).with_for_update(of=MarketReferenceJob, skip_locked=True)
        if limit:
            stmt = stmt.limit(limit)
        rows = session.execute(stmt).all()
        claimed = []
        for job, prop, _reference in rows:
            claimed_at = _now()
            job.status = "running"
            job.updated_at = claimed_at
            metadata = metadata_from_property(prop)
            metadata.property_type = job.property_type
            metadata.neighborhood = job.neighborhood
            claimed.append(ClaimedMarketJob(
                job_id=job.id,
                neighborhood=job.neighborhood,
                property_type=job.property_type,
                claimed_at=claimed_at,
                metadata=metadata,
            ))
        session.commit()
        return claimed


def _lease_is_current(job, claim: ClaimedMarketJob) -> bool:
    return bool(
        job
        and job.status == "running"
        and _aware(job.updated_at) == claim.claimed_at
    )


def _persist_success(
    session_factory,
    claim: ClaimedMarketJob,
    result,
    max_age_days: int,
) -> tuple[str, int | None]:
    now = _now()
    with session_factory() as session:
        job = session.get(MarketReferenceJob, claim.job_id)
        if not _lease_is_current(job, claim):
            return "lease_lost", None
        prop = session.get(Property, job.representative_property_id)
        if claim.metadata.lat is not None and claim.metadata.lng is not None and prop:
            prop.lat, prop.lng = claim.metadata.lat, claim.metadata.lng
            prop.geocode_status = "ok"
        job.attempt_count += 1
        job.last_attempted_at = now
        job.updated_at = now
        if result.price_per_m2_neighborhood <= 0 or not result.comparable_properties:
            job.status = "empty"
            job.last_error = "No valid comparable listings returned"
            job.next_attempt_at = now + _retry_delay(job.attempt_count, empty=True)
            session.commit()
            return "empty", None

        reference = session.execute(select(RegionalMarketPrice).where(
            RegionalMarketPrice.uf == job.uf,
            RegionalMarketPrice.city == job.city,
            RegionalMarketPrice.neighborhood == job.neighborhood,
            RegionalMarketPrice.property_type == job.property_type,
        )).scalar_one_or_none()
        if reference is None:
            reference = RegionalMarketPrice(
                uf=job.uf,
                city=job.city,
                neighborhood=job.neighborhood,
                property_type=job.property_type,
                price_per_m2=0,
            )
            session.add(reference)
        reference.price_per_m2 = result.price_per_m2_neighborhood
        reference.sample_size = len(result.comparable_properties)
        reference.source = MARKET_REFERENCE_SOURCE
        reference.computed_at = now
        session.flush()
        session.execute(delete(RegionalMarketComparable).where(
            RegionalMarketComparable.reference_id == reference.id,
        ))
        session.add_all([
            RegionalMarketComparable(
                reference_id=reference.id,
                address=comp.address,
                property_type=comp.property_type,
                price=comp.price,
                area_m2=comp.area_m2,
                beds=comp.beds,
                price_per_m2=comp.price_per_m2,
                source=comp.source,
                url=comp.url,
                lat=comp.lat,
                lng=comp.lng,
            )
            for comp in result.comparable_properties
        ])
        job.status = "successful"
        job.last_error = ""
        job.next_attempt_at = now + timedelta(days=max_age_days)
        session.commit()
        return "updated", reference.id


def _persist_failure(session_factory, claim: ClaimedMarketJob, exc: Exception) -> str:
    now = _now()
    with session_factory() as session:
        job = session.get(MarketReferenceJob, claim.job_id)
        if not _lease_is_current(job, claim):
            return "lease_lost"
        job.attempt_count += 1
        job.status = "failed"
        job.last_attempted_at = now
        job.next_attempt_at = now + _retry_delay(job.attempt_count)
        job.last_error = str(exc)[:2000]
        job.updated_at = now
        session.commit()
        return "failed"


async def refresh_references(
    session_factory,
    ufs: list[str],
    limit: int = 10,
    max_age_days: int = 90,
    property_id: int | None = None,
    geocoder=None,
    concurrency: int = DEFAULT_CONCURRENCY,
    collector: MarketReferenceCollector | None = None,
) -> dict:
    started = time.monotonic()
    coverage = reconcile_coverage(session_factory, ufs)
    owns_collector = collector is None
    collector = collector or MarketReferenceCollector()
    summary = {
        **coverage,
        "selected": 0,
        "updated": 0,
        "empty": 0,
        "failed": 0,
        "lease_lost": 0,
        "updated_reference_ids": [],
    }
    owns_geocoder = geocoder is None
    raw_geocoder = None
    batch_geocoder = None

    async def process(claim: ClaimedMarketJob) -> None:
        try:
            await _ensure_subject_coordinates(claim.metadata, batch_geocoder)
            if not claim.neighborhood:
                claim.metadata.address = ""
            comparables = await scrape_comparables(
                claim.metadata,
                geocoder=batch_geocoder,
                collector=collector,
            )
            result = calculate_market(claim.metadata, comparables)
            outcome, reference_id = _persist_success(
                session_factory, claim, result, max_age_days,
            )
            summary[outcome] += 1
            if reference_id is not None:
                summary["updated_reference_ids"].append(reference_id)
        except Exception as exc:
            outcome = _persist_failure(session_factory, claim, exc)
            summary[outcome] += 1
            logger.exception("Market reference job {} failed: {}", claim.job_id, exc)

    async def run_batches() -> None:
        nonlocal raw_geocoder, batch_geocoder
        remaining = limit
        while not limit or remaining > 0:
            batch_limit = concurrency if not limit else min(concurrency, remaining)
            claims = _claim_jobs(
                session_factory, ufs, batch_limit, max_age_days, property_id,
            )
            if not claims:
                break
            summary["selected"] += len(claims)
            if batch_geocoder is None:
                raw_geocoder = geocoder or NominatimClient()
                batch_geocoder = BatchGeocoder(raw_geocoder)
            await asyncio.gather(*(process(claim) for claim in claims))
            if limit:
                remaining -= len(claims)

    try:
        if owns_collector:
            async with collector:
                await run_batches()
        else:
            await run_batches()
    finally:
        if owns_geocoder and raw_geocoder is not None:
            raw_geocoder.close()
    summary["updated_reference_ids"].sort()
    summary["sources"] = collector.metrics_summary()
    summary["duration_seconds"] = round(time.monotonic() - started, 3)
    logger.info("Market coverage refresh: {}", json.dumps(summary))
    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description="Refresh resumable regional market coverage")
    parser.add_argument("--ufs", default="", help="Comma-separated UFs; blank means all active UFs")
    parser.add_argument("--limit", type=int, default=10, help="0 means all currently due jobs")
    parser.add_argument("--max-age-days", type=int, default=90)
    parser.add_argument("--property-id", type=int, default=None)
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    parser.add_argument("--result-file", default="")
    args = parser.parse_args(argv)
    if args.limit < 0:
        parser.error("--limit must be zero or greater")
    if args.max_age_days <= 0:
        parser.error("--max-age-days must be greater than zero")
    if not 1 <= args.concurrency <= 4:
        parser.error("--concurrency must be between 1 and 4")
    engine = get_engine()
    factory = make_session_factory(engine)
    ufs = [value.strip().upper() for value in args.ufs.split(",") if value.strip()]
    if any(not re.fullmatch(r"[A-Z]{2}", uf) for uf in ufs):
        parser.error("--ufs must contain comma-separated two-letter UFs")
    if not ufs:
        with factory() as session:
            ufs = list(session.execute(select(Property.uf).where(
                Property.status == "active", Property.uf.is_not(None),
            ).distinct()).scalars())
    result = asyncio.run(refresh_references(
        factory,
        ufs,
        args.limit,
        args.max_age_days,
        args.property_id,
        concurrency=args.concurrency,
    ))
    if args.result_file:
        Path(args.result_file).write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    print(json.dumps(result, ensure_ascii=False))
    return result


def refresh_exit_code(result: dict[str, int]) -> int:
    """Fail only when selected work produced no usable regional outcome."""
    if result["selected"] and not result["updated"] and not result["empty"]:
        return 1
    return 0


if __name__ == "__main__":
    result = main()
    sys.exit(refresh_exit_code(result))
