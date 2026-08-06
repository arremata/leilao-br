"""Ingestion orchestrator: fetch -> normalize -> upsert -> emit change events."""

from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Optional
from urllib import request as urllib_request

from loguru import logger
from sqlalchemy import select

from db.models import Property, PropertyEvent
from ingestion.adapters.base import NormalizedProperty, SourceAdapter


# Default HEAD validator: returns True when the photo URL responds 200 with an
# image/* body. Uses stdlib urllib so no extra dependency. The /fotos/ path is
# not behind Radware, so a plain HTTP HEAD passes; HEAD fetches headers only
# (the server ignores Range, so a ranged GET would pull the whole image -- we
# must NOT do that). Injected in tests.
_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def _default_validate_photo_url(url: str, timeout: float = 10.0) -> bool:
    """True when `url` is a reachable image. HEAD-only (no body downloaded)."""
    req = urllib_request.Request(url, method="HEAD", headers={"User-Agent": _UA})
    try:
        with urllib_request.urlopen(req, timeout=timeout) as resp:
            ctype = (resp.headers.get("Content-Type") or "").lower()
            return resp.status == 200 and ctype.startswith("image/")
    except Exception as e:  # 404, DNS, timeout, etc. -> not a valid photo
        logger.debug(f"photo HEAD failed for {url}: {e}")
        return False


# Max concurrent photo HEAD requests. /fotos/ is NOT behind Radware, so plain
# HTTP is safe to parallelize (unlike browser detail-page fetches). Bounded so
# we don't open hundreds of sockets at once against the Caixa origin.
PHOTO_VALIDATION_CONCURRENCY = 16


async def _validate_photos_concurrently(
    urls: list[str],
    validate_photo_url: Callable[[str], bool],
    concurrency: int = PHOTO_VALIDATION_CONCURRENCY,
) -> list[bool]:
    """HEAD-validate a batch of photo URLs concurrently, preserving order.

    Each (sync, blocking) validator call runs in a worker thread via
    asyncio.to_thread; a semaphore bounds how many run at once. Returns one
    bool per input url (False on 404 / error / timeout).
    """
    if not urls:
        return []
    sem = asyncio.Semaphore(concurrency)

    async def _one(url: str) -> bool:
        async with sem:
            return await asyncio.to_thread(validate_photo_url, url)

    return await asyncio.gather(*[_one(u) for u in urls])


@dataclass
class IngestSummary:
    inserted: int = 0
    updated: int = 0
    removed: int = 0
    unchanged: int = 0
    events_created: int = 0
    dates_updated: int = 0
    dates_failed: int = 0
    dates_deferred: int = 0


def _preco_changed(old: float | None, new: float | None) -> bool:
    """True when the price changed by at least half a cent.

    A plain float `!=` treats representation noise as a real change, which
    would emit spurious price_change events on re-ingest. Comparing with a
    half-cent tolerance keeps the change-event history trustworthy.
    """
    if old is None or new is None:
        return old != new
    return abs(old - new) >= 0.005


def _needs_detail_fetch(existing: "Property | None", n: NormalizedProperty) -> bool:
    """True when we should try to resolve this listing's photo.

    Resolve on first ingest (no existing row) and when a row was seen before but
    never had its photo validated (detail_fetched=False). Do NOT re-check on
    every run -- photos rarely change, and re-validating hundreds of listings
    per UF per day is wasteful. A price change alone does NOT trigger a re-check.
    """
    if existing is None:
        return True
    return not existing.detail_fetched


AUCTION_DATES_TTL = timedelta(hours=24)


def _needs_auction_dates(prop: Property, now: datetime) -> bool:
    """Whether a Caixa scheduled-sale page should be refreshed for dates."""
    scheduled_modalities = {"Leilão SFI", "Licitação Aberta"}
    if (
        prop.source != "caixa"
        or prop.modalidade not in scheduled_modalities
        or not prop.detail_url
    ):
        return False
    if prop.dates_fetched_at is None:
        return True
    # Only Leilão SFI exposes separate first/second praça prices. Licitação
    # Aberta has one scheduled date and uses the CSV's current minimum price.
    if prop.modalidade == "Leilão SFI" and prop.first_auction_price is None:
        return True
    fetched_at = prop.dates_fetched_at
    if fetched_at.tzinfo is None:
        fetched_at = fetched_at.replace(tzinfo=timezone.utc)
    return now - fetched_at >= AUCTION_DATES_TTL


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


