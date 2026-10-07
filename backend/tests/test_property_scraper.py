import json

import httpx
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from graph.state import PropertyMetadata, ComparableProperty
from tools.property_scraper import (
    BRIGHT_DATA_API_URL,
    BrightDataWebUnlocker,
    ComparableSourceBlockedError,
    _canonical_listing_url,
    _extract_street,
    _filter_to_subject_radius,
    _parse_beds_from_text,
    _parse_property_type,
    _parse_price_from_text,
    _is_usable_comparable,
    build_quintoandar_url,
    build_chavesnamao_url,
    build_imovelweb_url,
    scrape_comparables,
    scrape_imovelweb,
)


@pytest.fixture(autouse=True)
def _bright_data_config(monkeypatch):
    monkeypatch.setenv("BRIGHT_DATA_API_KEY", "test-api-key")
    monkeypatch.setenv("BRIGHT_DATA_WEB_UNLOCKER_ZONE", "test-zone")


def _make_metadata(**overrides):
    defaults = dict(
        address="Rua das Flores, 123, Moema, Sao Paulo - SP",
        property_type="Apartamento",
        area_m2=80.0,
        auction_price=350000.0,
        city="Sao Paulo",
        neighborhood="Moema",
        state="SP",
    )
    defaults.update(overrides)
    return PropertyMetadata(**defaults)


# ---------------------------------------------------------------------------
# Street extraction tests
# ---------------------------------------------------------------------------


def test_extract_street_from_full_address():
    assert _extract_street("Rua das Flores, 123, Centro, Sao Paulo - SP") == "Rua das Flores"


def test_extract_street_with_avenue():
    assert _extract_street("Av. Paulista, 1000, Bela Vista, Sao Paulo - SP") == "Av. Paulista"


def test_extract_street_simple():
    assert _extract_street("Rua A, 45") == "Rua A"


def test_extract_street_empty():
    assert _extract_street("") == ""


def test_bright_data_configuration_is_required(monkeypatch):
    monkeypatch.delenv("BRIGHT_DATA_API_KEY")

    with pytest.raises(RuntimeError, match="BRIGHT_DATA_API_KEY"):
        BrightDataWebUnlocker.from_env()


@pytest.mark.asyncio
async def test_bright_data_fetch_is_rendered_in_brazil_without_leaking_key():
    captured = {}

    def handler(request):
        captured["url"] = str(request.url)
        captured["authorization"] = request.headers["Authorization"]
        captured["payload"] = json.loads(request.content)
        return httpx.Response(200, text="<html><body>anuncios</body></html>")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        unlocker = BrightDataWebUnlocker("super-secret", "argos_market_sources", client=client)
        html = await unlocker.fetch_html(
            "ImovelWeb",
            "https://www.imovelweb.com.br/imoveis-venda-curitiba-pr.html",
        )

    assert html.endswith("</html>")
    assert captured == {
        "url": BRIGHT_DATA_API_URL,
        "authorization": "Bearer super-secret",
        "payload": {
            "zone": "argos_market_sources",
            "url": "https://www.imovelweb.com.br/imoveis-venda-curitiba-pr.html",
            "format": "raw",
            "country": "br",
            "render": True,
        },
    }


@pytest.mark.asyncio
async def test_bright_data_rejects_an_unexpected_target_without_spending_request():
    handler = MagicMock()
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        unlocker = BrightDataWebUnlocker("super-secret", "argos_market_sources", client=client)
        with pytest.raises(ValueError, match="Unexpected ImovelWeb target domain"):
            await unlocker.fetch_html("ImovelWeb", "https://example.com/listings")

    handler.assert_not_called()


@pytest.mark.asyncio
async def test_bright_data_error_does_not_expose_api_key():
    def handler(request):
        return httpx.Response(403, text="forbidden")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        unlocker = BrightDataWebUnlocker("super-secret", "argos_market_sources", client=client)
        with pytest.raises(ComparableSourceBlockedError) as captured:
            await unlocker.fetch_html(
                "QuintoAndar",
                "https://www.quintoandar.com.br/comprar/imovel/curitiba-pr-brasil/",
            )

    assert "super-secret" not in str(captured.value)


