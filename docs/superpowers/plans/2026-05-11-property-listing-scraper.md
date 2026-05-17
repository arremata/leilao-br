# Property Listing Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Playwright-based scrapers for 4 Brazilian listing sites that extract comparable property data, with Tavily as fallback.

**Architecture:** New `tools/property_scraper.py` with per-site scraper functions returning `ComparableProperty` objects. A dispatcher manages browser lifecycle and tries scrapers sequentially, falling back to Tavily if none return ≥3 comps. The market agent's `_run_market_searches` is modified to call the dispatcher first.

**Tech Stack:** Playwright (existing), playwright-stealth (new), Python asyncio, existing `ComparableProperty` dataclass.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `tools/property_scraper.py` | Create | Per-site scrapers, dispatcher, stealth setup, URL builders |
| `graph/market.py` | Modify | Call `scrape_comparables` before Tavily, merge results |
| `tests/test_property_scraper.py` | Create | Unit tests for all scraper functions |
| `tests/test_market.py` | Modify | Test scraper-first integration |
| `requirements.txt` | Modify | Add `playwright-stealth` |

---

### Task 1: Add playwright-stealth dependency

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Add playwright-stealth to requirements.txt**

Add this line to `requirements.txt`:

```
playwright-stealth>=1.0.6
```

- [ ] **Step 2: Install the dependency**

Run: `pip install playwright-stealth`

Expected: Successfully installed

- [ ] **Step 3: Commit**

```bash
git add requirements.txt
git commit -m "chore: add playwright-stealth dependency"
```

---

### Task 2: Create property_scraper.py with stealth helper, URL builders, and dispatcher skeleton

**Files:**
- Create: `tools/property_scraper.py`
- Create: `tests/test_property_scraper.py`

- [ ] **Step 1: Write failing tests for URL builders and dispatcher**

