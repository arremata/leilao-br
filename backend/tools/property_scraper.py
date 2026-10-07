from __future__ import annotations

import asyncio
import os
import random
import re
from typing import Any
from urllib.parse import urljoin, urlparse, urlsplit, urlunsplit

import httpx
from loguru import logger
try:
    from playwright.async_api import (
        async_playwright,
        Browser,
        Page,
        Playwright,
        TimeoutError as PlaywrightTimeoutError,
    )
except ModuleNotFoundError:  # scheduled market worker parses Bright HTML directly
    async_playwright = None
    Browser = Page = Playwright = Any
    PlaywrightTimeoutError = TimeoutError
from graph.market_confidence import (
    MAX_COMPARABLES,
    MAX_RADIUS_KM,
    canonical_property_type,
    haversine_km,
)
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


def _clean_city(city: str) -> str:
    """Strip state/region suffixes from a city string.

    Discovery metadata often stores city as "Campo Largo, PR" or "Campo Largo - PR".
    Listing URL builders expect just the city name ("Campo Largo"), with state
    in a separate field. Without this, the slug becomes "campo-largo-pr" and
    searches the wrong location.
    """
    if not city:
        return ""
    # Drop anything after a comma or hyphen followed by a 2-letter state suffix
    cleaned = re.split(r"\s*[,]\s*[A-Z]{2}\s*$", city.strip())[0]
    cleaned = re.split(r"\s*[-]\s*[A-Z]{2}\s*$", cleaned)[0]
    return cleaned.strip()


def _extract_state_from_city_field(city: str, fallback_state: str = "") -> str:
    """Recover state abbreviation from a city string like 'Campo Largo, PR'.

    Discovery often merges city+state into a single field. Use this to
    recover the state when PropertyMetadata.state is empty.
    """
    if not city:
        return fallback_state
    m = re.search(r"[,\-]\s*([A-Z]{2})\s*$", city.strip())
    return m.group(1) if m else fallback_state


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


def build_quintoandar_url(metadata: PropertyMetadata, location_override: str = "") -> str:
    city_clean = _clean_city(metadata.city)
    state_abbr = metadata.state.upper() or _extract_state_from_city_field(metadata.city)
    state_slug = _slug(state_abbr) if state_abbr else ""
    city_slug = _slug(city_clean)
    loc = location_override or metadata.neighborhood
    loc_slug = _neighborhood_slug_clean(loc) if loc else ""

    if loc_slug and city_slug and state_slug:
        return f"https://www.quintoandar.com.br/comprar/imovel/{loc_slug}-{city_slug}-{state_slug}-brasil/"
    if city_slug and state_slug:
        return f"https://www.quintoandar.com.br/comprar/imovel/{city_slug}-{state_slug}-brasil/"
    return ""


def build_chavesnamao_url(metadata: PropertyMetadata, location_override: str = "") -> str:
    city_clean = _clean_city(metadata.city)
    state_abbr = metadata.state.upper() or _extract_state_from_city_field(metadata.city)
    state_slug = _slug(state_abbr) if state_abbr else ""
    city_slug = _slug(city_clean)
    loc = location_override or metadata.neighborhood
    loc_slug = _neighborhood_slug_clean(loc) if loc else ""

    if state_slug and city_slug and loc_slug:
        return f"https://www.chavesnamao.com.br/imoveis-a-venda/{state_slug}-{city_slug}/{loc_slug}/"
    if state_slug and city_slug:
        return f"https://www.chavesnamao.com.br/imoveis-a-venda/{state_slug}-{city_slug}/"
    return ""


def build_imovelweb_url(metadata: PropertyMetadata, location_override: str = "") -> str:
    city = _slug(_clean_city(metadata.city))
    state = _slug(metadata.state or _extract_state_from_city_field(metadata.city))
    location = _neighborhood_slug_clean(location_override or metadata.neighborhood)
    parts = [part for part in (location, city, state) if part]
    return f"https://www.imovelweb.com.br/imoveis-venda-{'-'.join(parts)}.html" if parts else ""


# ---------------------------------------------------------------------------
# Local browser parser setup
# ---------------------------------------------------------------------------

IMOVELWEB_CARD_SELECTOR = '[data-qa="posting PROPERTY"]'
IMOVELWEB_CARD_WAIT_MS = 12_000
BRIGHT_DATA_API_URL = "https://api.brightdata.com/request"
BRIGHT_DATA_SOURCE_NAMES = frozenset({
    "QuintoAndar",
    "Chaves na Mão",
    "ImovelWeb",
})