def test_listing_url_is_canonicalized_before_deduplication():
    assert _canonical_listing_url(
        "https://www.quintoandar.com.br",
        "/imovel/123?search_id=secret#card",
    ) == "https://www.quintoandar.com.br/imovel/123"


def test_price_parser_stops_before_concatenated_area():
    assert _parse_price_from_text("R$ 650.000262 m²") == 650_000


def test_comparable_card_extracts_bedrooms_and_canonical_type():
    text = "Apartamento à venda com 3 dormitórios e 82 m²"

    assert _parse_beds_from_text(text) == 3
    assert _parse_property_type(text) == "Apartamento"


@pytest.mark.asyncio
async def test_radius_filter_keeps_only_five_nearby_comparables():
    class FakeGeocoder:
        def geocode(self, address):
            if "Distante" in address:
                return -25.4284, -49.2433
            index = int(address.split("Rua ", 1)[1].split(",", 1)[0])
            return -25.4284, -49.2733 + index * 0.001

    metadata = _make_metadata(lat=-25.4284, lng=-49.2733, beds=2, area_m2=80)
    candidates = [
        ComparableProperty(
            address=f"Rua {index}", property_type="Apartamento",
            price=400_000, area_m2=80, beds=2, price_per_m2=5_000,
            source="Portal", url=f"https://portal/{index}",
        )
        for index in range(7)
    ]
    candidates.append(ComparableProperty(
        address="Rua Distante", property_type="Apartamento",
        price=400_000, area_m2=80, beds=2, price_per_m2=5_000,
        source="Portal", url="https://portal/far",
    ))

    result = await _filter_to_subject_radius(metadata, candidates, FakeGeocoder())

    assert len(result) == 5
    assert all(item.distance_km <= 2 for item in result)
    assert all(item.address != "Rua Distante" for item in result)


class _FakeLocator:
    def __init__(self, items):
        self.items = items

    async def count(self):
        return len(self.items)

    def nth(self, index):
        return self.items[index]

    @property
    def first(self):
        return self.items[0]


class _FakeCard:
    def __init__(self, text, attrs=None, children=None):
        self.text = text
        self.attrs = attrs or {}
        self.children = children or {}

    async def text_content(self):
        return self.text

    async def get_attribute(self, name):
        return self.attrs.get(name)

    def locator(self, selector):
        return _FakeLocator(self.children.get(selector, []))


class _FakePage:
    def __init__(self, selectors, *, title="Resultados", content="", url="https://www.imovelweb.com.br/busca"):
        self.selectors = selectors
        self._title = title
        self._content = content
        self.url = url

    async def goto(self, *args, **kwargs):
        return None

    async def wait_for_selector(self, *args, **kwargs):
        return None

    async def title(self):
        return self._title

    async def content(self):
        return self._content

    def locator(self, selector):
        return _FakeLocator(self.selectors.get(selector, []))


IMOVELWEB_CARD_TEXT = "R$ 500.000 80 m² tot. 2 quartos Rua das Flores, Moema, Sao Paulo"


@pytest.mark.asyncio
async def test_imovelweb_reads_real_cards_and_new_listing_path():
    card = _FakeCard(
        IMOVELWEB_CARD_TEXT,
        attrs={"data-to-posting": "/propriedades/apartamento-moema-2999.html?n_src=Listado&n_pg=1"},
    )
    fragment = _FakeCard("R$ 500.000")
    page = _FakePage({
        '[data-qa="posting PROPERTY"]': [card],
        # Os seletores por classe também pegam pedaços do mesmo card.
        'div.postingCard, div[class*="PostingCard"], div[class*="posting-card"]': [card, fragment, fragment],
    })

    with patch("tools.property_scraper.asyncio.sleep", new_callable=AsyncMock):
        result = await scrape_imovelweb(page, _make_metadata())

    assert len(result) == 1
    assert result[0].url == "https://www.imovelweb.com.br/propriedades/apartamento-moema-2999.html"
    assert result[0].price == 500_000


