"""Tests for ingestion.run: the _needs_detail_fetch decision helper and the
ingest() photo-resolution path.

The decision helper is pure. The ingest() photo-path tests use a stub adapter
and in-memory sqlite, with the HEAD validator stubbed, so no network or
Playwright is involved.
"""

from __future__ import annotations

import asyncio
import inspect
from datetime import datetime
from zoneinfo import ZoneInfo

from db.base import get_engine, init_db, make_session_factory
from db.models import Property
from ingestion.adapters.base import NormalizedProperty, RawListing
from ingestion.adapters.caixa_csv import CaixaCsvAdapter, build_photo_url
from ingestion.run import (
    _needs_auction_dates, _needs_detail_fetch, _needs_documents,
    _validate_photos_concurrently,
    ingest,
)


# --- _needs_detail_fetch decision logic --------------------------------------


def _norm(source_id="1"):
    return NormalizedProperty(source="caixa", source_id=source_id, uf="PR")


def test_needs_detail_fetch_true_for_new_listing():
    """No existing row means first ingest -> resolve the photo."""
    assert _needs_detail_fetch(existing=None, n=_norm()) is True


def test_needs_detail_fetch_true_when_detail_fetched_false():
    """Existing row that was seen before but never had its photo validated
    -> retry."""
    class _Existing:
        detail_fetched = False
    assert _needs_detail_fetch(existing=_Existing(), n=_norm()) is True


def test_needs_detail_fetch_false_when_detail_fetched_true():
    """Already validated -> skip (photos rarely change)."""
    class _Existing:
        detail_fetched = True
    assert _needs_detail_fetch(existing=_Existing(), n=_norm()) is False


# --- build_photo_url (derived URL) -------------------------------------------


def test_build_photo_url_zero_pads_to_13():
    """The id is zero-padded to 13 digits; '21' is the fixed photo slot."""
    # 13-digit id: no padding.
    assert build_photo_url("8787708379374") == \
        "https://venda-imoveis.caixa.gov.br/fotos/F878770837937421.jpg"
    # Short id: zero-padded to 13.
    assert build_photo_url("10139954") == \
        "https://venda-imoveis.caixa.gov.br/fotos/F000001013995421.jpg"


# --- ingest() photo path -----------------------------------------------------
#
# A stub adapter that returns injected rows and records close calls. It
# inherits normalize() from CaixaCsvAdapter so rows get the real derived
# photo_url. The HEAD validator is injected into ingest() -- no network.


class _StubAdapter(CaixaCsvAdapter):
    """Caixa adapter stub: injected rows + spy close. Inherits normalize() so
    rows produce real NormalizedProperty objects with a derived photo_url."""

    def __init__(self, uf, rows):
        super().__init__(uf=uf)
        self._rows = rows
        self.close_calls = 0

    def fetch_raw(self):
        return self._rows

    async def fetch_raw_async(self):
        return self._rows

    async def close_async(self):
        self.close_calls += 1

    def close(self):
        self.close_calls += 1


class _MinimalStubAdapter(CaixaCsvAdapter):
    """Adapter with only fetch_raw/normalize -- no close.

    ingest() must tolerate this via getattr guards (future sources, old stubs).
    """

    def __init__(self, uf, rows):
        super().__init__(uf=uf)
        self._rows = rows

    def fetch_raw(self):
        return self._rows

    async def fetch_raw_async(self):
        return self._rows


class _FailingFetchRawAdapter(CaixaCsvAdapter):
    """Adapter whose fetch_raw raises, to exercise the finally-close path."""

    def __init__(self, uf):
        super().__init__(uf=uf)
        self.close_calls = 0

    def fetch_raw(self):
        raise RuntimeError("boom")

    async def fetch_raw_async(self):
        raise RuntimeError("boom")

    async def close_async(self):
        self.close_calls += 1

    def close(self):
        self.close_calls += 1


def _row(source_id, uf="PR", detail_url="https://x/detalhe?hdnimovel=1"):
    return RawListing(
        source="caixa", source_id=source_id,
        raw={
            "source_id": source_id, "uf": uf, "city": "X",
            "neighborhood": "Y", "address": f"RUA {source_id}",
            "preco": "100.000,00", "avaliacao": "200.000,00", "desconto_csv": "0",
            "descricao": "Casa, área total 50,00 m2, 2 quartos.",
            "modalidade": "Venda Online", "detail_url": detail_url,
        },
    )


def _factory():
    engine = get_engine("sqlite://")
    init_db(engine)
    return make_session_factory(engine)


