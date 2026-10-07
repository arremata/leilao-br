"""Materialize cached analyses with a fixed number of database queries."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone

from loguru import logger
from sqlalchemy import func, select

from db.base import get_engine, make_session_factory
from db.models import (
    CityExpenseReference, Enrichment, Property, PropertyEvent,
    RegionalMarketComparable, RegionalMarketPrice,
)
from enrichment.market_coverage import (
    build_market_reference_index, is_eligible_market_property, normalize_text,
    resolve_market_reference_from_index,
)
from enrichment.property_expenses import apply_property_expenses
from enrichment.run import PIPELINE_VERSION, metadata_from_property, run_structured_enrichment
from graph.state import ComparableProperty


def _aware(value):
    return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value


def analysis_is_current(
    existing: Enrichment | None,
    reference,
    property_change_time,
    expense_reference: CityExpenseReference | None,
) -> bool:
    if existing is None or existing.pipeline_version != PIPELINE_VERSION:
        return False
    enrichment_time = _aware(existing.computed_at)
    reference_time = _aware(reference.computed_at)
    property_change_time = _aware(property_change_time)
    expense_reference_time = _aware(
        expense_reference.updated_at if expense_reference else None,
    )
    return bool(
        (not reference_time or (enrichment_time and enrichment_time >= reference_time))
        and (
            not expense_reference_time
            or (enrichment_time and enrichment_time >= expense_reference_time)
        )
        and (
            not property_change_time
            or (enrichment_time and enrichment_time >= property_change_time)
        )
    )


def load_analysis_state(
    session,
    ufs: list[str],
    reference_ids: set[int] | None = None,
    *,
    include_comparables: bool = True,
):
    """Load materialization/report state without per-property queries."""
    properties = session.execute(select(Property).where(
        Property.status == "active",
        Property.uf.in_(ufs),
        Property.area_m2.is_not(None),
        Property.area_m2 > 0,
    ).order_by(Property.last_seen_at.desc())).scalars().all()
    references = session.execute(select(RegionalMarketPrice).where(
        RegionalMarketPrice.uf.in_(ufs),
        RegionalMarketPrice.price_per_m2 > 0,
    )).scalars().all()
    reference_index = build_market_reference_index(references)

    no_reference = 0
    skipped_unaffected = 0
    eligible_count = 0
    candidates = []
    for prop in properties:
        if not is_eligible_market_property(prop):
            no_reference += 1
            continue
        eligible_count += 1
        reference = resolve_market_reference_from_index(reference_index, prop)
        if reference is None:
            no_reference += 1
            continue
        if reference_ids is not None and not reference_ids.intersection(reference.reference_ids):
            skipped_unaffected += 1
            continue
        candidates.append((prop, reference))

    property_ids = [prop.id for prop, _ in candidates]
    used_reference_ids = {
        reference_id
        for _, reference in candidates
        for reference_id in reference.reference_ids
    }
    enrichments = {
        item.property_id: item
        for item in session.execute(select(Enrichment).where(
            Enrichment.property_id.in_(property_ids),
        )).scalars()
    } if property_ids else {}
    event_times = dict(session.execute(
        select(PropertyEvent.property_id, func.max(PropertyEvent.occurred_at))
        .where(PropertyEvent.property_id.in_(property_ids))
        .group_by(PropertyEvent.property_id)
    ).all()) if property_ids else {}
    expense_references = {
        ((item.uf or "").upper(), normalize_text(item.city)): item
        for item in session.execute(select(CityExpenseReference).where(
            CityExpenseReference.uf.in_(ufs),
        )).scalars()
    }
    comparables_by_reference = defaultdict(list)
    if include_comparables and used_reference_ids:
        for item in session.execute(select(RegionalMarketComparable).where(
            RegionalMarketComparable.reference_id.in_(used_reference_ids),
        ).order_by(RegionalMarketComparable.price_per_m2)).scalars():
            comparables_by_reference[item.reference_id].append(item)
    return {
        "candidates": candidates,
        "eligible_count": eligible_count,
        "no_reference": no_reference,
        "skipped_unaffected": skipped_unaffected,
        "enrichments": enrichments,
        "event_times": event_times,
        "expense_references": expense_references,
        "comparables_by_reference": comparables_by_reference,
    }


def materialize_analyses(
    session_factory,
    ufs: list[str],
    limit: int = 0,
    force: bool = False,
    reference_ids: set[int] | None = None,
) -> dict[str, int]:
    """Persist missing or stale analyses, optionally scoped to changed references."""
    summary = {
        "selected": 0, "updated": 0, "current": 0,
        "no_reference": 0, "skipped_unaffected": 0, "failed": 0,
    }
    with session_factory() as session:
        state = load_analysis_state(session, ufs, reference_ids)
        summary["no_reference"] = state["no_reference"]
        summary["skipped_unaffected"] = state["skipped_unaffected"]
        pending_writes = 0
        for prop, reference in state["candidates"]:
            existing = state["enrichments"].get(prop.id)
            expense_reference = state["expense_references"].get((
                (prop.uf or "").upper(), normalize_text(prop.city),
            ))
            if analysis_is_current(
                existing, reference, state["event_times"].get(prop.id),
                expense_reference,
            ) and not force:
                summary["current"] += 1
                continue
            if limit and summary["selected"] >= limit:
                break
            summary["selected"] += 1
            try:
                rows = [
                    item
                    for reference_id in reference.reference_ids
                    for item in state["comparables_by_reference"].get(reference_id, [])
                ]
                comparables = [
                    ComparableProperty(
                        address=item.address, property_type=item.property_type,
                        price=item.price, area_m2=item.area_m2, beds=item.beds,
                        price_per_m2=item.price_per_m2, source=item.source,
                        url=item.url, lat=item.lat, lng=item.lng,
                    )
                    for item in rows
                ]
                result = run_structured_enrichment(
                    metadata_from_property(prop),
                    pdf_texts=prop.descricao_raw or "",
                    auction_url=prop.detail_url or "",
                    regional_price_per_m2=reference.price_per_m2,
                    regional_comparables=comparables,
                )
                apply_property_expenses(result, prop, expense_reference)
                result_json = result.model_dump_json(by_alias=True)
                now = datetime.now(timezone.utc)
                if existing:
                    existing.result_json = result_json
                    existing.pipeline_version = PIPELINE_VERSION
                    existing.computed_at = now
                else:
                    existing = Enrichment(
                        property_id=prop.id, result_json=result_json,
                        pipeline_version=PIPELINE_VERSION, computed_at=now,
                    )
                    session.add(existing)
                    state["enrichments"][prop.id] = existing
                summary["updated"] += 1
                pending_writes += 1
                if pending_writes >= 25:
                    session.commit()
                    pending_writes = 0
            except Exception as exc:  # keep the rest of the catalog progressing
                summary["failed"] += 1
                logger.exception("Analysis materialization failed for property {}: {}", prop.id, exc)
        if pending_writes:
            session.commit()

    logger.info("Analysis materialization complete: {}", json.dumps(summary))
    return summary


def main(argv: list[str] | None = None) -> dict[str, int]:
    parser = argparse.ArgumentParser(description="Materialize cached catalog analyses")
    parser.add_argument("--ufs", default="PR")
    parser.add_argument("--limit", type=int, default=0, help="0 processes every eligible property")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--reference-ids", default="")
    args = parser.parse_args(argv)
    if args.limit < 0:
        parser.error("--limit must be zero or greater")
    try:
        reference_ids = {
            int(value) for value in args.reference_ids.split(",") if value.strip()
        }
    except ValueError:
        parser.error("--reference-ids must contain comma-separated integers")

    engine = get_engine()
    factory = make_session_factory(engine)
    ufs = [value.strip().upper() for value in args.ufs.split(",") if value.strip()]
    if not ufs:
        with factory() as session:
            ufs = list(session.execute(select(Property.uf).where(
                Property.status == "active", Property.uf.is_not(None),
            ).distinct()).scalars())
    return materialize_analyses(
        factory, ufs, args.limit, args.force, reference_ids or None,
    )


if __name__ == "__main__":
    result = main()
    if result["failed"]:
        raise SystemExit(1)
