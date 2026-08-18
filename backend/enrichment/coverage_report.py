"""Machine-readable production coverage report for scheduled workflows."""

from __future__ import annotations

import argparse
import json

from sqlalchemy import select

from db.base import get_engine, init_db, make_session_factory
from db.models import Enrichment, MarketReferenceJob, Property
from enrichment.market_coverage import is_eligible_market_property, resolve_market_reference


def build_report(session_factory, ufs: list[str]) -> dict:
    with session_factory() as session:
        stmt = select(Property).where(Property.status == "active")
        if ufs:
            stmt = stmt.where(Property.uf.in_(ufs))
        properties = [prop for prop in session.execute(stmt).scalars() if is_eligible_market_property(prop)]
        enriched_ids = set(session.execute(select(Enrichment.property_id)).scalars())
        with_reference = sum(resolve_market_reference(session, prop) is not None for prop in properties)
        analyzed = sum(prop.id in enriched_ids for prop in properties)
        job_stmt = select(MarketReferenceJob)
        if ufs:
            job_stmt = job_stmt.where(MarketReferenceJob.uf.in_(ufs))
        jobs = session.execute(job_stmt).scalars().all()
    statuses = {}
    for job in jobs:
        statuses[job.status] = statuses.get(job.status, 0) + 1
    total = len(properties)
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
    init_db(engine)
    factory = make_session_factory(engine)
    ufs = [value.strip().upper() for value in args.ufs.split(",") if value.strip()]
    report = build_report(factory, ufs)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.require_complete and report["properties_with_reference"] < report["eligible_properties"]:
        raise SystemExit(1)
    return report


if __name__ == "__main__":
    main()