def _get_prop(factory, source_id="1"):
    with factory() as s:
        return s.query(Property).filter_by(source_id=source_id).one()


def _validator(record, ok_urls: set[str]):
    """Returns a validator that returns True for urls in ok_urls and records
    every URL it was asked about."""
    def _validate(url):
        record.append(url)
        return url in ok_urls
    return _validate


def test_ingest_is_async_coroutine_function():
    """ingest() must be a coroutine function so the adapter's async session
    methods run on a single shared event loop (cross-loop state would break
    Playwright)."""
    assert inspect.iscoroutinefunction(ingest)


def test_ingest_persists_photo_when_head_returns_200():
    """New listing + HEAD says the photo exists -> photo_url + detail_fetched=True."""
    factory = _factory()
    adapter = _StubAdapter("PR", [_row("1")])
    expected_url = build_photo_url("1")
    calls: list[str] = []

    summary = asyncio.run(ingest(
        factory, adapter, validate_photo_url=_validator(calls, {expected_url}),
    ))

    assert summary.inserted == 1
    assert calls == [expected_url]
    prop = _get_prop(factory, "1")
    assert prop.photo_url == expected_url
    assert prop.detail_fetched is True
    assert adapter.close_calls == 1


def test_ingest_skips_photo_check_when_detail_fetched_true():
    """Pre-existing row already validated -> validator NOT called."""
    factory = _factory()
    expected_url = build_photo_url("1")
    # Seed an existing row that was already fetched.
    adapter0 = _StubAdapter("PR", [_row("1")])
    calls0: list[str] = []
    asyncio.run(ingest(
        factory, adapter0, validate_photo_url=_validator(calls0, {expected_url}),
    ))
    assert calls0 == [expected_url]

    # Second run: the row is unchanged and detail_fetched=True -> no validation.
    adapter1 = _StubAdapter("PR", [_row("1")])
    calls1: list[str] = []
    summary = asyncio.run(ingest(
        factory, adapter1, validate_photo_url=_validator(calls1, set()),
    ))
    assert calls1 == []
    assert summary.unchanged == 1
    assert adapter1.close_calls == 1
    # Previously-validated photo is preserved, not clobbered.
    prop = _get_prop(factory, "1")
    assert prop.photo_url == expected_url
    assert prop.detail_fetched is True


def test_ingest_leaves_detail_fetched_false_when_head_404():
    """HEAD says no photo (404) -> photo_url stays None, detail_fetched stays
    False so the next run retries."""
    factory = _factory()
    adapter = _StubAdapter("PR", [_row("1")])
    calls: list[str] = []

    summary = asyncio.run(ingest(
        factory, adapter, validate_photo_url=_validator(calls, set()),
    ))

    assert summary.inserted == 1
    assert calls == [build_photo_url("1")]  # asked, but answered False
    prop = _get_prop(factory, "1")
    assert prop.photo_url is None
    assert prop.detail_fetched is False
    assert adapter.close_calls == 1


def test_ingest_calls_close_in_finally_on_success():
    """Happy path still closes the adapter."""
    factory = _factory()
    adapter = _StubAdapter("PR", [_row("1")])
    asyncio.run(ingest(
        factory, adapter, validate_photo_url=_validator([], {"x"}),
    ))
    assert adapter.close_calls == 1


def test_ingest_calls_close_in_finally_on_exception():
    """fetch_raw raises -> close still called (session never leaks)."""
    factory = _factory()
    adapter = _FailingFetchRawAdapter("PR")
    import pytest
    with pytest.raises(RuntimeError, match="boom"):
        asyncio.run(ingest(factory, adapter))
    assert adapter.close_calls == 1


def test_ingest_works_with_adapter_lacking_close():
    """Minimal stub (no close) -> no AttributeError, row still ingested. With
    no validator returning True, photo_url stays None and detail_fetched False."""
    factory = _factory()
    adapter = _MinimalStubAdapter("PR", [_row("1")])
    summary = asyncio.run(ingest(
        factory, adapter, validate_photo_url=_validator([], set()),
    ))

    assert summary.inserted == 1
    prop = _get_prop(factory, "1")
    assert prop.photo_url is None
    assert prop.detail_fetched is False