Create `tests/test_property_scraper.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from graph.state import PropertyMetadata, ComparableProperty
from tools.property_scraper import (
    build_zap_url,
    build_vivareal_url,
    build_quintoandar_url,
    build_chavesnamao_url,
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
# URL builder tests
# ---------------------------------------------------------------------------


def test_build_zap_url():
    meta = _make_metadata()
    url = build_zap_url(meta)
    assert "zapimoveis.com.br" in url
    assert "venda" in url
    assert "SP" in url
    assert "sao-paulo" in url
    assert "moema" in url


def test_build_vivareal_url():
    meta = _make_metadata()
    url = build_vivareal_url(meta)
    assert "vivareal.com.br" in url
    assert "venda" in url
    assert "SP" in url
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
    assert "venda" in url
    assert "sao-paulo" in url
    assert "moema" in url


def test_build_url_handles_missing_neighborhood():
    meta = _make_metadata(neighborhood="")
    for builder in [build_zap_url, build_vivareal_url, build_quintoandar_url, build_chavesnamao_url]:
        url = builder(meta)
        assert url  # Should still produce a valid URL


# ---------------------------------------------------------------------------
# Dispatcher tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_scrape_comparables_returns_early_with_enough_comps():
    """Dispatcher should stop after a scraper returns >= 3 comps."""
    comp = ComparableProperty(
        address="Rua A, 45",
        price=960000.0,
        area_m2=80.0,
        price_per_m2=12000.0,
        source="ZAP",
        url="https://zapimoveis.com.br/imovel/1",
    )
    with patch("tools.property_scraper.scrape_zap", new_callable=AsyncMock, return_value=[comp, comp, comp]), \
         patch("tools.property_scraper.scrape_vivareal", new_callable=AsyncMock) as mock_vr, \
         patch("tools.property_scraper._launch_stealth_browser") as mock_launch:
        mock_browser = AsyncMock()
        mock_browser.close = AsyncMock()
        mock_page = AsyncMock()
        mock_launch.return_value = (mock_browser, mock_page)

        result = await scrape_comparables(_make_metadata())

    assert len(result) >= 3
    mock_vr.assert_not_called()


@pytest.mark.asyncio
async def test_scrape_comparables_falls_through_when_first_fails():
    """If first scraper returns 0 comps, try the next one."""
    comp = ComparableProperty(
        address="Rua B, 78",
        price=800000.0,
        area_m2=70.0,
        price_per_m2=11428.0,
        source="Viva Real",
        url="https://vivareal.com.br/imovel/2",
    )
    with patch("tools.property_scraper.scrape_zap", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_vivareal", new_callable=AsyncMock, return_value=[comp, comp, comp]), \
         patch("tools.property_scraper._launch_stealth_browser") as mock_launch:
        mock_browser = AsyncMock()
        mock_browser.close = AsyncMock()
        mock_page = AsyncMock()
        mock_launch.return_value = (mock_browser, mock_page)

        result = await scrape_comparables(_make_metadata())

    assert len(result) >= 3


@pytest.mark.asyncio
async def test_scrape_comparables_returns_empty_when_all_fail():
    """If all scrapers return empty, dispatcher returns empty list."""
    with patch("tools.property_scraper.scrape_zap", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_vivareal", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_quintoandar", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_chavesnamao", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper._launch_stealth_browser") as mock_launch:
        mock_browser = AsyncMock()
        mock_browser.close = AsyncMock()
        mock_page = AsyncMock()
        mock_launch.return_value = (mock_browser, mock_page)

        result = await scrape_comparables(_make_metadata())

    assert result == []


@pytest.mark.asyncio
async def test_scrape_comparables_merges_partial_results():
    """If two scrapers return 1-2 comps each, they should be merged."""
    comp1 = ComparableProperty(address="Rua A", price=500000.0, area_m2=50.0, price_per_m2=10000.0, source="ZAP", url="https://zap/1")
    comp2 = ComparableProperty(address="Rua B", price=600000.0, area_m2=60.0, price_per_m2=10000.0, source="Viva Real", url="https://vr/2")
    with patch("tools.property_scraper.scrape_zap", new_callable=AsyncMock, return_value=[comp1]), \
         patch("tools.property_scraper.scrape_vivareal", new_callable=AsyncMock, return_value=[comp2]), \
         patch("tools.property_scraper.scrape_quintoandar", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper.scrape_chavesnamao", new_callable=AsyncMock, return_value=[]), \
         patch("tools.property_scraper._launch_stealth_browser") as mock_launch:
        mock_browser = AsyncMock()
        mock_browser.close = AsyncMock()
        mock_page = AsyncMock()
        mock_launch.return_value = (mock_browser, mock_page)

        result = await scrape_comparables(_make_metadata())

    assert len(result) == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_property_scraper.py -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'tools.property_scraper'`

- [ ] **Step 3: Implement property_scraper.py — URL builders, stealth helper, and dispatcher**

Create `tools/property_scraper.py`:

```python
from __future__ import annotations

import asyncio
import random

from loguru import logger
from playwright.async_api import async_playwright, Browser, Page
from playwright_stealth import stealth_async

from graph.state import PropertyMetadata, ComparableProperty

# ---------------------------------------------------------------------------
# URL builders
# ---------------------------------------------------------------------------


def _slug(text: str) -> str:
    """Convert text to URL slug: lowercase, replace spaces/special chars with hyphens."""
    import re
    text = text.lower().strip()
    text = re.sub(r"[áàãâ]", "a", text)
    text = re.sub(r"[éèê]", "e", text)
    text = re.sub(r"[íìî]", "i", text)
    text = re.sub(r"[óòõô]", "o", text)
    text = re.sub(r"[úùû]", "u", text)
    text = re.sub(r"[ç]", "c", text)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = text.strip("-")
    return text


def build_zap_url(metadata: PropertyMetadata) -> str:
    city_slug = _slug(metadata.city)
    neighborhood_slug = _slug(metadata.neighborhood)
    state = metadata.state.lower()
    location = f"{state}+{city_slug}+{neighborhood_slug}" if neighborhood_slug else f"{state}+{city_slug}"
    return f"https://www.zapimoveis.com.br/venda/imoveis/{location}/"


def build_vivareal_url(metadata: PropertyMetadata) -> str:
    city_slug = _slug(metadata.city)
    neighborhood_slug = _slug(metadata.neighborhood)
    state = metadata.state.lower()
    location = f"{state}+{city_slug}+{neighborhood_slug}" if neighborhood_slug else f"{state}+{city_slug}"
    return f"https://www.vivareal.com.br/venda/imoveis/{location}/"


def build_quintoandar_url(metadata: PropertyMetadata) -> str:
    city_slug = _slug(metadata.city)
    neighborhood_slug = _slug(metadata.neighborhood)
    return f"https://www.quintoandar.com.br/comprar/imovel/{city_slug}/{neighborhood_slug}/"


def build_chavesnamao_url(metadata: PropertyMetadata) -> str:
    city_slug = _slug(metadata.city)
    neighborhood_slug = _slug(metadata.neighborhood)
    return f"https://www.chavesnamao.com.br/imoveis/{city_slug}/{neighborhood_slug}/venda/"


# ---------------------------------------------------------------------------
# Stealth browser setup
# ---------------------------------------------------------------------------

STEALTH_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)


async def _launch_stealth_browser() -> tuple[Browser, Page]:
    """Launch a Chromium browser with stealth patches applied."""
    pw = await async_playwright().start()
    browser = await pw.chromium.launch(headless=True)
    context = await browser.new_context(user_agent=STEALTH_USER_AGENT)
    page = await context.new_page()
    await stealth_async(page)
    return browser, page


# ---------------------------------------------------------------------------
# Per-site scrapers
# ---------------------------------------------------------------------------

MAX_COMPS_PER_SITE = 5
PAGE_TIMEOUT_MS = 10000


def _parse_brl(text: str) -> float:
    """Parse a BRL currency string like 'R$ 1.200.000' or 'R$ 950.000,00' into a float."""
    import re
    cleaned = re.sub(r"[R$\s]", "", text)
    cleaned = cleaned.replace(".", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _parse_area(text: str) -> float:
    """Parse area text like '80 m²' or '80m2' into a float."""
    import re
    match = re.search(r"(\d+)", text.replace(".", "").replace(",", "."))
    if match:
        return float(match.group(1))
    return 0.0


async def scrape_zap(page: Page, metadata: PropertyMetadata) -> list[ComparableProperty]:
    """Scrape comparable properties from ZAP Imóveis."""
    url = build_zap_url(metadata)
    logger.info(f"ZAP scraper: navigating to {url}")
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
        await page.wait_for_timeout(3000)

        # Accept cookies popup if present
        cookie_btn = page.locator("button", has_text="Aceitar")
        if await cookie_btn.count() > 0:
            await cookie_btn.first.click()

        cards = page.locator('[data-cy="property-card"]')
        count = await cards.count()
        logger.info(f"ZAP scraper: found {count} cards")

        results = []
        for i in range(min(count, MAX_COMPS_PER_SITE)):
            card = cards.nth(i)
            try:
                price_el = card.locator('[data-cy="property-card-price"]')
                price_text = await price_el.first.text_content() or ""

                address_el = card.locator('[data-cy="property-card-address"]')
                address_text = await address_el.first.text_content() or ""

                link_el = card.locator("a[href*='/imovel/']")
                href = await link_el.first.get_attribute("href") or ""

                # Area may appear in the card details section
                area_text = ""
                details = card.locator("span, li, p")
                detail_count = await details.count()
                for j in range(detail_count):
                    txt = await details.nth(j).text_content() or ""
                    if "m²" in txt or "m2" in txt:
                        area_text = txt
                        break

                price = _parse_brl(price_text)
                area = _parse_area(area_text)

                results.append(ComparableProperty(
                    address=address_text.strip(),
                    price=price,
                    area_m2=area,
                    price_per_m2=round(price / area, 2) if area > 0 else 0.0,
                    source="ZAP Imóveis",
                    url=f"https://www.zapimoveis.com.br{href}" if href.startswith("/") else href,
                ))
            except Exception as e:
                logger.debug(f"ZAP scraper: error parsing card {i}: {e}")
                continue

        return results
    except Exception as e:
        logger.warning(f"ZAP scraper: failed for {url}: {e}")
        return []


async def scrape_vivareal(page: Page, metadata: PropertyMetadata) -> list[ComparableProperty]:
    """Scrape comparable properties from Viva Real."""
    url = build_vivareal_url(metadata)
    logger.info(f"Viva Real scraper: navigating to {url}")
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
        await page.wait_for_timeout(3000)

        # Accept cookies popup if present
        cookie_btn = page.locator("button", has_text="Aceitar")
        if await cookie_btn.count() > 0:
            await cookie_btn.first.click()

        cards = page.locator('[data-testid="property-card"]')
        count = await cards.count()
        logger.info(f"Viva Real scraper: found {count} cards")

        results = []
        for i in range(min(count, MAX_COMPS_PER_SITE)):
            card = cards.nth(i)
            try:
                price_el = card.locator('[data-testid="property-card__price"]')
                price_text = await price_el.first.text_content() or ""

                address_el = card.locator('[data-testid="property-card__address"]')
                address_text = await address_el.first.text_content() or ""

                link_el = card.locator("a[href*='/imovel/']")
                href = await link_el.first.get_attribute("href") or ""

                area_text = ""
                details = card.locator("span, li, p")
                detail_count = await details.count()
                for j in range(detail_count):
                    txt = await details.nth(j).text_content() or ""
                    if "m²" in txt or "m2" in txt:
                        area_text = txt
                        break

                price = _parse_brl(price_text)
                area = _parse_area(area_text)

                results.append(ComparableProperty(
                    address=address_text.strip(),
                    price=price,
                    area_m2=area,
                    price_per_m2=round(price / area, 2) if area > 0 else 0.0,
                    source="Viva Real",
                    url=f"https://www.vivareal.com.br{href}" if href.startswith("/") else href,
                ))
            except Exception as e:
                logger.debug(f"Viva Real scraper: error parsing card {i}: {e}")
                continue

        return results
    except Exception as e:
        logger.warning(f"Viva Real scraper: failed for {url}: {e}")
        return []


async def scrape_quintoandar(page: Page, metadata: PropertyMetadata) -> list[ComparableProperty]:
    """Scrape comparable properties from QuintoAndar."""
    url = build_quintoandar_url(metadata)
    logger.info(f"QuintoAndar scraper: navigating to {url}")
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
        await page.wait_for_timeout(4000)  # QuintoAndar is SPA, needs more time

        # QuintoAndar card structure uses data-testid or class patterns
        cards = page.locator('[data-testid="property-card"], div[class*="PropertyCard"], a[class*="property-card"]')
        count = await cards.count()
        logger.info(f"QuintoAndar scraper: found {count} cards")

        results = []
        for i in range(min(count, MAX_COMPS_PER_SITE)):
            card = cards.nth(i)
            try:
                card_text = await card.text_content() or ""

                # Try to extract price (QuintoAndar shows "R$ X.XXX/mês" or "R$ X.XXX")
                price = 0.0
                area = 0.0
                address = ""

                # Price
                price_el = card.locator("[class*='price'], [class*='Price'], [data-testid*='price']")
                if await price_el.count() > 0:
                    price = _parse_brl(await price_el.first.text_content() or "")

                # Address
                addr_el = card.locator("[class*='address'], [class*='Address'], [class*='location']")
                if await addr_el.count() > 0:
                    address = (await addr_el.first.text_content() or "").strip()

                # Area
                area_match = None
                import re
                area_match = re.search(r"(\d+)\s*m[²2]", card_text)
                if area_match:
                    area = float(area_match.group(1))

                # URL
                href = ""
                link_el = card.locator("a")
                if await link_el.count() > 0:
                    href = await link_el.first.get_attribute("href") or ""

                results.append(ComparableProperty(
                    address=address,
                    price=price,
                    area_m2=area,
                    price_per_m2=round(price / area, 2) if area > 0 else 0.0,
                    source="QuintoAndar",
                    url=f"https://www.quintoandar.com.br{href}" if href.startswith("/") else href,
                ))
            except Exception as e:
                logger.debug(f"QuintoAndar scraper: error parsing card {i}: {e}")
                continue

        return results
    except Exception as e:
        logger.warning(f"QuintoAndar scraper: failed for {url}: {e}")
        return []


async def scrape_chavesnamao(page: Page, metadata: PropertyMetadata) -> list[ComparableProperty]:
    """Scrape comparable properties from Chaves na Mão."""
    url = build_chavesnamao_url(metadata)
    logger.info(f"Chaves na Mão scraper: navigating to {url}")
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
        await page.wait_for_timeout(3000)

        cards = page.locator('[class*="card-imovel"], [class*="property-card"], article[class*="imovel"]')
        count = await cards.count()
        logger.info(f"Chaves na Mão scraper: found {count} cards")

        results = []
        for i in range(min(count, MAX_COMPS_PER_SITE)):
            card = cards.nth(i)
            try:
                price_el = card.locator("[class*='price'], [class*='valor'], [class*='Price']")
                price_text = await price_el.first.text_content() or "" if await price_el.count() > 0 else ""

                addr_el = card.locator("[class*='address'], [class*='location'], [class*='endereco']")
                address_text = await addr_el.first.text_content() or "" if await addr_el.count() > 0 else ""

                card_text = await card.text_content() or ""
                import re
                area_match = re.search(r"(\d+)\s*m[²2]", card_text)
                area = float(area_match.group(1)) if area_match else 0.0

                price = _parse_brl(price_text)

                link_el = card.locator("a")
                href = await link_el.first.get_attribute("href") or "" if await link_el.count() > 0 else ""

                results.append(ComparableProperty(
                    address=address_text.strip(),
                    price=price,
                    area_m2=area,
                    price_per_m2=round(price / area, 2) if area > 0 else 0.0,
                    source="Chaves na Mão",
                    url=f"https://www.chavesnamao.com.br{href}" if href.startswith("/") else href,
                ))
            except Exception as e:
                logger.debug(f"Chaves na Mão scraper: error parsing card {i}: {e}")
                continue

        return results
    except Exception as e:
        logger.warning(f"Chaves na Mão scraper: failed for {url}: {e}")
        return []


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

MIN_COMPS = 3


async def scrape_comparables(metadata: PropertyMetadata) -> list[ComparableProperty]:
    """Try each site scraper sequentially. Stop early when >= MIN_COMPS found.

    Manages the browser lifecycle: launches one browser, reuses the page
    across scrapers, closes when done.
    """
    browser, page = await _launch_stealth_browser()
    try:
        all_comps: list[ComparableProperty] = []

        scrapers = [
            ("ZAP Imóveis", scrape_zap),
            ("Viva Real", scrape_vivareal),
            ("QuintoAndar", scrape_quintoandar),
            ("Chaves na Mão", scrape_chavesnamao),
        ]

        for name, scraper in scrapers:
            if len(all_comps) >= MIN_COMPS:
                logger.info(f"Property scraper: {len(all_comps)} comps found, skipping {name}")
                break

            comps = await scraper(page, metadata)
            logger.info(f"Property scraper: {name} returned {len(comps)} comps")
            all_comps.extend(comps)

            # Random delay between scrapers to avoid rate limits
            if len(all_comps) < MIN_COMPS:
                await asyncio.sleep(random.uniform(1.0, 3.0))

        return all_comps
    finally:
        await browser.close()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_property_scraper.py -v`

Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add tools/property_scraper.py tests/test_property_scraper.py
git commit -m "feat: add property listing scrapers with stealth browser and dispatcher"
```

---

### Task 3: Integrate scrapers into market agent

**Files:**
- Modify: `graph/market.py:34-54`
- Modify: `tests/test_market.py`

- [ ] **Step 1: Write failing test for scraper-first integration**

Add to `tests/test_market.py`:

```python
import json
from unittest.mock import patch, MagicMock, AsyncMock

