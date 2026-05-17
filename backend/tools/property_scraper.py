from __future__ import annotations

import asyncio
import random
import re

from loguru import logger
from playwright.async_api import async_playwright, Browser, Page
from playwright_stealth import Stealth

from graph.state import PropertyMetadata, ComparableProperty

# ---------------------------------------------------------------------------
# URL builders
# ---------------------------------------------------------------------------


def _slug(text: str) -> str:
    """Convert text to URL slug: lowercase, replace spaces/special chars with hyphens."""
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


def _extract_street(address: str) -> str:
    """Extract street name from a Brazilian address.

    Handles patterns like:
    - "Rua das Flores, 123, Centro, Sao Paulo - SP" -> "Rua das Flores"
    - "Av. Paulista, 1000" -> "Av. Paulista"
    - "Rua A, 45, Bairro" -> "Rua A"
    - "Rua Algacyr Munhoz Maedre nº 2411, Apto 23" -> "Rua Algacyr Munhoz Maedre"
    """
    # Split on comma and take the first part (street name + number prefix)
    parts = address.split(",")
    if not parts:
        return ""
    street = parts[0].strip()
    # Remove "nº" / "n." and any trailing number (house number) from the street part
    street = re.sub(r"\s*n[ºo.]?\s*\d+$", "", street, flags=re.IGNORECASE).strip()
    # Also remove bare trailing numbers
    street = re.sub(r"\s+\d+$", "", street).strip()
    return street


def _abbreviate_neighborhood(name: str) -> str:
    """Shorten common neighborhood suffixes for ZAP/VivaReal URL compatibility.

    "Cidade Industrial de Curitiba (CIC)" -> "cid-industrial"
    "Moema" -> "moema"
    """
    text = name.lower().strip()
    # Remove parenthetical abbreviations like (CIC)
    text = re.sub(r"\s*\(.*?\)", "", text)
    # Remove city name suffix (e.g. "de Curitiba" from "Cidade Industrial de Curitiba")
    # Common pattern: neighborhood names that include the city name
    text = re.sub(r"\s+de\s+\S+$", "", text)
    text = re.sub(r"\s+da\s+\S+$", "", text)
    text = re.sub(r"\s+do\s+\S+$", "", text)
    # Abbreviate common long words
    text = text.replace("cidade", "cid")
    text = text.replace("industrial", "industrial")
    return _slug(text)


def _neighborhood_slug_clean(name: str) -> str:
    """Clean neighborhood name for URL path — removes (CIC) suffixes, keeps core name.

    "Cidade Industrial de Curitiba (CIC)" -> "cidade-industrial"
    "Moema" -> "moema"
    """
    text = name.lower().strip()
    # Remove parenthetical abbreviations like (CIC)
    text = re.sub(r"\s*\(.*?\)", "", text)
    # Remove city name suffix
    text = re.sub(r"\s+de\s+\S+$", "", text)
    text = re.sub(r"\s+da\s+\S+$", "", text)
    text = re.sub(r"\s+do\s+\S+$", "", text)
    return _slug(text)


# State full-name mapping (abbreviation -> full name in Portuguese)
_STATE_FULL_NAMES = {
    "AC": "acre", "AL": "alagoas", "AP": "amapa", "AM": "amazonas",
    "BA": "bahia", "CE": "ceara", "DF": "distrito-federal", "ES": "espirito-santo",
    "GO": "goias", "MA": "maranhao", "MT": "mato-grosso", "MS": "mato-grosso-do-sul",
    "MG": "minas-gerais", "PA": "para", "PB": "paraiba", "PR": "parana",
    "PE": "pernambuco", "PI": "piaui", "RJ": "rio-de-janeiro", "RN": "rio-grande-do-norte",
    "RS": "rio-grande-do-sul", "RO": "rondonia", "RR": "roraima", "SC": "santa-catarina",
    "SP": "sao-paulo", "SE": "sergipe", "TO": "tocantins",
}