class ComparableSourceBlockedError(RuntimeError):
    """A required listing source returned an anti-bot page, not search results."""


class BrightDataWebUnlocker:
    """Fetch rendered listing HTML through the managed Web Unlocker API."""

    def __init__(
        self,
        api_key: str,
        zone: str,
        *,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._api_key = api_key
        self._zone = zone
        self._client = client or httpx.AsyncClient(
            timeout=httpx.Timeout(120.0, connect=20.0),
            follow_redirects=True,
        )
        self._owns_client = client is None

    @classmethod
    def from_env(cls) -> BrightDataWebUnlocker:
        api_key = os.getenv("BRIGHT_DATA_API_KEY", "").strip()
        zone = os.getenv("BRIGHT_DATA_WEB_UNLOCKER_ZONE", "").strip()
        missing = [
            name for name, value in (
                ("BRIGHT_DATA_API_KEY", api_key),
                ("BRIGHT_DATA_WEB_UNLOCKER_ZONE", zone),
            ) if not value
        ]
        if missing:
            raise RuntimeError(
                "Missing Bright Data configuration: " + ", ".join(missing)
            )
        if not re.fullmatch(r"[A-Za-z0-9_-]+", zone):
            raise RuntimeError("Invalid Bright Data Web Unlocker zone name")
        return cls(api_key, zone)

    async def __aenter__(self) -> BrightDataWebUnlocker:
        return self

    async def __aexit__(self, exc_type, exc, traceback) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def fetch_html(self, source: str, url: str) -> str:
        if source not in BRIGHT_DATA_SOURCE_NAMES:
            raise ValueError(f"Bright Data source is not allowed: {source}")
        expected_domain = _SOURCE_DOMAINS[source]
        parsed = urlparse(url)
        hostname = (parsed.hostname or "").lower()
        if (
            parsed.scheme != "https"
            or not hostname
            or not (hostname == expected_domain or hostname.endswith(f".{expected_domain}"))
        ):
            raise ValueError(f"Unexpected {source} target domain")

        try:
            response = await self._client.post(
                BRIGHT_DATA_API_URL,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "zone": self._zone,
                    "url": url,
                    "format": "raw",
                    "country": "br",
                    "render": True,
                },
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ComparableSourceBlockedError(
                f"{source} could not be loaded through Bright Data ({type(exc).__name__})"
            ) from exc
        html = response.text
        if not html.strip():
            raise ComparableSourceBlockedError(
                f"{source} returned an empty Bright Data response"
            )
        return html


async def _navigate_listing_source(
    page: Page,
    source: str,
    url: str,
    unlocker: BrightDataWebUnlocker | None,
) -> None:
    """Load unlocked HTML into local Playwright, which is used only as a parser."""
    if unlocker is None:
        await page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
        return
    html = await unlocker.fetch_html(source, url)
    await page.set_content(
        html,
        wait_until="domcontentloaded",
        timeout=PAGE_TIMEOUT_MS,
    )


async def _raise_if_challenge(page: Page, source: str) -> None:
    """Distinguish an anti-bot shell from a legitimate empty result page."""
    title = (await page.title()).strip()
    content = (await page.content()).casefold()
    final_url = page.url.casefold()
    challenge_markers = (
        "just a moment", "um momento", "enable javascript and cookies",
        "verifying you are human", "challenge-platform", "cf-chl-",
    )
    challenge_evidence = " ".join((title.casefold(), final_url, content))
    if any(marker in challenge_evidence for marker in challenge_markers):
        raise ComparableSourceBlockedError(
            f"{source} returned an anti-bot challenge (title={title!r})"
        )


async def _launch_parser_browser() -> tuple[Playwright, Browser, Page]:
    """Launch the local HTML parser and retain its owner for clean shutdown."""
    pw = await async_playwright().start()
    browser = None
    try:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
        )
        page = await context.new_page()
        return pw, browser, page
    except BaseException:
        try:
            if browser is not None:
                await browser.close()
        finally:
            await pw.stop()
        raise


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

MAX_COMPS_PER_SITE = 5
MAX_GEOCODE_CANDIDATES = 15
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
    match = re.search(
        r"R\$\s*(?:\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+(?:,\d{2})?)",
        text,
    )
    if match:
        return _parse_brl(match.group(0))
    return 0.0