@pytest.mark.asyncio
async def test_imovelweb_falls_back_to_propriedades_anchor():
    link = _FakeCard("", attrs={"href": "/propriedades/casa-moema-3001.html"})
    card = _FakeCard(IMOVELWEB_CARD_TEXT, children={
        'a[href*="/propriedades/"], a[href*="imovel"]': [link],
    })
    page = _FakePage({'[data-qa="posting PROPERTY"]': [card]})

    with patch("tools.property_scraper.asyncio.sleep", new_callable=AsyncMock):
        result = await scrape_imovelweb(page, _make_metadata())

    assert [item.url for item in result] == ["https://www.imovelweb.com.br/propriedades/casa-moema-3001.html"]


@pytest.mark.asyncio
async def test_imovelweb_reports_cloudflare_challenge_instead_of_empty_results():
    page = _FakePage(
        {},
        title="Just a moment...",
        content='<script src="/cdn-cgi/challenge-platform/h/b/orchestrate"></script>',
    )

    with pytest.raises(ComparableSourceBlockedError, match="anti-bot challenge"):
        await scrape_imovelweb(page, _make_metadata())


def test_comparable_validation_rejects_portal_homepage():
    comp = ComparableProperty(
        address="Centro, Curitiba", price=500000, area_m2=50,
        price_per_m2=10000, source="ImovelWeb",
        url="https://www.imovelweb.com.br",
    )
    assert not _is_usable_comparable(comp)


def test_comparable_validation_accepts_traceable_listing():
    comp = ComparableProperty(
        address="Centro, Curitiba", price=500000, area_m2=50,
        price_per_m2=10000, source="QuintoAndar",
        url="https://www.quintoandar.com.br/imovel/123/comprar/apartamento",
    )
    assert _is_usable_comparable(comp)


# ---------------------------------------------------------------------------
# URL builder tests
# ---------------------------------------------------------------------------


def test_build_quintoandar_url():
    meta = _make_metadata()
    url = build_quintoandar_url(meta)
    assert "quintoandar.com.br" in url
    assert "comprar" in url
    assert "sao-paulo" in url
    assert "moema" in url


def test_build_chavesnamao_url():
    meta = _make_metadata()
    url = build_chavesnamao_url(meta)
    assert "chavesnamao.com.br" in url
    assert "sp-sao-paulo" in url  # state-city format


def test_build_imovelweb_url():
    url = build_imovelweb_url(_make_metadata())
    assert url == "https://www.imovelweb.com.br/imoveis-venda-moema-sao-paulo-sp.html"


def test_build_url_handles_missing_neighborhood():
    meta = _make_metadata(neighborhood="")
    for builder in [build_quintoandar_url, build_chavesnamao_url, build_imovelweb_url]:
        url = builder(meta)
        assert url  # Should still produce a valid URL


