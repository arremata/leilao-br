"""Scheduled ingestion worker.

Runs the Caixa CSV ingestion for one or more states, isolated from the
frontend-facing API. Fetching the CSV drives a real (headed) Chrome past the
bot manager, so on a headless server this worker must run under a virtual
display (see run-ingest.sh / Dockerfile.ingest, which wrap it with xvfb-run).

A failure ingesting one UF (network, bot-manager CAPTCHA, parse error) must not
abort the others: each UF is isolated and its outcome recorded in the report.
"""

from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
from typing import Callable, Optional

from loguru import logger

from ingestion.adapters.base import SourceAdapter
from ingestion.run import IngestSummary, ingest


@dataclass
class UFResult:
    uf: str
    summary: Optional[IngestSummary] = None
    error: Optional[str] = None


def parse_ufs(raw: str) -> list[str]:
    """Split a comma-separated UF list into upper-cased codes, dropping blanks."""
    return [part.strip().upper() for part in raw.split(",") if part.strip()]


def report_exit_code(report: dict[str, UFResult]) -> int:
    """Return a scheduler-friendly exit code for a completed worker report."""
    return 1 if any(result.error is not None for result in report.values()) else 0


def _default_adapter_factory(uf: str) -> SourceAdapter:
    from ingestion.adapters.caixa_csv import CaixaCsvAdapter

    return CaixaCsvAdapter(uf=uf)


def run_worker(
    ufs: list[str],
    session_factory,
    adapter_factory: Optional[Callable[[str], SourceAdapter]] = None,
    geocoder=None,
    limit: Optional[int] = None,
) -> dict[str, UFResult]:
    """Ingest each UF in turn, isolating per-UF failures.

    Returns a dict mapping each UF to its UFResult (summary on success, error
    message on failure). One UF failing never stops the others.

    limit: if set, only the first N raw listings per UF are processed (upsert +
    photo fetch). Used for partial runs / testing; None = process all.
    """
    if adapter_factory is None:
        adapter_factory = _default_adapter_factory

    report: dict[str, UFResult] = {}
    for uf in ufs:
        try:
            adapter = adapter_factory(uf)
            # One event loop per UF: ingest() is async so the adapter's
            # Playwright session (opened in fetch_raw_async to download the
            # CSV, closed in close_async) stays on a single loop. Cross-loop
            # Playwright objects would hang. Photo URLs are now derived from
            # source_id and HEAD-validated, so no detail-page browser fetch.
            summary = asyncio.run(
                ingest(session_factory, adapter, geocoder=geocoder, limit=limit)
            )
            report[uf] = UFResult(uf=uf, summary=summary)
        except Exception as e:  # isolate: one bad UF must not abort the rest
            logger.error(f"Ingestion failed for UF {uf}: {e}")
            report[uf] = UFResult(uf=uf, error=str(e))
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Scheduled worker: ingest Caixa listings for one or more states."
    )
    parser.add_argument(
        "--ufs", default="PR",
        help="Comma-separated state codes, e.g. PR,SP,RJ (default: PR)",
    )
    parser.add_argument(
        "--geocode", action="store_true", help="Geocode new rows via Nominatim"
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Only ingest the first N listings per UF (testing/partial runs).",
    )
    return parser


def main(argv=None) -> dict[str, UFResult]:  # pragma: no cover - thin CLI wrapper
    args = build_parser().parse_args(argv)

    from db.base import get_engine, init_db, make_session_factory

    engine = get_engine()
    init_db(engine)
    session_factory = make_session_factory(engine)

    geocoder = None
    if args.geocode:
        from ingestion.geocode import NominatimClient

        geocoder = NominatimClient()

    ufs = parse_ufs(args.ufs)
    report = run_worker(ufs, session_factory, geocoder=geocoder, limit=args.limit)

    ok = sum(1 for r in report.values() if r.error is None)
    failed = [uf for uf, r in report.items() if r.error is not None]
    logger.info(f"Worker done: {ok}/{len(report)} UFs ok; failed={failed}")
    return report


if __name__ == "__main__":  # pragma: no cover
    worker_report = main()
    # Per-UF isolation lets healthy states finish, but the process must still
    # fail when any state failed so schedulers and alerts remain trustworthy.
    raise SystemExit(report_exit_code(worker_report))
