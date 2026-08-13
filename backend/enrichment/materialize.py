"""Materialize cached property analyses from persisted market references.

The public Vercel API is deliberately read-only.  This worker performs the
deterministic analysis ahead of time and stores one shared result per property,
so opening a detail page only needs a database read.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone

from loguru import logger
from sqlalchemy import func, select

from db.base import get_engine, init_db, make_session_factory
from db.models import (
    Enrichment, Property, PropertyEvent, RegionalMarketComparable, RegionalMarketPrice,
)
from enrichment.run import PIPELINE_VERSION, metadata_from_property, run_structured_enrichment
from graph.state import ComparableProperty


def materialize_analyses(
    session_factory,
    ufs: list[str],
    limit: int = 0,
    force: bool = False,
) -> dict[str, int]:
    """Persist missing or stale analyses that have a regional market reference."""
    summary = {"selected": 0, "updated": 0, "current": 0, "no_reference": 0, "failed": 0}

    with session_factory() as session:
        stmt = select(Property).where(
            Property.status == "active",
            Property.uf.in_(ufs),
            Property.area_m2.is_not(None),
            Property.area_m2 > 0,
        ).order_by(Property.last_seen_at.desc())
        properties = session.execute(stmt).scalars().all()

    for prop in properties:
        with session_factory() as session:
            reference = session.execute(select(RegionalMarketPrice).where(
                RegionalMarketPrice.uf == (prop.uf or ""),
                RegionalMarketPrice.city == (prop.city or ""),
                RegionalMarketPrice.neighborhood == (prop.neighborhood or ""),
                RegionalMarketPrice.property_type == (prop.property_type or ""),
            )).scalar_one_or_none()
            if reference is None or reference.price_per_m2 <= 0:
                summary["no_reference"] += 1
                continue

            existing = session.execute(select(Enrichment).where(
                Enrichment.property_id == prop.id,
            )).scalar_one_or_none()
            property_change_time = session.execute(
                select(func.max(PropertyEvent.occurred_at)).where(
                    PropertyEvent.property_id == prop.id,
                )
            ).scalar_one_or_none()
            reference_time = reference.computed_at
            enrichment_time = existing.computed_at if existing else None
            if reference_time and reference_time.tzinfo is None:
                reference_time = reference_time.replace(tzinfo=timezone.utc)
            if enrichment_time and enrichment_time.tzinfo is None:
                enrichment_time = enrichment_time.replace(tzinfo=timezone.utc)
            if property_change_time and property_change_time.tzinfo is None:
                property_change_time = property_change_time.replace(tzinfo=timezone.utc)
            is_current = (
                existing is not None
                and existing.pipeline_version == PIPELINE_VERSION
                and (not reference_time or (enrichment_time and enrichment_time >= reference_time))
                and (
                    not property_change_time
                    or (enrichment_time and enrichment_time >= property_change_time)
                )
            )
            if is_current and not force:
                summary["current"] += 1
                continue
            if limit and summary["selected"] >= limit:
                break
            summary["selected"] += 1

            try:
                comparables = [
                    ComparableProperty(
                        address=item.address, price=item.price, area_m2=item.area_m2,
                        price_per_m2=item.price_per_m2, source=item.source, url=item.url,
                    )
                    for item in session.execute(
                        select(RegionalMarketComparable).where(
                            RegionalMarketComparable.reference_id == reference.id,
                        ).order_by(RegionalMarketComparable.price_per_m2)
                    ).scalars().all()
                ]
                result = run_structured_enrichment(
                    metadata_from_property(prop),
                    pdf_texts=prop.descricao_raw or "",
                    auction_url=prop.detail_url or "",
                    regional_price_per_m2=reference.price_per_m2,
                    regional_comparables=comparables,
                )
                result_json = result.model_dump_json(by_alias=True)
                now = datetime.now(timezone.utc)
                if existing:
                    existing.result_json = result_json
                    existing.pipeline_version = PIPELINE_VERSION
                    existing.computed_at = now
                else:
                    session.add(Enrichment(
                        property_id=prop.id,
                        result_json=result_json,
                        pipeline_version=PIPELINE_VERSION,
                        computed_at=now,
                    ))
                session.commit()
                summary["updated"] += 1
            except Exception as exc:  # keep the rest of the catalog progressing
                session.rollback()
                summary["failed"] += 1
                logger.exception("Analysis materialization failed for property {}: {}", prop.id, exc)

    logger.info("Analysis materialization complete: {}", json.dumps(summary))
    return summary


def main(argv: list[str] | None = None) -> dict[str, int]:
    parser = argparse.ArgumentParser(description="Materialize cached catalog analyses")
    parser.add_argument("--ufs", default="PR")
    parser.add_argument("--limit", type=int, default=0, help="0 processes every eligible property")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args(argv)

    engine = get_engine()
    init_db(engine)
    factory = make_session_factory(engine)
    ufs = [value.strip().upper() for value in args.ufs.split(",") if value.strip()]
    return materialize_analyses(factory, ufs, args.limit, args.force)


if __name__ == "__main__":
    result = main()
    if result["failed"]:
        raise SystemExit(1)
