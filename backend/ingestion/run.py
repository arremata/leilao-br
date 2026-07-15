"""Ingestion orchestrator: fetch -> normalize -> upsert -> emit change events."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from loguru import logger
from sqlalchemy import select

from db.models import Property, PropertyEvent
from ingestion.adapters.base import NormalizedProperty, SourceAdapter


@dataclass
class IngestSummary:
    inserted: int = 0
    updated: int = 0
    removed: int = 0
    unchanged: int = 0
    events_created: int = 0


def _apply_fields(prop: Property, n: NormalizedProperty) -> None:
    prop.uf = n.uf
    prop.city = n.city
    prop.neighborhood = n.neighborhood
    prop.address = n.address
    prop.property_type = n.property_type
    prop.area_m2 = n.area_m2
    prop.beds = n.beds
    prop.preco = n.preco
    prop.avaliacao = n.avaliacao
    prop.desconto_oficial = n.desconto_oficial
    prop.modalidade = n.modalidade
    prop.descricao_raw = n.descricao_raw
    prop.detail_url = n.detail_url
    prop.raw_payload = n.raw


def ingest(session_factory, adapter: SourceAdapter, geocoder=None) -> IngestSummary:
    summary = IngestSummary()
    raws = adapter.fetch_raw()
    seen_ids: list[str] = []
    now = datetime.now(timezone.utc)

    with session_factory() as session:
        for raw in raws:
            n = adapter.normalize(raw)
            seen_ids.append(n.source_id)
            existing = session.execute(
                select(Property).where(
                    Property.source == adapter.source,
                    Property.source_id == n.source_id,
                )
            ).scalar_one_or_none()

            if existing is None:
                prop = Property(
                    source=adapter.source, source_id=n.source_id,
                    status="active", first_seen_at=now, last_seen_at=now,
                )
                _apply_fields(prop, n)
                if geocoder is not None:
                    coords = geocoder.geocode(prop.address)
                    if coords:
                        prop.lat, prop.lng = coords
                        prop.geocode_status = "ok"
                    else:
                        prop.geocode_status = "failed"
                session.add(prop)
                session.flush()
                session.add(PropertyEvent(
                    property_id=prop.id, event_type="new", new_value=str(n.preco),
                ))
                summary.inserted += 1
                summary.events_created += 1
            else:
                events: list[PropertyEvent] = []
                if existing.preco != n.preco:
                    events.append(PropertyEvent(
                        property_id=existing.id, event_type="price_change",
                        old_value=str(existing.preco), new_value=str(n.preco),
                    ))
                if (existing.modalidade or "") != (n.modalidade or ""):
                    events.append(PropertyEvent(
                        property_id=existing.id, event_type="praca_change",
                        old_value=existing.modalidade, new_value=n.modalidade,
                    ))
                _apply_fields(existing, n)
                existing.last_seen_at = now
                existing.status = "active"
                for ev in events:
                    session.add(ev)
                if events:
                    summary.updated += 1
                    summary.events_created += len(events)
                else:
                    summary.unchanged += 1

        # Removed detection: active rows for this source/uf not seen this run.
        if seen_ids:
            stale = session.execute(
                select(Property).where(
                    Property.source == adapter.source,
                    Property.uf == adapter.uf,
                    Property.status == "active",
                    Property.source_id.notin_(seen_ids),
                )
            ).scalars().all()
            for prop in stale:
                prop.status = "removed"
                session.add(PropertyEvent(
                    property_id=prop.id, event_type="removed", old_value="active",
                ))
                summary.removed += 1
                summary.events_created += 1

        session.commit()

    logger.info(
        f"Ingest[{adapter.source}/{adapter.uf}]: "
        f"+{summary.inserted} ~{summary.updated} -{summary.removed} "
        f"={summary.unchanged} events={summary.events_created}"
    )
    return summary


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Ingest auction listings into the catalog.")
    parser.add_argument("--source", default="caixa", help="Source adapter (default: caixa)")
    parser.add_argument("--uf", default="PR", help="State code, e.g. PR (default: PR)")
    parser.add_argument("--file", default=None, help="Local CSV path to ingest instead of fetching")
    parser.add_argument("--geocode", action="store_true", help="Geocode new rows via Nominatim")
    return parser


def _build_adapter(args):
    from ingestion.adapters.caixa_csv import CaixaCsvAdapter

    if args.source != "caixa":
        raise SystemExit(f"Unknown source: {args.source}")
    csv_bytes = Path(args.file).read_bytes() if args.file else None
    return CaixaCsvAdapter(uf=args.uf, csv_bytes=csv_bytes)


def run_cli(argv=None, session_factory=None) -> IngestSummary:
    args = build_parser().parse_args(argv)
    if session_factory is None:
        from db.base import get_engine, init_db, make_session_factory

        engine = get_engine()
        init_db(engine)
        session_factory = make_session_factory(engine)

    geocoder = None
    if args.geocode:
        from ingestion.geocode import NominatimClient

        geocoder = NominatimClient()

    adapter = _build_adapter(args)
    return ingest(session_factory, adapter, geocoder=geocoder)


def main() -> None:  # pragma: no cover - thin CLI wrapper
    summary = run_cli()
    logger.info(f"Done: {summary}")


if __name__ == "__main__":  # pragma: no cover
    main()