from graph.state import AuctionState, PropertyMetadata, ComparableProperty
from graph.market import market_node


def _make_state(**overrides):
    defaults = dict(
        pdf_texts="Edital de Leilao",
        pdf_sources=["edital.pdf"],
        property_metadata=PropertyMetadata(
            address="Rua das Flores, 123, Centro, Sao Paulo - SP",
            property_type="Apartamento",
            area_m2=80.0,
            auction_price=350000.0,
            auction_date="15/06/2025",
            auction_type="Judicial",
            city="Sao Paulo",
            neighborhood="Centro",
            state="SP",
        ),
        research_plan="Research market prices in Centro, Sao Paulo",
    )
    defaults.update(overrides)
    return AuctionState(**defaults)


def _mock_llm_response(data: dict) -> MagicMock:
    mock = MagicMock()
    mock.choices = [
        MagicMock(
            message=MagicMock(content=json.dumps(data))
        )
    ]
    return mock


class TestMarketNodeScraperIntegration:
    def test_market_node_uses_scraper_comps_first(self):
        """When scrapers return >=3 comps, Tavily should not be called for comparable queries."""
        state = _make_state()
        comp = ComparableProperty(
            address="Rua A, 45",
            price=960000.0,
            area_m2=80.0,
            price_per_m2=12000.0,
            source="ZAP Imóveis",
            url="https://zapimoveis.com.br/imovel/1",
        )
        llm_data = {
            "price_per_m2_neighborhood": 12000.0,
            "price_per_m2_city": 9500.0,
            "comparable_properties": [
                {"address": "Rua A, 45", "price": 960000.0, "area_m2": 80.0, "price_per_m2": 12000.0, "source": "ZAP", "url": "https://zap/1"},
            ],
            "reform_estimate": 25000.0,
            "area_appreciation_1y": 5.0,
            "area_appreciation_3y": 15.0,
            "area_appreciation_5y": 30.0,
            "city_appreciation_1y": 4.0,
            "liquidity_days": 45,
            "tendencies": "Mercado em alta",
            "discount_percentage": 30.0,
            "market_score": 8,
            "raw_findings": "Scraper comps + Tavily data",
        }

        with patch("graph.market.scrape_comparables", new_callable=AsyncMock, return_value=[comp, comp, comp]) as mock_scrape, \
             patch("graph.market.web_search_multiple", new_callable=AsyncMock, return_value=[]) as mock_tavily, \
             patch("graph.market._call_market_llm", return_value=_mock_llm_response(llm_data)):
            result = market_node(state)

        assert result["market_result"].market_score == 8
        mock_scrape.assert_called_once()
        # Tavily should still be called for non-comp data (appreciation, reform, etc.)
        assert mock_tavily.called

    def test_market_node_falls_back_to_tavily_when_scrapers_fail(self):
        """When scrapers return <3 comps, Tavily should run all queries."""
        state = _make_state()
        llm_data = {
            "price_per_m2_neighborhood": 10000.0,
            "price_per_m2_city": 8000.0,
            "comparable_properties": [],
            "reform_estimate": 20000.0,
            "area_appreciation_1y": 3.0,
            "area_appreciation_3y": 10.0,
            "area_appreciation_5y": 25.0,
            "city_appreciation_1y": 2.5,
            "liquidity_days": 60,
            "tendencies": "Estavel",
            "discount_percentage": 15.0,
            "market_score": 6,
            "raw_findings": "Tavily only",
        }

        with patch("graph.market.scrape_comparables", new_callable=AsyncMock, return_value=[]) as mock_scrape, \
             patch("graph.market.web_search_multiple", new_callable=AsyncMock, return_value=[{"title": "Preco", "url": "http://x", "content": "R$ 10.000"}]) as mock_tavily, \
             patch("graph.market._call_market_llm", return_value=_mock_llm_response(llm_data)):
            result = market_node(state)

        assert result["market_result"].market_score == 6
        mock_scrape.assert_called_once()
        assert mock_tavily.called

    def test_market_node_merges_partial_scraper_results(self):
        """When scrapers return 1-2 comps, they should be merged with Tavily results."""
        state = _make_state()
        comp = ComparableProperty(
            address="Rua B, 99",
            price=880000.0,
            area_m2=80.0,
            price_per_m2=11000.0,
            source="QuintoAndar",
            url="https://quintoandar.com.br/imovel/2",
        )
        llm_data = {
            "price_per_m2_neighborhood": 11000.0,
            "price_per_m2_city": 9000.0,
            "comparable_properties": [],
            "reform_estimate": 22000.0,
            "area_appreciation_1y": 4.0,
            "area_appreciation_3y": 12.0,
            "area_appreciation_5y": 28.0,
            "city_appreciation_1y": 3.0,
            "liquidity_days": 50,
            "tendencies": "Mercado estavel",
            "discount_percentage": 20.0,
            "market_score": 7,
            "raw_findings": "Partial scraper + Tavily",
        }

        with patch("graph.market.scrape_comparables", new_callable=AsyncMock, return_value=[comp]) as mock_scrape, \
             patch("graph.market.web_search_multiple", new_callable=AsyncMock, return_value=[{"title": "Preco", "url": "http://x", "content": "R$ 11.000"}]) as mock_tavily, \
             patch("graph.market._call_market_llm", return_value=_mock_llm_response(llm_data)):
            result = market_node(state)

        assert result["market_result"].market_score == 7
        mock_scrape.assert_called_once()
        assert mock_tavily.called
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_market.py::TestMarketNodeScraperIntegration -v`

Expected: FAIL — `scrape_comparables` not imported in `graph/market.py`

- [ ] **Step 3: Modify market.py to integrate scrapers**

In `graph/market.py`, make these changes:

**Add import at top (after existing imports):**
```python
from tools.property_scraper import scrape_comparables
```

**Replace `_run_market_searches` function (lines 34-54) with:**
```python
async def _run_market_searches(metadata) -> tuple[list[dict], list[ComparableProperty]]:
    """Run scrapers first, then Tavily for supplementary data. Returns (search_results, scraped_comps)."""
    def _get(attr):
        return getattr(metadata, attr, "") if hasattr(metadata, attr) else metadata.get(attr, "")

    neighborhood = _get("neighborhood")
    city = _get("city")
    state = _get("state")
    property_type = _get("property_type")

    # Step 1: Try property scrapers
    scraped_comps = await scrape_comparables(metadata)
    logger.info(f"Market agent: scrapers returned {len(scraped_comps)} comparable properties")

    # Step 2: Run Tavily for supplementary data (always needed for appreciation, reform, trends)
    queries = [
        f"preço m² {neighborhood} {city} {state}",
        f"valorização imobiliária {city} 2024 2025",
        f"liquidez imóveis {neighborhood} {city}",
        f"tendências mercado imobiliário {city} {state}",
        f"custo reforma {property_type.lower()} {city} pintura piso",
    ]

    # Only add comparable search query if scrapers didn't return enough
    if len(scraped_comps) < 3:
        queries.insert(1, f"imóveis à venda {neighborhood} {city}")

    search_results = await web_search_multiple(queries)
    return search_results, scraped_comps
