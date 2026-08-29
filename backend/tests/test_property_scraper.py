import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from graph.state import PropertyMetadata, ComparableProperty
from tools.property_scraper import (
    _extract_street,
    _parse_price_from_text,
    _is_usable_comparable,
    build_zap_url,
    build_vivareal_url,
    build_quintoandar_url,
    build_chavesnamao_url,
    build_imovelweb_url,
    scrape_comparables,
)


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


def test_price_parser_stops_before_concatenated_area():
    assert _parse_price_from_text("R$ 650.000262 m²") == 650_000


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


def test_build_zap_url():
    meta = _make_metadata()
    url = build_zap_url(meta)
    assert "zapimoveis.com.br" in url
    assert "venda" in url
    assert "sao-paulo" in url
    assert "moema" in url


def test_build_zap_url_with_street_override():
    meta = _make_metadata()
    url = build_zap_url(meta, location_override="Rua das Flores")
    assert "zapimoveis.com.br" in url
    assert "rua-das-flores" in url


def test_build_vivareal_url():
    meta = _make_metadata()
    url = build_vivareal_url(meta)
    assert "vivareal.com.br" in url
    assert "venda" in url
    assert "sao-paulo" in url
    assert "moema" in url


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
    for builder in [build_zap_url, build_vivareal_url, build_quintoandar_url, build_chavesnamao_url, build_imovelweb_url]:
        url = builder(meta)
        assert url  # Should still produce a valid URL


# ---------------------------------------------------------------------------
# Dispatcher tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_scrape_comparables_calls_all_five_sources():
    comp = ComparableProperty(
        address="Rua A, 45, São Paulo",
        price=960000.0,
        area_m2=80.0,
        price_per_m2=12000.0,
        source="Viva Real",
        url="https://vivareal.com.br/imovel/1",
    )
    with patch("tools.property_scraper.scrape_vivareal", new_callable=AsyncMock, return_value=[comp, comp, comp]), \
         patch("tools.property_scraper.scrape_quintoandar", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_zap", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_chavesnamao", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_imovelweb", new_callable=AsyncMock, return_value=[]) as mock_iw, \
        patch("tools.property_scraper.asyncio.sleep", new_callable=AsyncMock), \
         patch("tools.property_scraper._launch_stealth_browser") as mock_launch:
        mock_playwright = AsyncMock()
        mock_playwright.stop = AsyncMock()
        mock_browser = AsyncMock()
        mock_browser.close = AsyncMock()
        mock_page = AsyncMock()
        mock_launch.return_value = (mock_playwright, mock_browser, mock_page)

        result = await scrape_comparables(_make_metadata())

    assert len(result) == 1  # duplicate URLs are collapsed
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
        source="QuintoAndar",
        url="https://quintoandar.com.br/imovel/2",
    )
    with patch("tools.property_scraper.scrape_vivareal", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_quintoandar", new_callable=AsyncMock, return_value=[comp, comp, comp]), \
         patch("tools.property_scraper.scrape_zap", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_chavesnamao", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_imovelweb", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.asyncio.sleep", new_callable=AsyncMock), \
         patch("tools.property_scraper._launch_stealth_browser") as mock_launch:
        mock_playwright = AsyncMock()
        mock_playwright.stop = AsyncMock()
        mock_browser = AsyncMock()
        mock_browser.close = AsyncMock()
        mock_page = AsyncMock()
        mock_launch.return_value = (mock_playwright, mock_browser, mock_page)

        result = await scrape_comparables(_make_metadata())

    assert len(result) == 1  # duplicate URLs are collapsed


@pytest.mark.asyncio
async def test_scrape_comparables_returns_empty_when_all_fail():
    """If all scrapers return empty (both street and neighborhood), dispatcher returns empty list."""
    with patch("tools.property_scraper.scrape_vivareal", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_quintoandar", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_zap", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_chavesnamao", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_imovelweb", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.asyncio.sleep", new_callable=AsyncMock), \
         patch("tools.property_scraper._launch_stealth_browser") as mock_launch:
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
    comp1 = ComparableProperty(address="Rua A, São Paulo", price=500000.0, area_m2=50.0, price_per_m2=10000.0, source="Viva Real", url="https://www.vivareal.com.br/imovel/1")
    comp2 = ComparableProperty(address="Rua B, São Paulo", price=600000.0, area_m2=60.0, price_per_m2=10000.0, source="QuintoAndar", url="https://www.quintoandar.com.br/imovel/2")
    with patch("tools.property_scraper.scrape_vivareal", new_callable=AsyncMock, return_value=[comp1]), \
         patch("tools.property_scraper.scrape_quintoandar", new_callable=AsyncMock, return_value=[comp2]), \
         patch("tools.property_scraper.scrape_chavesnamao", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_zap", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_imovelweb", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.asyncio.sleep", new_callable=AsyncMock), \
         patch("tools.property_scraper._launch_stealth_browser") as mock_launch:
        mock_playwright = AsyncMock()
        mock_playwright.stop = AsyncMock()
        mock_browser = AsyncMock()
        mock_browser.close = AsyncMock()
        mock_page = AsyncMock()
        mock_launch.return_value = (mock_playwright, mock_browser, mock_page)

        result = await scrape_comparables(_make_metadata())

    # Street search yields 2 comps; neighborhood fallback adds more from ZAP
    assert len(result) >= 2