# ---------------------------------------------------------------------------
# Dispatcher tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_scrape_comparables_calls_only_the_three_managed_sources():
    comp = ComparableProperty(
        address="Rua A, 45, São Paulo",
        price=960000.0,
        area_m2=80.0,
        price_per_m2=12000.0,
        source="Chaves na Mão",
        url="https://www.chavesnamao.com.br/imovel/1",
    )
    with patch("tools.property_scraper.scrape_quintoandar", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_chavesnamao", new_callable=AsyncMock, return_value=[comp, comp, comp]) as mock_chaves, \
         patch("tools.property_scraper.scrape_imovelweb", new_callable=AsyncMock, return_value=[]) as mock_iw, \
         patch("tools.property_scraper.asyncio.sleep", new_callable=AsyncMock), \
         patch("tools.property_scraper._launch_parser_browser") as mock_launch:
        mock_playwright = AsyncMock()
        mock_playwright.stop = AsyncMock()
        mock_browser = AsyncMock()
        mock_browser.close = AsyncMock()
        mock_page = AsyncMock()
        mock_launch.return_value = (mock_playwright, mock_browser, mock_page)

        result = await scrape_comparables(_make_metadata())

    assert len(result) == 1  # duplicate URLs are collapsed
    mock_chaves.assert_called_once()
    mock_iw.assert_called_once()
    mock_browser.close.assert_awaited_once()
    mock_playwright.stop.assert_awaited_once()


@pytest.mark.asyncio
async def test_scrape_comparables_falls_through_when_first_fails():
    """If first scraper returns 0 comps, try the next one."""
    comp = ComparableProperty(
        address="Rua B, 78, São Paulo",
        price=800000.0,
        area_m2=70.0,
        price_per_m2=11428.0,
        source="ImovelWeb",
        url="https://www.imovelweb.com.br/propriedades/2.html",
    )
    with patch("tools.property_scraper.scrape_quintoandar", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_chavesnamao", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_imovelweb", new_callable=AsyncMock, return_value=[comp, comp, comp]), \
         patch("tools.property_scraper.asyncio.sleep", new_callable=AsyncMock), \
         patch("tools.property_scraper._launch_parser_browser") as mock_launch:
        mock_playwright = AsyncMock()
        mock_playwright.stop = AsyncMock()
        mock_browser = AsyncMock()
        mock_browser.close = AsyncMock()
        mock_page = AsyncMock()
        mock_launch.return_value = (mock_playwright, mock_browser, mock_page)

        result = await scrape_comparables(_make_metadata())

    assert len(result) == 1  # duplicate URLs are collapsed


@pytest.mark.asyncio
async def test_scrape_comparables_propagates_blocked_source_and_closes_browser():
    with patch("tools.property_scraper.scrape_quintoandar", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_chavesnamao", new_callable=AsyncMock, return_value=[]), \
         patch(
             "tools.property_scraper.scrape_imovelweb",
             new_callable=AsyncMock,
             side_effect=ComparableSourceBlockedError("blocked"),
         ), \
         patch("tools.property_scraper.asyncio.sleep", new_callable=AsyncMock), \
         patch("tools.property_scraper._launch_parser_browser") as mock_launch:
        mock_playwright = AsyncMock()
        mock_browser = AsyncMock()
        mock_page = AsyncMock()
        mock_launch.return_value = (mock_playwright, mock_browser, mock_page)

        with pytest.raises(ComparableSourceBlockedError, match="blocked"):
            await scrape_comparables(_make_metadata())

    mock_browser.close.assert_awaited_once()
    mock_playwright.stop.assert_awaited_once()


@pytest.mark.asyncio
async def test_scrape_comparables_returns_empty_when_all_fail():
    """If all scrapers return empty (both street and neighborhood), dispatcher returns empty list."""
    with patch("tools.property_scraper.scrape_quintoandar", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_chavesnamao", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_imovelweb", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.asyncio.sleep", new_callable=AsyncMock), \
         patch("tools.property_scraper._launch_parser_browser") as mock_launch:
        mock_playwright = AsyncMock()
        mock_playwright.stop = AsyncMock()
        mock_browser = AsyncMock()
        mock_browser.close = AsyncMock()
        mock_page = AsyncMock()
        mock_launch.return_value = (mock_playwright, mock_browser, mock_page)

        result = await scrape_comparables(_make_metadata())

    assert result == []


@pytest.mark.asyncio
async def test_scrape_comparables_merges_partial_results():
    """If two scrapers return 1-2 comps each, they should be merged."""
    comp1 = ComparableProperty(address="Rua A, São Paulo", price=500000.0, area_m2=50.0, price_per_m2=10000.0, source="Chaves na Mão", url="https://www.chavesnamao.com.br/imovel/1")
    comp2 = ComparableProperty(address="Rua B, São Paulo", price=600000.0, area_m2=60.0, price_per_m2=10000.0, source="QuintoAndar", url="https://www.quintoandar.com.br/imovel/2")
    with patch("tools.property_scraper.scrape_quintoandar", new_callable=AsyncMock, return_value=[comp2]), \
         patch("tools.property_scraper.scrape_chavesnamao", new_callable=AsyncMock, return_value=[comp1]), \
         patch("tools.property_scraper.scrape_imovelweb", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.asyncio.sleep", new_callable=AsyncMock), \
         patch("tools.property_scraper._launch_parser_browser") as mock_launch:
        mock_playwright = AsyncMock()
        mock_playwright.stop = AsyncMock()
        mock_browser = AsyncMock()
        mock_browser.close = AsyncMock()
        mock_page = AsyncMock()
        mock_launch.return_value = (mock_playwright, mock_browser, mock_page)

        result = await scrape_comparables(_make_metadata())

    # Street search yields 2 comps; neighborhood fallback repeats and deduplicates them.
    assert len(result) >= 2