```

**Modify `_call_market_llm` signature and body to accept scraped comps (lines 57-87):**

Replace the entire `_call_market_llm` function with:
```python
def _call_market_llm(metadata, search_results: list[dict], scraped_comps: list[ComparableProperty] | None = None) -> object:
    """Call GPT-4o via LiteLLM/OpenRouter for market analysis."""
    settings = get_settings()

    search_text = "\n".join(
        f"[{r.get('title', '')}] {r.get('content', '')} (Source: {r.get('url', '')})"
        for r in search_results
    )

    # Prepend scraped comparable properties as structured data
    if scraped_comps:
        comp_lines = "\n".join(
            f"[Comparable Property] {c.address} | Price: R$ {c.price:,.0f} | Area: {c.area_m2} m² | "
            f"Price/m²: R$ {c.price_per_m2:,.0f} | Source: {c.source} | URL: {c.url}"
            for c in scraped_comps
        )
        search_text = f"SCRAPED COMPARABLE PROPERTIES (high confidence):\n{comp_lines}\n\n{search_text}"

    def _get(attr):
        return getattr(metadata, attr, "") if hasattr(metadata, attr) else metadata.get(attr, "")

    property_info = (
        f"Property: {_get('property_type')} at {_get('address')}\n"
        f"Area: {_get('area_m2')} m²\n"
        f"Auction Price: R$ {_get('auction_price')}\n"
        f"Market Value Estimate: R$ {_get('market_value_estimate') or 'N/A'}\n"
        f"Neighborhood: {_get('neighborhood')}, {_get('city')} - {_get('state')}\n"
    )

    return litellm.completion(
        model="openai/gpt-5.4",
        api_key=settings.openrouter_api_key,
        api_base=settings.api_base,
        max_tokens=4096,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": MARKET_SYSTEM_PROMPT},
            {"role": "user", "content": f"Property Info:\n{property_info}\n\nSearch Results:\n{search_text}"},
        ],
    )
