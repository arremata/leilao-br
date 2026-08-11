"""Periodic worker that refreshes neighborhood price/m² references.

This is the only runtime path that uses listing-site Playwright scrapers.
User-triggered property analysis reads the resulting database table only.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone

from loguru import logger
from sqlalchemy import delete, select

from db.base import get_engine, init_db, make_session_factory
from db.models import Property, RegionalMarketComparable, RegionalMarketPrice
from enrichment.run import metadata_from_property
from graph.market import calculate_market
from tools.property_scraper import scrape_comparables


def _region_key(prop: Property) -> tuple[str, str, str, str]:
    return (
        prop.uf or "", prop.city or "", prop.neighborhood or "",
        prop.property_type or "",
    )


async def refresh_references(
    session_factory,
    ufs: list[str],
    limit: int = 10,
    max_age_days: int = 90,
    property_id: int | None = None,
) -> dict[str, int]:
    """Refresh at most ``limit`` missing/stale regional references."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    with session_factory() as session:
        stmt = select(Property).where(
                Property.status == "active",
                Property.uf.in_(ufs),
                Property.area_m2.is_not(None),
                Property.area_m2 > 0,
                Property.city.is_not(None),
                Property.neighborhood.is_not(None),
            )
        if property_id is not None:
            stmt = stmt.where(Property.id == property_id)
        props = session.execute(stmt.order_by(Property.last_seen_at.desc())).scalars().all()
        references = {
            (ref.uf, ref.city, ref.neighborhood, ref.property_type): ref
            for ref in session.execute(select(RegionalMarketPrice)).scalars().all()
        }

    candidates: list[Property] = []
    seen: set[tuple[str, str, str, str]] = set()
    for prop in props:
        key = _region_key(prop)
        if key in seen or not key[1] or not key[2]:
            continue
        seen.add(key)
        ref = references.get(key)
        computed_at = ref.computed_at if ref else None
        if computed_at and computed_at.tzinfo is None:
            computed_at = computed_at.replace(tzinfo=timezone.utc)
        if property_id is None and ref and computed_at and computed_at >= cutoff:
            continue
        candidates.append(prop)
        if len(candidates) >= limit:
            break

    summary = {"selected": len(candidates), "updated": 0, "empty": 0, "failed": 0}
    for prop in candidates:
        key = _region_key(prop)
        try:
            metadata = metadata_from_property(prop)
            comparables = await scrape_comparables(metadata)
            result = calculate_market(metadata, comparables)
            if result.price_per_m2_neighborhood <= 0 or not result.comparable_properties:
                summary["empty"] += 1
                logger.warning("No market reference found for {}", key)
                continue

            with session_factory() as session:
                ref = session.execute(select(RegionalMarketPrice).where(
                    RegionalMarketPrice.uf == key[0],
                    RegionalMarketPrice.city == key[1],
                    RegionalMarketPrice.neighborhood == key[2],
                    RegionalMarketPrice.property_type == key[3],
                )).scalar_one_or_none()
                if ref is None:
                    ref = RegionalMarketPrice(
                        uf=key[0], city=key[1], neighborhood=key[2],
                        property_type=key[3], price_per_m2=0,
                    )
                    session.add(ref)
                ref.price_per_m2 = result.price_per_m2_neighborhood
                ref.sample_size = len(result.comparable_properties)
                ref.source = "listing_median"
                ref.computed_at = datetime.now(timezone.utc)
                session.flush()
                session.execute(delete(RegionalMarketComparable).where(
                    RegionalMarketComparable.reference_id == ref.id,
                ))
                for comp in result.comparable_properties:
                    session.add(RegionalMarketComparable(
                        reference_id=ref.id,
                        address=comp.address,
                        price=comp.price,
                        area_m2=comp.area_m2,
                        price_per_m2=comp.price_per_m2,
                        source=comp.source,
                        url=comp.url,
                    ))
                session.commit()
            summary["updated"] += 1
        except Exception as exc:  # keep other regions progressing
            summary["failed"] += 1
            logger.exception("Market reference refresh failed for {}: {}", key, exc)

    logger.info("Market reference refresh complete: {}", summary)
    return summary


def main(argv: list[str] | None = None) -> dict[str, int]:
    parser = argparse.ArgumentParser(description="Refresh regional market prices")
    parser.add_argument("--ufs", default="PR")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--max-age-days", type=int, default=90)
    parser.add_argument("--property-id", type=int, default=None)
    args = parser.parse_args(argv)

    engine = get_engine()
    init_db(engine)
    factory = make_session_factory(engine)
    ufs = [value.strip().upper() for value in args.ufs.split(",") if value.strip()]
    return asyncio.run(refresh_references(
        factory, ufs, args.limit, args.max_age_days, args.property_id,
    ))


if __name__ == "__main__":
    result = main()
    # A scheduled run that selected work but persisted nothing must not look
    # healthy in GitHub Actions. Empty/blocked sources need operator attention.
    if result["failed"] or (result["selected"] and not result["updated"]):
        sys.exit(1)
