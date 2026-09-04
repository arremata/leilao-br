"""Resumable market-reference coverage worker.

The worker reconciles every eligible active catalog city/type into a durable
queue. City baselines are completed before optional neighborhood refinement;
empty/blocked sources back off instead of starving the rest of the catalog.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime, timedelta, timezone

from loguru import logger
from sqlalchemy import delete, select

from db.base import get_engine, init_db, make_session_factory
from db.models import (
    MarketReferenceJob, Property, RegionalMarketComparable, RegionalMarketPrice,
)
from enrichment.market_coverage import canonical_property_type, is_eligible_market_property
from enrichment.run import metadata_from_property
from graph.market import calculate_market
from ingestion.geocode import NominatimClient
from tools.property_scraper import scrape_comparables


MARKET_REFERENCE_SOURCE = "listing_median_confidence_v2"


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
    query = ", ".join(part for part in (
        metadata.address.strip(), metadata.city.strip(), metadata.state.strip(), "Brasil",
    ) if part)
    try:
        coordinates = await asyncio.to_thread(geocoder.geocode, query)
    except Exception as exc:
        logger.warning("Market reference subject geocoding failed: {}", exc)
        return
    if coordinates:
        metadata.lat, metadata.lng = coordinates


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
            for job in session.execute(select(MarketReferenceJob)).scalars().all()
        }
        existing_refs = {
            (ref.uf, ref.city, ref.neighborhood, ref.property_type)
            for ref in session.execute(select(RegionalMarketPrice).where(
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
                existing_jobs[key].priority = min(existing_jobs[key].priority, _property_priority(prop, True))
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
                existing_jobs[key].priority = min(existing_jobs[key].priority, _property_priority(prop, False))
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


async def refresh_references(
    session_factory, ufs: list[str], limit: int = 10, max_age_days: int = 90,
    property_id: int | None = None, geocoder=None,
) -> dict[str, int]:
    coverage = reconcile_coverage(session_factory, ufs)
    owns_geocoder = geocoder is None
    geocoder = geocoder or NominatimClient()
    now = _now()
    cutoff = now - timedelta(days=max_age_days)
    with session_factory() as session:
        # Load every job in scope so successful legacy snapshots can bypass a
        # future next_attempt_at once. Their comparables predate the confidence
        # inputs (type, bedrooms and coordinates), so treating them as fresh
        # would leave every rematerialized analysis artificially low until the
        # normal 90-day expiry.
        stmt = select(MarketReferenceJob).where(MarketReferenceJob.uf.in_(ufs))
        if property_id is not None:
            stmt = stmt.where(MarketReferenceJob.representative_property_id == property_id)
        jobs = session.execute(stmt.order_by(
            MarketReferenceJob.priority.asc(), MarketReferenceJob.next_attempt_at.asc(),
            MarketReferenceJob.last_attempted_at.asc(), MarketReferenceJob.id.asc(),
        )).scalars().all()
        candidates = []
        for job in jobs:
            reference = session.execute(select(RegionalMarketPrice).where(
                RegionalMarketPrice.uf == job.uf, RegionalMarketPrice.city == job.city,
                RegionalMarketPrice.neighborhood == job.neighborhood,
                RegionalMarketPrice.property_type == job.property_type,
            )).scalar_one_or_none()
            legacy_snapshot = bool(
                reference
                and job.status == "successful"
                and reference.source != MARKET_REFERENCE_SOURCE
            )
            attempt_due = job.next_attempt_at is None or _aware(job.next_attempt_at) <= now
            if not attempt_due and not legacy_snapshot:
                continue
            fresh = reference and _aware(reference.computed_at) >= cutoff
            if (
                property_id is None
                and job.status == "successful"
                and fresh
                and not legacy_snapshot
            ):
                continue
            candidates.append(job.id)
            if limit and len(candidates) >= limit:
                break

    summary = {**coverage, "selected": len(candidates), "updated": 0, "empty": 0, "failed": 0}
    for job_id in candidates:
        with session_factory() as session:
            job = session.get(MarketReferenceJob, job_id)
            prop = session.get(Property, job.representative_property_id) if job else None
            if not job or not prop:
                continue
            try:
                metadata = metadata_from_property(prop)
                metadata.property_type = job.property_type
                metadata.neighborhood = job.neighborhood
                await _ensure_subject_coordinates(metadata, geocoder)
                if not job.neighborhood:  # city baseline must not accidentally search one street
                    metadata.address = ""
                comparables = await scrape_comparables(metadata, geocoder=geocoder)
                if metadata.lat is not None and metadata.lng is not None:
                    prop.lat, prop.lng = metadata.lat, metadata.lng
                    prop.geocode_status = "ok"
                result = calculate_market(metadata, comparables)
                job.attempt_count += 1
                job.last_attempted_at = now
                job.updated_at = now
                if result.price_per_m2_neighborhood <= 0 or not result.comparable_properties:
                    job.status = "empty"
                    job.last_error = "No valid comparable listings returned"
                    job.next_attempt_at = now + _retry_delay(job.attempt_count, empty=True)
                    session.commit()
                    summary["empty"] += 1
                    continue

                reference = session.execute(select(RegionalMarketPrice).where(
                    RegionalMarketPrice.uf == job.uf, RegionalMarketPrice.city == job.city,
                    RegionalMarketPrice.neighborhood == job.neighborhood,
                    RegionalMarketPrice.property_type == job.property_type,
                )).scalar_one_or_none()
                if reference is None:
                    reference = RegionalMarketPrice(
                        uf=job.uf, city=job.city, neighborhood=job.neighborhood,
                        property_type=job.property_type, price_per_m2=0,
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
                for comp in result.comparable_properties:
                    session.add(RegionalMarketComparable(
                        reference_id=reference.id, address=comp.address,
                        property_type=comp.property_type, price=comp.price,
                        area_m2=comp.area_m2, beds=comp.beds,
                        price_per_m2=comp.price_per_m2,
                        source=comp.source, url=comp.url,
                        lat=comp.lat, lng=comp.lng,
                    ))
                job.status = "successful"
                job.last_error = ""
                job.next_attempt_at = now + timedelta(days=max_age_days)
                session.commit()
                summary["updated"] += 1
            except Exception as exc:
                session.rollback()
                job = session.get(MarketReferenceJob, job_id)
                if job:
                    job.attempt_count += 1
                    job.status = "failed"
                    job.last_attempted_at = now
                    job.next_attempt_at = now + _retry_delay(job.attempt_count)
                    job.last_error = str(exc)[:2000]
                    job.updated_at = now
                    session.commit()
                summary["failed"] += 1
                logger.exception("Market reference job {} failed: {}", job_id, exc)
    if owns_geocoder:
        geocoder.close()
    logger.info("Market coverage refresh: {}", json.dumps(summary))
    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description="Refresh resumable regional market coverage")
    parser.add_argument("--ufs", default="", help="Comma-separated UFs; blank means all active UFs")
    parser.add_argument("--limit", type=int, default=10, help="0 means all currently due jobs")
    parser.add_argument("--max-age-days", type=int, default=90)
    parser.add_argument("--property-id", type=int, default=None)
    args = parser.parse_args(argv)
    engine = get_engine()
    init_db(engine)
    factory = make_session_factory(engine)
    ufs = [value.strip().upper() for value in args.ufs.split(",") if value.strip()]
    if not ufs:
        with factory() as session:
            ufs = list(session.execute(select(Property.uf).where(
                Property.status == "active", Property.uf.is_not(None),
            ).distinct()).scalars())
    return asyncio.run(refresh_references(factory, ufs, args.limit, args.max_age_days, args.property_id))


if __name__ == "__main__":
    result = main()
    if result["failed"] or (result["selected"] and not result["updated"] and not result["empty"]):
        sys.exit(1)
