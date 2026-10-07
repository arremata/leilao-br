"""Machine-readable production coverage report for scheduled workflows."""

from __future__ import annotations

import argparse
import json

from sqlalchemy import func, select

from db.base import get_engine, make_session_factory
from db.models import MarketReferenceJob, Property
from enrichment.materialize import analysis_is_current, load_analysis_state
from enrichment.market_coverage import normalize_text


def build_report(session_factory, ufs: list[str]) -> dict:
    with session_factory() as session:
        scoped_ufs = ufs or list(session.execute(select(Property.uf).where(
            Property.status == "active",
            Property.uf.is_not(None),
        ).distinct()).scalars())
        state = load_analysis_state(
            session, scoped_ufs, include_comparables=False,
        )
        analyzed = 0
        for prop, reference in state["candidates"]:
            expense_reference = state["expense_references"].get((
                (prop.uf or "").upper(), normalize_text(prop.city),
            ))
            if analysis_is_current(
                state["enrichments"].get(prop.id),
                reference,
                state["event_times"].get(prop.id),
                expense_reference,
            ):
                analyzed += 1

        job_stmt = select(
            MarketReferenceJob.status,
            func.count(MarketReferenceJob.id),
        ).join(
            Property,
            MarketReferenceJob.representative_property_id == Property.id,
        ).where(
            Property.status == "active",
            MarketReferenceJob.uf.in_(scoped_ufs),
        ).group_by(MarketReferenceJob.status)
        statuses = dict(session.execute(job_stmt).all())

    total = state["eligible_count"]
    with_reference = len(state["candidates"])
    return {
        "eligible_properties": total,
        "properties_with_reference": with_reference,
        "properties_analyzed": analyzed,
        "reference_coverage_percent": round(with_reference / total * 100, 2) if total else 100.0,
        "analysis_coverage_percent": round(analyzed / total * 100, 2) if total else 100.0,
        "jobs_by_status": statuses,
    }


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--ufs", default="")
    parser.add_argument("--require-complete", action="store_true")
    args = parser.parse_args(argv)
    engine = get_engine()
    factory = make_session_factory(engine)
    ufs = [value.strip().upper() for value in args.ufs.split(",") if value.strip()]
    report = build_report(factory, ufs)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.require_complete and report["properties_with_reference"] < report["eligible_properties"]:
        raise SystemExit(1)
    return report


if __name__ == "__main__":
    main()