def _parse_area_from_text(text: str) -> float:
    """Extract area in m² from free-form text like '40 m²' or '296 m²'."""
    match = re.search(r"(\d+)\s*m[²2]", text)
    if match:
        return float(match.group(1))
    return 0.0


def _parse_beds_from_text(text: str) -> int | None:
    """Extract bedrooms/dormitories from a listing card or URL slug."""
    normalized = _slug(text).replace("-", " ")
    match = re.search(r"\b(\d+)\s*(?:quartos?|dormitorios?|dorms?|qtos?)\b", normalized)
    return int(match.group(1)) if match else None


def _parse_property_type(text: str) -> str:
    """Return a canonical property type only when the listing states one."""
    parsed = canonical_property_type(text)
    return parsed if parsed in {
        "Apartamento", "Casa", "Comercial", "Industrial", "Rural", "Terreno",
    } else ""


def _parse_address_from_text(text: str) -> str:
    """Extract address from card text like 'Rua Walace Landal, Santa Cândida · Curitiba'."""
    # Try to find "Rua/Av/Avenida/Alameda ..." stopping at:
    # - · (bullet), newline (hard boundaries)
    # - "m²"/"m2", "R$", "Condomínio" (noise boundaries)
    match = re.search(
        r"(Rua|R\.|Av\.|Avenida|Alameda|Travessa|Rod\.|Rodovia|Estrada)[^·\n]+?(?=\s*\d+\s*m[²2]|\s*R\$|\s*Condomínio)",
        text, re.IGNORECASE,
    )
    if match:
        addr = match.group(0).strip().rstrip(",")
        return addr
    # Fallback: match up to · or newline (simple, covers most cases)
    match = re.search(
        r"(Rua|R\.|Av\.|Avenida|Alameda|Travessa|Rod\.|Rodovia|Estrada)[^·\n]+",
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


def _canonical_listing_url(base_url: str, href: str) -> str:
    """Return a stable listing URL without per-search tracking parameters."""
    if not href.strip():
        return ""
    parsed = urlsplit(urljoin(base_url, href.strip()))
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))


_SOURCE_DOMAINS = {
    "QuintoAndar": "quintoandar.com.br",
    "Chaves na Mão": "chavesnamao.com.br",
    "ImovelWeb": "imovelweb.com.br",
}


def _is_usable_comparable(comp: ComparableProperty) -> bool:
    """Reject incomplete cards and generic portal links before persistence."""
    expected_domain = _SOURCE_DOMAINS.get(comp.source)
    parsed = urlparse(comp.url)
    if not expected_domain or expected_domain not in parsed.netloc.lower():
        return False
    if parsed.path in ("", "/"):
        return False
    if not comp.address.strip() or comp.price <= 0 or comp.area_m2 <= 0:
        return False
    price_m2 = comp.price / comp.area_m2
    return 500 <= price_m2 <= 100_000


def _physical_similarity_key(metadata: PropertyMetadata, comp: ComparableProperty):
    area = float(metadata.area_m2 or 0)
    area_difference = abs(comp.area_m2 - area) / area if area > 0 else 1.0
    bed_difference = (
        abs(comp.beds - metadata.beds)
        if comp.beds is not None and metadata.beds is not None else 99
    )
    expected_type = canonical_property_type(metadata.property_type)
    candidate_type = canonical_property_type(comp.property_type)
    return (candidate_type != expected_type, area_difference, bed_difference, comp.url)


def _geocode_query(address: str, metadata: PropertyMetadata) -> str:
    city = _clean_city(metadata.city)
    parts = [address.strip(), city, metadata.state.strip(), "Brasil"]
    return ", ".join(part for part in parts if part)


def _has_street_reference(address: str) -> bool:
    normalized = _slug(address).replace("-", " ")
    return bool(re.search(
        r"\b(?:rua|r|av|avenida|alameda|travessa|rod|rodovia|estrada)\b",
        normalized,
    ))


