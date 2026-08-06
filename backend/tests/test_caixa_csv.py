from ingestion.adapters.base import RawListing, NormalizedProperty


def test_raw_listing_holds_source_and_dict():
    raw = RawListing(source="caixa", source_id="42", raw={"UF": "PR"})
    assert raw.source == "caixa"
    assert raw.source_id == "42"
    assert raw.raw["UF"] == "PR"


def test_normalized_property_defaults():
    n = NormalizedProperty(source="caixa", source_id="42", uf="PR", address="Rua A")
    assert n.preco == 0.0
    assert n.beds is None
    assert n.raw == {}


from ingestion.adapters.caixa_csv import CaixaCsvAdapter


def _raw_row():
    return RawListing(
        source="caixa",
        source_id="8444401234567",
        raw={
            "source_id": "8444401234567",
            "uf": "PR",
            "city": "CURITIBA",
            "neighborhood": "CENTRO",
            "address": "RUA XV DE NOVEMBRO, N. 100, APT 302",
            "preco": "150.000,00",
            "avaliacao": "250.000,00",
            "desconto_csv": "40,00000",
            "descricao": "Apartamento, CENTRO, CURITIBA, com área privativa de 65,00 m2, 2 quartos.",
            "modalidade": "Venda Online",
            "detail_url": "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=8444401234567",
        },
    )


def test_normalize_maps_caixa_row_to_canonical():
    adapter = CaixaCsvAdapter(uf="PR")
    n = adapter.normalize(_raw_row())
    assert n.source == "caixa"
    assert n.source_id == "8444401234567"
    assert n.uf == "PR"
    assert n.city == "CURITIBA"
    assert n.neighborhood == "CENTRO"
    assert n.preco == 150000.0
    assert n.avaliacao == 250000.0
    assert n.desconto_oficial == 40.0
    assert n.property_type == "Apartamento"
    assert n.area_m2 == 65.0
    assert n.beds == 2
    assert n.modalidade == "Venda Direta Online"
    assert "detalhe-imovel.asp" in n.detail_url
    assert n.address.startswith("RUA XV")
    # Photo URL is derived from source_id (zero-padded to 13, fixed "21" slot).
    assert n.photo_url == \
        "https://venda-imoveis.caixa.gov.br/fotos/F844440123456721.jpg"

from ingestion.adapters.caixa_csv import parse_caixa_csv

SAMPLE_CSV_TEXT = (
    "Lista de Imóveis Caixa\n"
    "\n"
    "N° do imóvel;UF;Cidade;Bairro;Endereço;Preço;Valor de avaliação;Desconto;"
    "Descrição;Modalidade de venda;Link de acesso\n"
    "8444401234567;PR;CURITIBA;CENTRO;RUA XV DE NOVEMBRO, N. 100, APT 302;"
    "150.000,00;250.000,00;40,00000;"
    "Apartamento, CENTRO, CURITIBA, com área privativa de 65,00 m2, 2 quartos.;"
    "Venda Online;"
    "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=8444401234567\n"
    "8444407654321;PR;LONDRINA;JARDIM;RUA A, N. 50;90.000,00;90.000,00;0,00000;"
    "Casa, JARDIM, LONDRINA, área total 120,00 m2, 3 quartos.;"
    "Leilão SFI - Edital Único;"
    "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=8444407654321\n"
)


def test_parse_caixa_csv_extracts_rows_with_latin1_bytes():
    raw_bytes = SAMPLE_CSV_TEXT.encode("latin-1")
    rows = parse_caixa_csv(raw_bytes)
    assert len(rows) == 2
    first = rows[0]
    assert first.source == "caixa"
    assert first.source_id == "8444401234567"
    assert first.raw["city"] == "CURITIBA"
    assert first.raw["preco"] == "150.000,00"
    assert first.raw["modalidade"] == "Venda Online"


def test_parse_caixa_csv_skips_preamble_and_blank_rows():
    raw_bytes = (SAMPLE_CSV_TEXT + "\n\n").encode("latin-1")
    rows = parse_caixa_csv(raw_bytes)
    assert all(r.source_id for r in rows)
    assert len(rows) == 2


import pytest
from pathlib import Path

REAL_FIXTURE = Path(__file__).parent / "fixtures" / "caixa_PR_sample.csv"


def test_parse_real_caixa_csv_with_financiamento_column():
    """Real Caixa CSV has an extra 'Financiamento' column between Desconto and
    Descrição. Header-driven parsing must keep every field aligned."""
    rows = parse_caixa_csv(REAL_FIXTURE.read_bytes())
    assert len(rows) == 4
    keys = list(rows[0].raw.keys())
    assert "financiamento" in keys
    # columns after the injected Financiamento must stay correctly aligned
    apt = next(r for r in rows if r.source_id == "8787708753594")
    assert apt.raw["city"] == "ALMIRANTE TAMANDARE"
    assert apt.raw["modalidade"] == "Licitação Aberta"
    assert "hdnimovel=8787708753594" in apt.raw["detail_url"]
    assert apt.raw["descricao"].startswith("Apartamento,")