```

**Modify `market_node` function (lines 104-136) to use the new return type:**

Replace the `market_node` function with:
```python
def market_node(state: AuctionState) -> dict:
    """LangGraph node: Analyze market conditions for the property."""
    metadata = state.property_metadata if hasattr(state, 'property_metadata') else state.get("property_metadata")
    if not metadata:
        logger.warning("Market agent: no property metadata available")
        return {
            "market_result": MarketResult(market_score=0, raw_findings="No property metadata available"),
            "errors": ["No property metadata for market analysis"],
        }

    logger.info(f"Market agent: researching {getattr(metadata, 'address', 'unknown property')}")

    search_results, scraped_comps = asyncio.run(_run_market_searches(metadata))
    logger.info(f"Market agent: collected {len(search_results)} search results, {len(scraped_comps)} scraped comps")

    response = _call_market_llm(metadata, search_results, scraped_comps)
    response_text = response.choices[0].message.content

    try:
        # Strip markdown code block wrappers if present
        text = response_text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            text = text.rsplit("```", 1)[0]
        parsed = json.loads(text.strip())
        market_result = _parse_market_result(parsed)
    except (json.JSONDecodeError, TypeError) as e:
        logger.error(f"Failed to parse market response: {e}")
        market_result = MarketResult(market_score=0, raw_findings=response_text)

    logger.info(f"Market agent: score={market_result.market_score}, discount={market_result.discount_percentage}%")

    return {"market_result": market_result}