async def _filter_to_subject_radius(
    metadata: PropertyMetadata,
    comparables: list[ComparableProperty],
    geocoder,
) -> list[ComparableProperty]:
    """Geocode candidates and retain the five closest within two kilometres."""
    if geocoder is None:
        return comparables

    if (metadata.lat is None or metadata.lng is None) and metadata.address.strip():
        try:
            subject_coordinates = await asyncio.to_thread(
                geocoder.geocode, _geocode_query(metadata.address, metadata),
            )
        except Exception as exc:
            logger.warning("Property scraper: subject geocoding failed: {}", exc)
            subject_coordinates = None
        if subject_coordinates:
            metadata.lat, metadata.lng = subject_coordinates

    if metadata.lat is None or metadata.lng is None:
        logger.warning(
            "Property scraper: no subject coordinates; retaining candidates "
            "without a radius guarantee"
        )
        return comparables

    candidates = sorted(
        comparables, key=lambda item: _physical_similarity_key(metadata, item),
    )[:MAX_GEOCODE_CANDIDATES]
    coordinates_by_address: dict[str, tuple[float, float] | None] = {}
    located: list[ComparableProperty] = []
    for comp in candidates:
        # Neighborhood centroids are not precise enough to prove a 2 km radius.
        if not _has_street_reference(comp.address):
            continue
        query = _geocode_query(comp.address, metadata)
        cache_key = _slug(query)
        coordinates = coordinates_by_address.get(cache_key)
        if cache_key not in coordinates_by_address:
            try:
                coordinates = await asyncio.to_thread(geocoder.geocode, query)
            except Exception as exc:
                logger.debug("Property scraper: comparable geocoding failed: {}", exc)
                coordinates = None
            coordinates_by_address[cache_key] = coordinates
        if not coordinates:
            continue
        comp.lat, comp.lng = coordinates
        comp.distance_km = haversine_km(
            metadata.lat, metadata.lng, comp.lat, comp.lng,
        )
        if comp.distance_km <= MAX_RADIUS_KM:
            located.append(comp)

    located.sort(key=lambda item: (
        item.distance_km if item.distance_km is not None else float("inf"),
        *_physical_similarity_key(metadata, item),
    ))
    logger.info(
        "Property scraper: {} candidates geocoded within {:.1f} km",
        len(located), MAX_RADIUS_KM,
    )
    return located[:MAX_COMPARABLES]


# ---------------------------------------------------------------------------
# Per-site scrapers
# ---------------------------------------------------------------------------


async def scrape_quintoandar(
    page: Page,
    metadata: PropertyMetadata,
    location_override: str = "",
    *,
    unlocker: BrightDataWebUnlocker | None = None,
) -> list[ComparableProperty]:
    """Scrape comparable properties from QuintoAndar.

    Cards use FindHouseCard wrapper divs with Cozy__ prefixed classes.
    Key data is in the aria-label and text content.
    """
    url = build_quintoandar_url(metadata, location_override=location_override)
    logger.info(f"QuintoAndar scraper: navigating to {url}")
    try:
        await _navigate_listing_source(page, "QuintoAndar", url, unlocker)
        if unlocker is None:
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
        if count == 0:
            await _raise_if_challenge(page, "QuintoAndar")
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

                # The clickable link wraps the card; it is not inside it.
                href = await card.evaluate(
                    "el => el.closest('a') ? el.closest('a').getAttribute('href') : ''"
                ) or ""
                href = _canonical_listing_url("https://www.quintoandar.com.br", href)
                details = f"{aria_label} {card_text} {href}"

                results.append(ComparableProperty(
                    address=address.strip(),
                    property_type=_parse_property_type(details),
                    price=price,
                    area_m2=area,
                    beds=_parse_beds_from_text(details),
                    price_per_m2=round(price / area, 2) if area > 0 else 0.0,
                    source="QuintoAndar",
                    url=href,
                ))
            except Exception as e:
                logger.debug(f"QuintoAndar scraper: error parsing card {i}: {e}")
                continue

        return results
    except ComparableSourceBlockedError:
        raise
    except Exception as e:
        logger.warning(f"QuintoAndar scraper: failed for {url}: {e}")
        return []