def test_ingest_limit_processes_only_first_n_listings():
    """limit=N -> only the first N raws are upserted (the rest are dropped
    before any DB write or photo check). Lets us test the photo path on a
    small slice without a 30+ min full-UF run."""
    factory = _factory()
    rows = [_row(str(i), detail_url=f"https://x/detalhe?hdnimovel={i}") for i in range(5)]
    adapter = _StubAdapter("PR", rows)
    calls: list[str] = []

    summary = asyncio.run(ingest(
        factory, adapter, limit=2,
        validate_photo_url=_validator(calls, set()),
    ))

    assert summary.inserted == 2
    assert calls == [build_photo_url("0"), build_photo_url("1")]
    with factory() as s:
        ids = {p.source_id for p in s.query(Property).all()}
    assert ids == {"0", "1"}


def test_needs_auction_dates_only_for_missing_or_stale_caixa_sfi_rows():
    now = datetime(2026, 7, 29, tzinfo=ZoneInfo("UTC"))
    prop = Property(
        source="caixa", source_id="1", modalidade="Leilão SFI",
        detail_url="https://x/detail",
    )
    assert _needs_auction_dates(prop, now) is True

    prop.dates_fetched_at = now
    prop.first_auction_price = 100000.0
    assert _needs_auction_dates(prop, now) is False

    prop.modalidade = "Venda Direta Online"
    prop.dates_fetched_at = None
    assert _needs_auction_dates(prop, now) is False


def test_needs_auction_dates_for_licitacao_aberta_without_requiring_praca_price():
    now = datetime(2026, 8, 6, tzinfo=ZoneInfo("UTC"))
    prop = Property(
        source="caixa", source_id="1", modalidade="Licitação Aberta",
        detail_url="https://x/detail",
    )
    assert _needs_auction_dates(prop, now) is True

    prop.dates_fetched_at = now
    assert _needs_auction_dates(prop, now) is False


def test_needs_documents_until_caixa_official_links_are_collected():
    prop = Property(
        source="caixa", source_id="1", modalidade="Leilão SFI",
        detail_url="https://x/detail",
    )
    assert _needs_documents(prop) is True

    prop.matricula_url = "https://x/matricula.pdf"
    assert _needs_documents(prop) is True

    prop.edital_url = "https://x/edital.pdf"
    assert _needs_documents(prop) is False


def test_ingest_fetches_and_persists_auction_dates_without_blocking_csv_upsert():
    factory = _factory()
    row = _row("1555522441313")
    row.raw["modalidade"] = "Leilão SFI - Edital Único"
    row.raw["detail_url"] = (
        "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?"
        "hdnimovel=1555522441313"
    )
    calls = []
    tz = ZoneInfo("America/Sao_Paulo")

    async def _fetch_dates(urls):
        calls.append(urls)
        # The upsert transaction must already be committed before network work.
        assert _get_prop(factory, "1555522441313").preco == 100000.0
        return [(
            datetime(2026, 8, 4, 10, 0, tzinfo=tz),
            datetime(2026, 8, 10, 10, 0, tzinfo=tz),
        )]

    summary = asyncio.run(ingest(
        factory, _StubAdapter("PR", [row]),
        validate_photo_url=_validator([], set()),
        fetch_auction_dates=_fetch_dates,
    ))

    prop = _get_prop(factory, "1555522441313")
    assert calls == [[row.raw["detail_url"]]]
    assert prop.first_auction_at == datetime(2026, 8, 4, 10, 0)
    assert prop.second_auction_at == datetime(2026, 8, 10, 10, 0)
    assert prop.dates_fetched_at is not None
    assert summary.dates_updated == 1
    assert summary.dates_failed == 0


def test_ingest_persists_caixa_documents_from_detail_metadata():
    factory = _factory()
    row = _row("8444415531323")
    row.raw["modalidade"] = "Leilão SFI"

    async def _fetch_details(urls):
        return [{
            "first_auction_at": datetime(2026, 10, 14, 10, 0),
            "second_auction_at": datetime(2026, 10, 20, 10, 0),
            "first_auction_price": 200_000,
            "second_auction_price": 120_000,
            "matricula": "91.048",
            "edital_url": "https://venda-imoveis.caixa.gov.br/editais/EL1.PDF",
            "matricula_url": "https://venda-imoveis.caixa.gov.br/editais/matricula/PR/8444415531323.pdf",
        }]

    summary = asyncio.run(ingest(
        factory, _StubAdapter("PR", [row]),
        validate_photo_url=_validator([], set()),
        fetch_auction_dates=_fetch_details,
    ))

    prop = _get_prop(factory, "8444415531323")
    assert prop.matricula == "91.048"
    assert prop.edital_url.endswith("EL1.PDF")
    assert prop.matricula_url.endswith("8444415531323.pdf")
    assert summary.documents_updated == 1