def build_zap_url(metadata: PropertyMetadata, location_override: str = "") -> str:
    from urllib.parse import quote
    city_slug = _slug(metadata.city)
    state = metadata.state.lower()
    state_full = _STATE_FULL_NAMES.get(metadata.state.upper(), _slug(metadata.state))
    loc = location_override or metadata.neighborhood
    loc_slug = _abbreviate_neighborhood(loc) if loc else ""

    if loc_slug:
        location = f"{state}+{city_slug}++{loc_slug}"
        onde = (
            f",{state_full.replace('-', ' ').title()},{metadata.city},,{loc},,,neighborhood,"
            f"BR>{state_full}>NULL>{metadata.city}>Barrios>{loc},-25.488999,-49.294193,"
        )
        return f"https://www.zapimoveis.com.br/venda/imoveis/{location}/?onde={quote(onde)}"
    return f"https://www.zapimoveis.com.br/venda/imoveis/{state}+{city_slug}/"


def build_vivareal_url(metadata: PropertyMetadata, location_override: str = "") -> str:
    from urllib.parse import quote
    city_slug = _slug(metadata.city)
    state = metadata.state.upper()
    state_full = _STATE_FULL_NAMES.get(state, _slug(metadata.state))
    loc = location_override or metadata.neighborhood
    loc_slug = _neighborhood_slug_clean(loc) if loc else ""

    if loc_slug:
        onde = (
            f",{state_full.replace('-', ' ').title()},{metadata.city},,{loc},,,neighborhood,"
            f"BR>{state_full}>NULL>{metadata.city}>Barrios>{loc},-25.488999,-49.294193,"
        )
        return (
            f"https://www.vivareal.com.br/venda/{state_full}/{city_slug}/bairros/{loc_slug}/"
            f"?onde={quote(onde)}"
        )
    return f"https://www.vivareal.com.br/venda/{state_full}/{city_slug}/"


def build_quintoandar_url(metadata: PropertyMetadata, location_override: str = "") -> str:
    city_slug = _slug(metadata.city)
    state_slug = _slug(metadata.state)
    loc = location_override or metadata.neighborhood
    loc_slug = _neighborhood_slug_clean(loc) if loc else ""

    if loc_slug:
        return f"https://www.quintoandar.com.br/comprar/imovel/{loc_slug}-{city_slug}-{state_slug}-brasil/"
    return f"https://www.quintoandar.com.br/comprar/imovel/{city_slug}-{state_slug}-brasil/"


def build_chavesnamao_url(metadata: PropertyMetadata, location_override: str = "") -> str:
    city_slug = _slug(metadata.city)
    state_slug = _slug(metadata.state)
    loc = location_override or metadata.neighborhood
    loc_slug = _neighborhood_slug_clean(loc) if loc else ""

    if loc_slug:
        return f"https://www.chavesnamao.com.br/imoveis-a-venda/{state_slug}-{city_slug}/{loc_slug}/"
    return f"https://www.chavesnamao.com.br/imoveis-a-venda/{state_slug}-{city_slug}/"


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
    context = await browser.new_context(
        user_agent=STEALTH_USER_AGENT,
        viewport={"width": 1920, "height": 1080},
    )
    page = await context.new_page()
    await Stealth().apply_stealth_async(page)
    return browser, page


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

MAX_COMPS_PER_SITE = 5
PAGE_TIMEOUT_MS = 15000