```

- [ ] **Step 4: Run all market tests to verify they pass**

Run: `pytest tests/test_market.py -v`

Expected: All tests PASS (both old and new)

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `pytest tests/ -v --ignore=tests/test_app.py`

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add graph/market.py tests/test_market.py
git commit -m "feat: integrate property scrapers into market agent with Tavily fallback"
```

---

### Task 4: End-to-end manual validation

**Files:** None (manual testing)

- [ ] **Step 1: Run the app and test with a real auction URL**

Run: `python app.py`

Test with a real auction URL containing a property in a known neighborhood. Check the logs for:
- `Property scraper: ZAP Imóveis returned N comps` or `ZAP scraper: failed`
- `Market agent: collected X search results, Y scraped comps`
- Whether the final `MarketResult` includes scraped comparable properties

- [ ] **Step 2: Verify fallback works**

If scrapers are blocked (likely for ZAP/Viva Real), confirm:
- Logs show warnings like `ZAP scraper: failed`
- Tavily fallback kicks in and analysis still completes
- The `MarketResult` still has reasonable data

- [ ] **Step 3: Verify successful scraper data**

If any scraper succeeds (likely QuintoAndar), confirm:
- Comparable properties have real addresses, prices, and areas
- `price_per_m2` values are reasonable for the neighborhood
- URLs point to real listings

---

## Self-Review

**1. Spec coverage:**
- Per-site scrapers (ZAP, Viva Real, QuintoAndar, Chaves na Mão) → Task 2
- Dispatcher with early return at ≥3 comps → Task 2
- Stealth browser + user-agent → Task 2
- Sequential execution with random delays → Task 2
- Integration with market agent → Task 3
- Tavily fallback → Task 3
- Scraped comps prepended to LLM input → Task 3
- playwright-stealth dependency → Task 1
- Silent failures (empty list on error) → Task 2
- Manual validation → Task 4

**2. Placeholder scan:** No TBD, TODO, or "implement later" found. All steps contain complete code.

**3. Type consistency:**
- `scrape_comparables(metadata: PropertyMetadata) -> list[ComparableProperty]` — consistent across Task 2 (definition) and Task 3 (usage in mock patches)
- `_run_market_searches` returns `tuple[list[dict], list[ComparableProperty]]` — used consistently in `market_node`
- `_call_market_llm` accepts `scraped_comps: list[ComparableProperty] | None` — called with scraped_comps from `_run_market_searches`
- `ComparableProperty` fields (address, price, area_m2, price_per_m2, source, url) — consistent across all test and implementation code