def test_document_backfill_does_not_erase_fresh_auction_dates():
    factory = _factory()
    row = _row("8444415531323")
    row.raw["modalidade"] = "Leilão SFI"
    first_date = datetime(2026, 10, 14, 10, 0)

    async def _initial_dates(urls):
        return [{
            "first_auction_at": first_date,
            "second_auction_at": None,
            "first_auction_price": 200_000,
            "second_auction_price": None,
            "matricula": None,
            "edital_url": None,
            "matricula_url": None,
        }]

    asyncio.run(ingest(
        factory, _StubAdapter("PR", [row]),
        validate_photo_url=_validator([], set()),
        fetch_auction_dates=_initial_dates,
    ))

    async def _documents_only(urls):
        return [{
            "first_auction_at": None,
            "second_auction_at": None,
            "first_auction_price": None,
            "second_auction_price": None,
            "matricula": "91.048",
            "edital_url": "https://venda-imoveis.caixa.gov.br/editais/EL1.PDF",
            "matricula_url": "https://venda-imoveis.caixa.gov.br/editais/matricula/PR/8444415531323.pdf",
        }]

    summary = asyncio.run(ingest(
        factory, _StubAdapter("PR", [row]),
        validate_photo_url=_validator([], set()),
        fetch_auction_dates=_documents_only,
    ))

    prop = _get_prop(factory, "8444415531323")
    assert prop.first_auction_at == first_date
    assert prop.edital_url.endswith("EL1.PDF")
    assert summary.dates_failed == 0
    assert summary.documents_updated == 1


def test_ingest_date_failure_is_non_fatal_and_retried():
    factory = _factory()
    row = _row("1")
    row.raw["modalidade"] = "Leilão SFI"
    attempts = 0

    async def _fail(urls):
        nonlocal attempts
        attempts += 1
        return [None]

    for _ in range(2):
        summary = asyncio.run(ingest(
            factory, _StubAdapter("PR", [row]),
            validate_photo_url=_validator([], set()),
            fetch_auction_dates=_fail,
        ))
        assert summary.dates_failed == 1

    prop = _get_prop(factory, "1")
    assert attempts == 2
    assert prop.dates_fetched_at is None


def test_ingest_caps_date_enrichment_and_defers_the_rest():
    factory = _factory()
    rows = [_row(str(i)) for i in range(5)]
    for row in rows:
        row.raw["modalidade"] = "Leilão SFI"
    calls = []

    async def _fetch(urls):
        calls.append(urls)
        return [None] * len(urls)

    summary = asyncio.run(ingest(
        factory, _StubAdapter("PR", rows), date_limit=2,
        validate_photo_url=_validator([], set()),
        fetch_auction_dates=_fetch,
    ))

    assert len(calls[0]) == 2
    assert summary.dates_failed == 2
    assert summary.dates_deferred == 3


def test_ingest_fetches_all_auction_dates_by_default():
    factory = _factory()
    rows = [_row(str(i)) for i in range(55)]
    for row in rows:
        row.raw["modalidade"] = "Leilão SFI"
    calls = []

    async def _fetch(urls):
        calls.append(urls)
        return [None] * len(urls)

    summary = asyncio.run(ingest(
        factory, _StubAdapter("PR", rows),
        validate_photo_url=_validator([], set()),
        fetch_auction_dates=_fetch,
    ))

    assert len(calls[0]) == 55
    assert summary.dates_failed == 55
    assert summary.dates_deferred == 0


# --- _validate_photos_concurrently ------------------------------------------


def test_validate_photos_concurrently_preserves_order_and_bounds_concurrency():
    """The batched validator returns one result per URL in input order, and
    never runs more than `concurrency` validators at once (so we don't open
    hundreds of sockets against the Caixa origin)."""
    import time

    urls = [f"https://x/{i}.jpg" for i in range(10)]
    in_flight = 0
    peak = 0

    def _validate(url):
        nonlocal in_flight, peak
        in_flight += 1
        peak = max(peak, in_flight)
        time.sleep(0.02)  # simulate a HEAD round-trip
        in_flight -= 1
        return url.endswith("/3.jpg")  # only url 3 is "valid"

    results = asyncio.run(_validate_photos_concurrently(urls, _validate, concurrency=4))

    assert results == [
        False, False, False, True, False, False, False, False, False, False,
    ]
    assert peak <= 4, f"concurrency exceeded bound: peak={peak}"


def test_validate_photos_concurrently_empty_is_noop():
    """No pending photos -> no validator calls, empty result."""
    calls = []

    def _validate(url):
        calls.append(url)
        return True

    assert asyncio.run(_validate_photos_concurrently([], _validate)) == []
    assert calls == []
