"""Import sourced city expense references and refresh affected analyses."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from db.base import get_engine, init_db, make_session_factory
from db.models import CityExpenseReference
from enrichment.materialize import materialize_analyses


def validate_reference(item: dict) -> dict:
    required = {"uf", "city", "annual_iptu_rate", "condo_per_m2_monthly", "reference_year", "source"}
    missing = required - item.keys()
    if missing:
        raise ValueError(f"Missing fields: {', '.join(sorted(missing))}")
    result = {
        "uf": str(item["uf"]).strip().upper(),
        "city": str(item["city"]).strip(),
        "annual_iptu_rate": float(item["annual_iptu_rate"]),
        "condo_per_m2_monthly": float(item["condo_per_m2_monthly"]),
        "reference_year": int(item["reference_year"]),
        "source": str(item["source"]).strip(),
    }
    if len(result["uf"]) != 2 or not result["city"] or not result["source"]:
        raise ValueError("UF, city and source must be populated")
    if not 0 < result["annual_iptu_rate"] <= 0.1:
        raise ValueError("annual_iptu_rate must be between 0 and 0.1")
    if not 0 <= result["condo_per_m2_monthly"] <= 100:
        raise ValueError("condo_per_m2_monthly must be between 0 and 100")
    return result


def upsert_references(session_factory, items: list[dict]) -> dict:
    validated = [validate_reference(item) for item in items]
    summary = {"selected": len(validated), "created": 0, "updated": 0}
    with session_factory() as session:
        for item in validated:
            reference = session.execute(select(CityExpenseReference).where(
                CityExpenseReference.uf == item["uf"],
                CityExpenseReference.city == item["city"],
            )).scalar_one_or_none()
            if reference is None:
                reference = CityExpenseReference(**item)
                session.add(reference)
                summary["created"] += 1
            else:
                for key, value in item.items():
                    setattr(reference, key, value)
                reference.updated_at = datetime.now(timezone.utc)
                summary["updated"] += 1
        session.commit()
    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description="Persist sourced city expense references")
    parser.add_argument("--file", required=True, help="JSON file containing a list of references")
    parser.add_argument("--materialize", action="store_true")
    args = parser.parse_args(argv)
    items = json.loads(Path(args.file).read_text(encoding="utf-8"))
    if not isinstance(items, list) or not items:
        raise ValueError("Reference file must contain a non-empty JSON list")
    engine = get_engine()
    init_db(engine)
    factory = make_session_factory(engine)
    summary = upsert_references(factory, items)
    if args.materialize:
        summary["materialization"] = materialize_analyses(
            factory, sorted({validate_reference(item)["uf"] for item in items}), force=False,
        )
    print(json.dumps(summary, ensure_ascii=False))
    return summary


if __name__ == "__main__":
    main()