async def ingest(
    session_factory,
    adapter: SourceAdapter,
    geocoder=None,
    limit: Optional[int] = None,
    date_limit: Optional[int] = None,
    validate_photo_url: Callable[[str], bool] = _default_validate_photo_url,
    fetch_auction_dates=None,
) -> IngestSummary:
    summary = IngestSummary()
    try:
        # fetch_raw_async keeps the Playwright session on this event loop so the
        # subsequent fetch_detail_html_async calls can reuse self._page. Adapters
        # without fetch_raw_async (minimal stubs) fall back to sync fetch_raw.
        fetch_raw_async = getattr(adapter, "fetch_raw_async", None)
        if fetch_raw_async is not None:
            raws = await fetch_raw_async()
        else:
            raws = adapter.fetch_raw()
        # Optional slice for partial runs (testing the photo path on a small
        # sample without a 30+ min full-UF run). None = process all rows.
        if limit is not None:
            raws = raws[:limit]
        seen_ids: list[str] = []
        now = datetime.now(timezone.utc)
        # Properties whose photo still needs resolving this run (new or
        # not-yet-fetched). Collected during the upsert loop, then HEAD-validated
        # concurrently after the loop (see comment below) -- 649 sequential HEADs
        # took ~11 min; bounded concurrency cuts that to ~1 min. /fotos/ is not
        # Radware-guarded, so parallel plain HTTP is safe.
        pending_photos: list[tuple] = []  # (prop, photo_url)
        # (property_id, detail_url, never_fetched). Never-fetched rows are
        # prioritized over TTL refreshes when an operator supplies a temporary
        # --date-limit (for example during a smoke run).
        pending_dates: list[tuple[int, str, bool]] = []

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
                    if _preco_changed(existing.preco, n.preco):
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
                    prop = existing

                # Photo URL is derived from source_id in normalize()
                # (build_photo_url), so there is no detail-page browser fetch.
                # We HEAD-validate the derived URL: the /fotos/ path is not
                # behind Radware, so a plain HTTP HEAD passes and fetches headers
                # only (no image bytes). Validation is batched and run
                # concurrently after the upsert loop; a 200 image persists
                # photo_url + detail_fetched=True, a 404/failure leaves both
                # unset so the next run retries.
                if _needs_detail_fetch(existing, n) and n.photo_url:
                    pending_photos.append((prop, n.photo_url))
                if _needs_auction_dates(prop, now):
                    pending_dates.append((
                        prop.id, prop.detail_url, prop.dates_fetched_at is None,
                    ))

            # Removed detection is valid only for a complete source snapshot.
            # A --limit smoke test intentionally sees only a prefix and must
            # never mark every omitted production row as removed.
            if seen_ids and limit is None:
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

            # Resolve photos for everything collected above, concurrently.
            # Run after the upsert + removed-detection loops so the DB work is
            # done first and the (network-bound) HEADs don't block it. Results
            # are applied before commit so a 404 just leaves the row unfetched
            # for a next-run retry.
            if pending_photos:
                urls = [url for _, url in pending_photos]
                results = await _validate_photos_concurrently(urls, validate_photo_url)
                for (prop, url), ok in zip(pending_photos, results):
                    if ok:
                        prop.photo_url = url
                        prop.detail_fetched = True
                    # else: leave photo_url=None, detail_fetched=False (retry)

            session.commit()

        # Date enrichment is deliberately outside the upsert transaction: a
        # slow Caixa response must not hold database locks. All Leilão SFI and
        # Licitação Aberta rows missing/stale by 24h are selected by default. The adapter
        # paces requests and opens a circuit on repeated HTTP 429 responses.
        if pending_dates and date_limit != 0:
            pending_dates.sort(key=lambda candidate: not candidate[2])
            selected_dates = (
                pending_dates if date_limit is None else pending_dates[:date_limit]
            )
            summary.dates_deferred = len(pending_dates) - len(selected_dates)
            if fetch_auction_dates is None:
                from ingestion.adapters.caixa_detail import fetch_auction_dates_batch
                fetch_auction_dates = fetch_auction_dates_batch
            urls = [url for _, url, _ in selected_dates]
            date_results = await fetch_auction_dates(urls)
            with session_factory() as session:
                for (property_id, _, _), result in zip(selected_dates, date_results):
                    if result is None:
                        summary.dates_failed += 1
                        continue
                    prop = session.get(Property, property_id)
                    if prop is None:
                        continue
                    if isinstance(result, tuple):  # compatibility for injected adapters
                        prop.first_auction_at, prop.second_auction_at = result
                    else:
                        prop.first_auction_at = result["first_auction_at"]
                        prop.second_auction_at = result["second_auction_at"]
                        prop.first_auction_price = result.get("first_auction_price")
                        prop.second_auction_price = result.get("second_auction_price")
                    prop.dates_fetched_at = now
                    summary.dates_updated += 1
                session.commit()
    finally:
        # Adapters that own a browser session (CaixaCsvAdapter) expose close_async
        # (preferred, same event loop) or close (sync fallback). Others don't.
        # Guard so we never leak a session even on exception.
        close_async = getattr(adapter, "close_async", None)
        if close_async is not None:
            await close_async()
        else:
            close = getattr(adapter, "close", None)
            if close is not None:
                close()

    logger.info(
        f"Ingest[{adapter.source}/{adapter.uf}]: "
        f"+{summary.inserted} ~{summary.updated} -{summary.removed} "
        f"={summary.unchanged} events={summary.events_created} "
        f"dates={summary.dates_updated}/{summary.dates_failed}failed/"
        f"{summary.dates_deferred}deferred"
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


def run_cli(
    argv=None,
    session_factory=None,
    validate_photo_url: Callable[[str], bool] = _default_validate_photo_url,
    fetch_auction_dates=None,
) -> IngestSummary:
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
    return asyncio.run(ingest(
        session_factory, adapter, geocoder=geocoder,
        validate_photo_url=validate_photo_url,
        fetch_auction_dates=fetch_auction_dates,
    ))


def main() -> None:  # pragma: no cover - thin CLI wrapper
    summary = run_cli()
    logger.info(f"Done: {summary}")


if __name__ == "__main__":  # pragma: no cover
    main()