async def scrape_chavesnamao(
    page: Page,
    metadata: PropertyMetadata,
    location_override: str = "",
    *,
    unlocker: BrightDataWebUnlocker | None = None,
) -> list[ComparableProperty]:
    """Scrape comparable properties from Chaves na Mão.

    URL format: /imoveis/{city}-{state}/ (e.g. /imoveis/curitiba-pr/)
    No sub-paths for neighborhood or property type — city-level only.
    Cards are <a> links with href containing '/imovel/' and class 'link_rawLink'.
    """
    url = build_chavesnamao_url(metadata, location_override=location_override)
    logger.info(f"Chaves na Mão scraper: navigating to {url}")
    try:
        # Advertising pages keep analytics/ad requests open indefinitely, so
        # networkidle is flaky even after all listing cards are rendered.
        await _navigate_listing_source(page, "Chaves na Mão", url, unlocker)
        if unlocker is None:
            await asyncio.sleep(4)

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
        if count == 0:
            await _raise_if_challenge(page, "Chaves na Mão")
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
                href = _canonical_listing_url("https://www.chavesnamao.com.br", href)
                details = f"{title} {card_text} {href}"

                results.append(ComparableProperty(
                    address=address.strip(),
                    property_type=_parse_property_type(details),
                    price=price,
                    area_m2=area,
                    beds=_parse_beds_from_text(details),
                    price_per_m2=round(price / area, 2) if area > 0 else 0.0,
                    source="Chaves na Mão",
                    url=href,
                ))

                if len(results) >= MAX_COMPS_PER_SITE:
                    break
            except Exception as e:
                logger.debug(f"Chaves na Mão scraper: error parsing card {i}: {e}")
                continue

        return results
    except ComparableSourceBlockedError:
        raise
    except Exception as e:
        logger.warning(f"Chaves na Mão scraper: failed for {url}: {e}")
        return []


async def scrape_imovelweb(
    page: Page,
    metadata: PropertyMetadata,
    location_override: str = "",
    *,
    unlocker: BrightDataWebUnlocker | None = None,
) -> list[ComparableProperty]:
    """Scrape sale cards from ImovelWeb's regional result page."""
    url = build_imovelweb_url(metadata, location_override=location_override)
    logger.info(f"ImovelWeb scraper: navigating to {url}")
    if not url:
        return []
    try:
        await _navigate_listing_source(page, "ImovelWeb", url, unlocker)
        if unlocker is None:
            try:
                await page.wait_for_selector(
                    IMOVELWEB_CARD_SELECTOR,
                    state="attached",
                    timeout=IMOVELWEB_CARD_WAIT_MS,
                )
            except PlaywrightTimeoutError:
                # A legitimate empty result and a challenge shell both have no
                # cards. Inspect the loaded document below before deciding which
                # state this is.
                pass
        try:
            cookie_btn = page.locator('button:has-text("Aceitar"), button:has-text("Entendi")')
            if await cookie_btn.count() > 0:
                await cookie_btn.first.click(timeout=2000)
        except Exception:
            pass

        # The class-based fallbacks also match nested sub-divs of a card, so a
        # page of 30 listings reported 150 "cards", most of them fragments
        # carrying only a price. Prefer the semantic attribute and fall back
        # only when the markup does not expose it at all.
        cards = page.locator(IMOVELWEB_CARD_SELECTOR)
        count = await cards.count()
        if count == 0:
            cards = page.locator(
                'div.postingCard, div[class*="PostingCard"], div[class*="posting-card"]'
            )
            count = await cards.count()
        if count == 0:
            await _raise_if_challenge(page, "ImovelWeb")
        logger.info(f"ImovelWeb scraper: found {count} cards")
        results = []
        for i in range(min(count, MAX_COMPS_PER_SITE * 2)):
            card = cards.nth(i)
            try:
                text = await card.text_content() or ""
                if _is_rental(text):
                    continue
                # ImovelWeb sometimes ignores an unsupported regional slug and
                # returns a generic national feed. Unlike the other platforms,
                # require the requested city in the card before trusting it.
                expected_city = _slug(_clean_city(metadata.city))
                if expected_city and expected_city not in _slug(text):
                    continue
                # ImovelWeb moved listing URLs from /imovel... to /propriedades/...,
                # so the old href filter matched nothing and every card was
                # dropped as untraceable. The card also carries the canonical
                # path in data-to-posting, which survives markup churn better
                # than any anchor selector.
                href = await card.get_attribute("data-to-posting") or ""
                if not href:
                    link = card.locator('a[href*="/propriedades/"], a[href*="imovel"]')
                    href = (await link.first.get_attribute("href") if await link.count() else "") or ""
                # Tracking parameters make identical listings look distinct and
                # leak our search id into the stored comparable URL.
                href = _canonical_listing_url("https://www.imovelweb.com.br", href)
                # A challenge shell or malformed card can expose only the portal
                # homepage. It is not a traceable comparable listing.
                if not href or href in (
                    "/", "https://www.imovelweb.com.br", "https://www.imovelweb.com.br/",
                ):
                    continue
                price = _parse_price_from_text(text)
                area = _parse_area_from_text(text)
                if price <= 0 or area <= 0:
                    continue
                address_locator = card.locator(
                    '[data-qa="POSTING_CARD_LOCATION"], '
                    '[class*="location"], [class*="Location"]'
                )
                address = ""
                if await address_locator.count():
                    address = (await address_locator.first.text_content() or "").strip()
                if not address:
                    address = _parse_address_from_text(text)
                details = f"{text} {href}"
                results.append(ComparableProperty(
                    address=address,
                    property_type=_parse_property_type(details),
                    price=price,
                    area_m2=area,
                    beds=_parse_beds_from_text(details),
                    price_per_m2=round(price / area, 2),
                    source="ImovelWeb",
                    url=href,
                ))
                if len(results) >= MAX_COMPS_PER_SITE:
                    break
            except Exception as exc:
                logger.debug(f"ImovelWeb scraper: error parsing card {i}: {exc}")
        return results
    except ComparableSourceBlockedError:
        raise
    except Exception as exc:
        logger.warning(f"ImovelWeb scraper: failed for {url}: {exc}")
        return []


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