def _parse_brl(text: str) -> float:
    """Parse a BRL currency string like 'R$ 1.200.000' or 'R$ 950.000,00' into a float."""
    cleaned = re.sub(r"[R$\s]", "", text)
    cleaned = cleaned.replace(".", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _parse_area(text: str) -> float:
    """Parse area text like '80 m²' or '80m2' into a float."""
    match = re.search(r"(\d+)", text.replace(".", "").replace(",", "."))
    if match:
        return float(match.group(1))
    return 0.0


def _parse_price_from_text(text: str) -> float:
    """Extract first BRL price from free-form text like 'R$ 213.000 R$ 441 Condo.'."""
    match = re.search(r"R\$\s*[\d.]+", text)
    if match:
        return _parse_brl(match.group(0))
    return 0.0


def _parse_area_from_text(text: str) -> float:
    """Extract area in m² from free-form text like '40 m²' or '296 m²'."""
    match = re.search(r"(\d+)\s*m[²2]", text)
    if match:
        return float(match.group(1))
    return 0.0


def _parse_address_from_text(text: str) -> str:
    """Extract address from card text like 'Rua Walace Landal, Santa Cândida · Curitiba'."""
    # Try to find "Rua/Av/Avenida/Alameda ..." stopping at:
    # - · (bullet), newline (hard boundaries)
    # - "m²"/"m2", "R$", "Condomínio" (noise boundaries)
    match = re.search(
        r"(Rua|Av\.|Avenida|Alameda|Travessa|Rod\.|Estrada)[^·\n]+?(?=\s*\d+\s*m[²2]|\s*R\$|\s*Condomínio)",
        text, re.IGNORECASE,
    )
    if match:
        addr = match.group(0).strip().rstrip(",")
        return addr
    # Fallback: match up to · or newline (simple, covers most cases)
    match = re.search(
        r"(Rua|Av\.|Avenida|Alameda|Travessa|Rod\.|Estrada)[^·\n]+",
        text, re.IGNORECASE,
    )
    if match:
        addr = match.group(0).strip().rstrip(",")
        return addr
    return ""


def _is_rental(text: str, title: str = "") -> bool:
    """Check if a listing is a rental (aluguel) rather than a sale (venda)."""
    combined = f"{text} {title}".lower()
    return "alugar" in combined or "aluguel" in combined or "/alugar/" in combined


# ---------------------------------------------------------------------------
# Per-site scrapers
# ---------------------------------------------------------------------------


async def scrape_zap(page: Page, metadata: PropertyMetadata, location_override: str = "") -> list[ComparableProperty]:
    """Scrape comparable properties from ZAP Imóveis.

    ZAP and Viva Real share the same OLX platform. Cards are <a> elements
    with class containing 'Card-module-scss-module'.
    """
    url = build_zap_url(metadata, location_override=location_override)
    logger.info(f"ZAP scraper: navigating to {url}")
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
        await asyncio.sleep(3)

        # Accept cookies popup if present
        try:
            cookie_btn = page.locator("button", has_text="Aceitar")
            if await cookie_btn.count() > 0:
                await cookie_btn.first.click(timeout=3000)
        except Exception:
            pass

        # ZAP/VivaReal cards: <a> with Card-module-scss-module class
        cards = page.locator('a[class*="Card-module-scss-module"]')
        count = await cards.count()
        logger.info(f"ZAP scraper: found {count} cards")

        results = []
        for i in range(min(count, MAX_COMPS_PER_SITE * 2)):
            card = cards.nth(i)
            try:
                href = await card.get_attribute("href") or ""
                card_text = await card.text_content() or ""
                title = await card.get_attribute("title") or ""

                # Skip rental listings
                if _is_rental(card_text, title):
                    continue

                address = title if title else _parse_address_from_text(card_text)
                price = _parse_price_from_text(card_text)
                area = _parse_area_from_text(card_text)

                results.append(ComparableProperty(
                    address=address.strip(),
                    price=price,
                    area_m2=area,
                    price_per_m2=round(price / area, 2) if area > 0 else 0.0,
                    source="ZAP Imóveis",
                    url=href if href.startswith("http") else f"https://www.zapimoveis.com.br{href}",
                ))

                if len(results) >= MAX_COMPS_PER_SITE:
                    break
            except Exception as e:
                logger.debug(f"ZAP scraper: error parsing card {i}: {e}")
                continue

        return results
    except Exception as e:
        logger.warning(f"ZAP scraper: failed for {url}: {e}")
        return []


async def scrape_vivareal(page: Page, metadata: PropertyMetadata, location_override: str = "") -> list[ComparableProperty]:
    """Scrape comparable properties from Viva Real.

    Same OLX platform as ZAP — identical card structure.
    """
    url = build_vivareal_url(metadata, location_override=location_override)
    logger.info(f"Viva Real scraper: navigating to {url}")
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
        await asyncio.sleep(3)

        # Accept cookies popup if present
        try:
            cookie_btn = page.locator("button", has_text="Aceitar")
            if await cookie_btn.count() > 0:
                await cookie_btn.first.click(timeout=3000)
        except Exception:
            pass

        cards = page.locator('a[class*="Card-module-scss-module"]')
        count = await cards.count()
        logger.info(f"Viva Real scraper: found {count} cards")

        results = []
        for i in range(min(count, MAX_COMPS_PER_SITE * 2)):
            card = cards.nth(i)
            try:
                href = await card.get_attribute("href") or ""
                card_text = await card.text_content() or ""
                title = await card.get_attribute("title") or ""

                # Skip rental listings
                if _is_rental(card_text, title):
                    continue

                address = title if title else _parse_address_from_text(card_text)
                price = _parse_price_from_text(card_text)
                area = _parse_area_from_text(card_text)

                results.append(ComparableProperty(
                    address=address.strip(),
                    price=price,
                    area_m2=area,
                    price_per_m2=round(price / area, 2) if area > 0 else 0.0,
                    source="Viva Real",
                    url=href if href.startswith("http") else f"https://www.vivareal.com.br{href}",
                ))

                if len(results) >= MAX_COMPS_PER_SITE:
                    break
            except Exception as e:
                logger.debug(f"Viva Real scraper: error parsing card {i}: {e}")
                continue

        return results
    except Exception as e:
        logger.warning(f"Viva Real scraper: failed for {url}: {e}")
        return []


async def scrape_quintoandar(page: Page, metadata: PropertyMetadata, location_override: str = "") -> list[ComparableProperty]:
    """Scrape comparable properties from QuintoAndar.

    Cards use FindHouseCard wrapper divs with Cozy__ prefixed classes.
    Key data is in the aria-label and text content.
    """
    url = build_quintoandar_url(metadata, location_override=location_override)
    logger.info(f"QuintoAndar scraper: navigating to {url}")
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
        await asyncio.sleep(4)

        # Accept cookies popup if present — use a short timeout to avoid blocking
        try:
            cookie_btn = page.locator('button:has-text("Aceitar"), button:has-text("Entendi")')
            if await cookie_btn.count() > 0:
                await cookie_btn.first.click(timeout=2000)
        except Exception:
            pass

        # QuintoAndar cards: div with FindHouseCard class (the top-level wrapper)
        cards = page.locator('div[class*="FindHouseCard"][role="group"]')
        count = await cards.count()
        logger.info(f"QuintoAndar scraper: found {count} cards")

        results = []
        for i in range(min(count, MAX_COMPS_PER_SITE)):
            card = cards.nth(i)
            try:
                card_text = await card.text_content() or ""
                aria_label = await card.get_attribute("aria-label") or ""

                # Skip rental listings
                if _is_rental(card_text, aria_label):
                    continue

                # Price: first R$ value in text (the sale price, not condo fee)
                price = _parse_price_from_text(card_text)

                # Area from aria-label or text
                area = _parse_area_from_text(aria_label) or _parse_area_from_text(card_text)

                # Address: extract from aria-label which is structured
                # Format: "Exclusivo. Santa Cândida, Curitiba, Rua Walace Landal. 40 metros quadrados..."
                # or: "Exclusivo, Compre já alugado. Hauer, Curitiba, Rua Paulo Setúbal. 296 metros..."
                address = ""
                if aria_label:
                    # Remove leading tags like "Exclusivo. " or "Exclusivo, Compre já alugado. "
                    clean = re.sub(r"^[^.]*\.\s*", "", aria_label)
                    # Take text before the first period (which starts the area description)
                    before_period = clean.split(".")[0].strip()
                    # Format: "Santa Cândida, Curitiba, Rua Walace Landal"
                    # Try to extract the street part
                    street = _parse_address_from_text(before_period)
                    if street:
                        address = street
                    else:
                        # Fall back to neighborhood, city
                        parts = [p.strip() for p in before_period.split(",")]
                        if len(parts) >= 2:
                            address = f"{parts[0]}, {parts[1]}"
                        elif parts:
                            address = parts[0]

                # URL: find the first link inside the card
                href = ""
                link_el = card.locator("a")
                if await link_el.count() > 0:
                    href = await link_el.first.get_attribute("href") or ""

                results.append(ComparableProperty(
                    address=address.strip(),
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


async def scrape_chavesnamao(page: Page, metadata: PropertyMetadata, location_override: str = "") -> list[ComparableProperty]:
    """Scrape comparable properties from Chaves na Mão.

    URL format: /imoveis/{city}-{state}/ (e.g. /imoveis/curitiba-pr/)
    No sub-paths for neighborhood or property type — city-level only.
    Cards are <a> links with href containing '/imovel/' and class 'link_rawLink'.
    """
    url = build_chavesnamao_url(metadata, location_override=location_override)
    logger.info(f"Chaves na Mão scraper: navigating to {url}")
    try:
        await page.goto(url, wait_until="networkidle", timeout=PAGE_TIMEOUT_MS)
        await asyncio.sleep(3)

        # Accept cookies popup if present
        try:
            cookie_btn = page.locator("button", has_text="Aceitar")
            if await cookie_btn.count() > 0:
                await cookie_btn.first.click(timeout=3000)
        except Exception:
            pass

        # Chaves na Mão: property links with /imovel/ in href
        cards = page.locator('a[href*="/imovel/"]')
        count = await cards.count()
        logger.info(f"Chaves na Mão scraper: found {count} cards")

        results = []
        for i in range(min(count, MAX_COMPS_PER_SITE * 2)):
            card = cards.nth(i)
            try:
                href = await card.get_attribute("href") or ""
                card_text = await card.text_content() or ""
                title = await card.get_attribute("title") or ""

                # Skip rental listings — only want "venda"
                if _is_rental(card_text, title):
                    continue

                # Price
                price = _parse_price_from_text(card_text)

                # Area: prefer text parsing, fall back to URL slug
                area = _parse_area_from_text(card_text)
                if area == 0:
                    area_match = re.search(r"(\d+)m2", href, re.IGNORECASE)
                    if area_match:
                        area = float(area_match.group(1))

                # Address: use title which is cleaner
                # Title: "Apartamento para Venda em Curitiba, Água Verde, 3 dormitórios..."
                # or: "Sobrado para Venda em Curitiba, Alto Boqueirão, 3 dormitórios..."
                address = ""
                if title:
                    # Try to extract street from title
                    street = _parse_address_from_text(title)
                    if street:
                        address = street
                    else:
                        # Extract "City, Neighborhood" from title
                        match = re.search(r"em\s+([^,]+),\s*([^,]+)", title)
                        if match:
                            address = f"{match.group(2).strip()}, {match.group(1).strip()}"
                if not address:
                    address = _parse_address_from_text(card_text)
                    # Trim greedy match — stop before "m²" or "R$" noise
                    if address:
                        address = re.split(r"\d+\s*m[²2]|R\$", address)[0].strip().rstrip(",")

                # Skip if no price (can't be a useful comp)
                if price == 0:
                    continue

                results.append(ComparableProperty(
                    address=address.strip(),
                    price=price,
                    area_m2=area,
                    price_per_m2=round(price / area, 2) if area > 0 else 0.0,
                    source="Chaves na Mão",
                    url=f"https://www.chavesnamao.com.br{href}" if href.startswith("/") else href,
                ))

                if len(results) >= MAX_COMPS_PER_SITE:
                    break
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

    Searches by street first (more precise comps), then falls back to
    neighborhood if street search yields too few results.

    Manages the browser lifecycle: launches one browser, reuses the page
    across scrapers, closes when done.
    """
    browser, page = await _launch_stealth_browser()
    try:
        all_comps: list[ComparableProperty] = []

        # Determine search location: prefer street, fallback to neighborhood
        street = _extract_street(metadata.address) if metadata.address else ""
        location = street or metadata.neighborhood
        logger.info(f"Property scraper: searching by location '{location}' (street='{street}', neighborhood='{metadata.neighborhood}')")

        scrapers = [
            ("Viva Real", scrape_vivareal),
            ("QuintoAndar", scrape_quintoandar),
            ("ZAP Imóveis", scrape_zap),
            ("Chaves na Mão", scrape_chavesnamao),
        ]

        for name, scraper in scrapers:
            if len(all_comps) >= MIN_COMPS:
                logger.info(f"Property scraper: {len(all_comps)} comps found, skipping {name}")
                break

            comps = await scraper(page, metadata, location_override=location)
            logger.info(f"Property scraper: {name} returned {len(comps)} comps (location='{location}')")
            all_comps.extend(comps)

            # Random delay between scrapers to avoid rate limits
            if len(all_comps) < MIN_COMPS:
                await asyncio.sleep(random.uniform(1.0, 3.0))

        # If street search didn't yield enough, retry with neighborhood
        if len(all_comps) < MIN_COMPS and street and metadata.neighborhood and street != metadata.neighborhood:
            logger.info(f"Property scraper: street search yielded {len(all_comps)} comps, retrying with neighborhood '{metadata.neighborhood}'")
            for name, scraper in scrapers:
                if len(all_comps) >= MIN_COMPS:
                    break
                try:
                    comps = await scraper(page, metadata, location_override=metadata.neighborhood)
                    logger.info(f"Property scraper: {name} returned {len(comps)} comps (neighborhood fallback)")
                    all_comps.extend(comps)
                    if len(all_comps) < MIN_COMPS:
                        await asyncio.sleep(random.uniform(1.0, 3.0))
                except Exception as e:
                    logger.debug(f"Property scraper: {name} neighborhood retry failed: {e}")

        return all_comps
    finally:
        await browser.close()