def test_normalize_real_apartment_extracts_area_and_beds():
    adapter = CaixaCsvAdapter(uf="PR")
    rows = parse_caixa_csv(REAL_FIXTURE.read_bytes())
    apt = adapter.normalize(next(r for r in rows if r.source_id == "8787708753594"))
    assert apt.property_type == "Apartamento"
    assert apt.area_m2 == pytest.approx(41.54)
    assert apt.beds == 2
    assert apt.preco == pytest.approx(71080.90)
    assert apt.avaliacao == pytest.approx(124000.0)
    assert apt.modalidade == "Licitação Aberta"


def test_normalize_real_terreno_uses_land_area():
    adapter = CaixaCsvAdapter(uf="PR")
    rows = parse_caixa_csv(REAL_FIXTURE.read_bytes())
    ter = adapter.normalize(next(r for r in rows if r.source_id == "1555522441313"))
    assert ter.property_type == "Terreno"
    assert ter.area_m2 == pytest.approx(197270.0)
    assert ter.beds is None


# --- Adapter session lifecycle (photo fetch support) -------------------------
#
# The adapter now owns a long-lived headed-Chrome session so it can fetch
# detail-page HTML for photos in the same context that downloads the CSV.
# These tests cover the lifecycle boundaries without touching the network
# (csv_bytes is injected, so _download / _fetch_detail_html never run).


def test_close_is_safe_when_session_never_opened():
    """close() must not blow up when the browser was never started (e.g. tests
    or an adapter used with csv_bytes injected). Covers the finally path in
    ingest()."""
    adapter = CaixaCsvAdapter(uf="PR", csv_bytes=SAMPLE_CSV_TEXT.encode("latin-1"))
    # Session was never opened (fetch_raw not called); close must be a no-op.
    adapter.close()
    # Idempotent: a second close is also safe.
    adapter.close()


def test_fetch_detail_html_returns_empty_when_session_never_opened():
    """When the browser session wasn't started (csv_bytes path), there is no
    page to navigate. Return '' so the caller can skip gracefully."""
    adapter = CaixaCsvAdapter(uf="PR", csv_bytes=SAMPLE_CSV_TEXT.encode("latin-1"))
    assert adapter.fetch_detail_html("https://example.com/detail") == ""


def test_fetch_detail_html_returns_empty_for_blank_url():
    """Guard clause: no detail_url means no fetch."""
    adapter = CaixaCsvAdapter(uf="PR", csv_bytes=SAMPLE_CSV_TEXT.encode("latin-1"))
    assert adapter.fetch_detail_html("") == ""
    assert adapter.fetch_detail_html(None) == ""


# --- Async session API (one event loop for the whole ingest run) -------------
#
# The ingestor shares one Playwright session across the CSV download and all
# detail-page fetches. Because Playwright objects are bound to the event loop
# that created them, sync asyncio.run-per-call breaks that sharing (the first
# loop closes, leaving self._page tied to a dead loop). The adapter therefore
# exposes async variants so ingest() can run them all on a single loop.


def test_adapter_exposes_async_variants():
    """fetch_raw_async and fetch_detail_html_async must be coroutine functions
    so ingest() can await them on a single shared event loop."""
    import inspect
    adapter = CaixaCsvAdapter(uf="PR", csv_bytes=SAMPLE_CSV_TEXT.encode("latin-1"))
    assert inspect.iscoroutinefunction(adapter.fetch_raw_async)
    assert inspect.iscoroutinefunction(adapter.fetch_detail_html_async)


def test_fetch_raw_async_returns_rows_without_opening_browser():
    """When csv_bytes is injected, fetch_raw_async parses them directly (no
    _download, no browser). Same contract as sync fetch_raw."""
    adapter = CaixaCsvAdapter(
        uf="PR", csv_bytes=SAMPLE_CSV_TEXT.encode("latin-1"),
    )
    import asyncio
    rows = asyncio.run(adapter.fetch_raw_async())
    assert len(rows) == 2
    assert rows[0].source_id == "8444401234567"


def test_fetch_detail_html_async_returns_empty_when_session_never_opened():
    """Same guard as the sync variant: no browser session -> ''."""
    adapter = CaixaCsvAdapter(uf="PR", csv_bytes=SAMPLE_CSV_TEXT.encode("latin-1"))
    import asyncio
    assert asyncio.run(adapter.fetch_detail_html_async("https://x/y")) == ""


def test_close_is_safe_after_async_session_never_opened():
    """close() still safe when the async session was never started."""
    adapter = CaixaCsvAdapter(uf="PR", csv_bytes=SAMPLE_CSV_TEXT.encode("latin-1"))
    adapter.close()
    adapter.close()