async def scrape_comparables(
    metadata: PropertyMetadata,
    geocoder=None,
) -> list[ComparableProperty]:
    """Collect from the three managed listing sources and deduplicate the snapshot.

    Searches by neighborhood when available and otherwise by city. The three
    managed portals model their location paths at those levels; passing a
    street as if it were a neighborhood can return an anti-bot/error shell.

    Manages the complete Playwright lifecycle: launches one browser, reuses
    the page across scrapers, and stops the driver after closing the browser.
    """
    async with BrightDataWebUnlocker.from_env() as unlocker:
        playwright, browser, page = await _launch_parser_browser()
        try:
            all_comps: list[ComparableProperty] = []
            blocked_sources: list[str] = []

            location = metadata.neighborhood
            logger.info(
                "Property scraper: searching by {} '{}'",
                "neighborhood" if location else "city",
                location or metadata.city,
            )

            scrapers = [
                ("QuintoAndar", scrape_quintoandar),
                ("Chaves na Mão", scrape_chavesnamao),
                ("ImovelWeb", scrape_imovelweb),
            ]

            async def _run_scraper(name, scraper, loc) -> list[ComparableProperty]:
                try:
                    comps = await scraper(
                        page,
                        metadata,
                        location_override=loc,
                        unlocker=unlocker,
                    )
                except ComparableSourceBlockedError as exc:
                    blocked_sources.append(name)
                    logger.warning(
                        "Property scraper: {} is unavailable; continuing with the other sources: {}",
                        name, exc,
                    )
                    return []
                except Exception as e:
                    logger.debug(f"Property scraper: {name} failed: {e}")
                    return []
                # Search URLs are already scoped by UF/city/location. Card address
                # text is often only a street or neighborhood, so filtering again
                # by the city name creates false negatives.
                valid = [comp for comp in comps if _is_usable_comparable(comp)]
                if len(valid) != len(comps):
                    logger.warning(
                        "Property scraper: {} rejected {} incomplete/invalid cards",
                        name, len(comps) - len(valid),
                    )
                logger.info(f"Property scraper: {name} returned {len(valid)} valid comps (location='{loc}')")
                return valid

            for name, scraper in scrapers:
                all_comps.extend(await _run_scraper(name, scraper, location))
                await asyncio.sleep(random.uniform(1.0, 3.0))

            deduplicated: list[ComparableProperty] = []
            seen_urls: set[str] = set()
            seen_fingerprints: set[tuple[str, int, int]] = set()
            for comp in all_comps:
                url_key = comp.url.strip()
                fingerprint = (
                    _slug(comp.address), round(comp.price), round(comp.area_m2),
                )
                if url_key in seen_urls or fingerprint in seen_fingerprints:
                    continue
                seen_urls.add(url_key)
                seen_fingerprints.add(fingerprint)
                deduplicated.append(comp)
            if not deduplicated and blocked_sources:
                raise ComparableSourceBlockedError(
                    "No usable comparables returned while sources were unavailable: "
                    + ", ".join(blocked_sources)
                )
            return await _filter_to_subject_radius(metadata, deduplicated, geocoder)
        finally:
            try:
                await browser.close()
            finally:
                # browser.close() does not stop the Playwright transport. Leaving
                # it alive until asyncio.run() exits produces misleading
                # "Event loop is closed" errors in otherwise-green Actions runs.
                await playwright.stop()
