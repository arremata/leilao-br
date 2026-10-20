"""Bounded, resumable geocoding outside the authoritative catalog ingest."""

from __future__ import annotations

import argparse
from dataclasses import dataclass

from loguru import logger
from sqlalchemy import select

from db.models import Property
from ingestion.geocode import NominatimClient


@dataclass
class GeocodeSummary:
    selected: int = 0
    updated: int = 0
    not_found: int = 0


def _query_address(prop: Property) -> str:
    return ", ".join(filter(None, [prop.address, prop.neighborhood, prop.city, prop.uf, "Brasil"]))


def run_geocode_batch(
    session_factory, client, *, ufs: list[str] | None = None,
    limit: int = 50, retry_failed: bool = False,
) -> GeocodeSummary:
    """Geocode a bounded batch; identical normalized addresses share one lookup."""
    statuses = ["pending", "failed"] if retry_failed else ["pending"]
    with session_factory() as session:
        query = select(Property).where(
            Property.status == "active",
            Property.lat.is_(None),
            Property.lng.is_(None),
            Property.geocode_status.in_(statuses),
        )
        if ufs:
            query = query.where(Property.uf.in_(ufs))
        selected = [
            (prop.id, _query_address(prop))
            for prop in session.execute(
                query.order_by(Property.id).limit(limit)
            ).scalars()
        ]

    summary = GeocodeSummary(selected=len(selected))
    cache: dict[str, tuple[float, float] | None] = {}
    results: list[tuple[int, tuple[float, float] | None]] = []
    for property_id, address in selected:
        cache_key = " ".join(address.casefold().split())
        if cache_key not in cache:
            cache[cache_key] = client.geocode(address)
        results.append((property_id, cache[cache_key]))

    # Network pacing can make a batch take minutes. Reopen the transaction only
    # after every lookup so geocoding never holds database locks while waiting.
    with session_factory() as session:
        for property_id, coords in results:
            prop = session.get(Property, property_id)
            if prop is None:
                continue
            if coords is None:
                prop.geocode_status = "failed"
                summary.not_found += 1
            else:
                prop.lat, prop.lng = coords
                prop.geocode_status = "ok"
                summary.updated += 1
        session.commit()
    logger.info(
        "Geocoding: selected={} updated={} not_found={}",
        summary.selected, summary.updated, summary.not_found,
    )
    return summary


def main(argv=None) -> GeocodeSummary:
    parser = argparse.ArgumentParser(description="Geocode a bounded catalog batch")
    parser.add_argument("--ufs", default="", help="Comma-separated UFs; blank means all")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--retry-failed", action="store_true")
    args = parser.parse_args(argv)
    if args.limit < 1:
        raise SystemExit("--limit must be greater than zero")

    from db.base import get_engine, init_db, make_session_factory

    engine = get_engine()
    init_db(engine)
    client = NominatimClient()
    try:
        return run_geocode_batch(
            make_session_factory(engine), client,
            ufs=[part.strip().upper() for part in args.ufs.split(",") if part.strip()],
            limit=args.limit, retry_failed=args.retry_failed,
        )
    finally:
        client.close()


if __name__ == "__main__":  # pragma: no cover
    main()
