"""Fast managed collection for regional market-reference workers.

Bright Data already returns rendered HTML, so the scheduled worker parses that
HTML directly instead of launching Chromium. One HTTP client is reused for the
whole batch and the independent portals are queried concurrently.
"""

from __future__ import annotations

import asyncio
import json
import re
import time

from loguru import logger
from selectolax.parser import HTMLParser, Node

from graph.state import ComparableProperty, PropertyMetadata
from tools.property_scraper import (
    BrightDataWebUnlocker,
    ComparableSourceBlockedError,
    IMOVELWEB_CARD_SELECTOR,
    MAX_COMPS_PER_SITE,
    _canonical_listing_url,
    _clean_city,
    _filter_to_subject_radius,
    _is_rental,
    _is_usable_comparable,
    _parse_address_from_text,
    _parse_area_from_text,
    _parse_beds_from_text,
    _parse_price_from_text,
    _parse_property_type,
    _slug,
    build_chavesnamao_url,
    build_imovelweb_url,
    build_quintoandar_url,
)


SOURCE_DEADLINE_SECONDS = 75.0


def _node_text(node: Node) -> str:
    return node.text(separator=" ", strip=True)


def _node_attr(node: Node, name: str) -> str:
    return node.attributes.get(name, "") or ""


def _closest_href(node: Node) -> str:
    current: Node | None = node
    while current is not None:
        if current.tag == "a":
            return _node_attr(current, "href")
        current = current.parent
    return ""


def _raise_if_challenge(html: str, source: str) -> None:
    tree = HTMLParser(html)
    title_node = tree.css_first("title")
    title = title_node.text(strip=True) if title_node else ""
    evidence = f"{title} {html}".casefold()
    markers = (
        "just a moment", "um momento", "enable javascript and cookies",
        "verifying you are human", "challenge-platform", "cf-chl-",
    )
    if any(marker in evidence for marker in markers):
        raise ComparableSourceBlockedError(
            f"{source} returned an anti-bot challenge (title={title!r})"
        )


def parse_quintoandar_html(html: str) -> list[ComparableProperty]:
    tree = HTMLParser(html)
    cards = tree.css('div[class*="FindHouseCard"][role="group"]')
    if not cards:
        _raise_if_challenge(html, "QuintoAndar")
    results = []
    for card in cards[:MAX_COMPS_PER_SITE]:
        card_text = _node_text(card)
        aria_label = _node_attr(card, "aria-label")
        if _is_rental(card_text, aria_label):
            continue
        price = _parse_price_from_text(card_text)
        area = _parse_area_from_text(aria_label) or _parse_area_from_text(card_text)
        address = ""
        if aria_label:
            clean = re.sub(r"^[^.]*\.\s*", "", aria_label)
            before_period = clean.split(".")[0].strip()
            address = _parse_address_from_text(before_period)
            if not address:
                parts = [part.strip() for part in before_period.split(",")]
                address = ", ".join(parts[:2]) if len(parts) >= 2 else (parts[0] if parts else "")
        href = _canonical_listing_url(
            "https://www.quintoandar.com.br", _closest_href(card),
        )
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
    return results


def parse_chavesnamao_html(html: str) -> list[ComparableProperty]:
    tree = HTMLParser(html)
    cards = tree.css('a[href*="/imovel/"]')
    if not cards:
        _raise_if_challenge(html, "Chaves na Mão")
    results = []
    for card in cards[:MAX_COMPS_PER_SITE * 2]:
        href = _node_attr(card, "href")
        card_text = _node_text(card)
        title = _node_attr(card, "title")
        if _is_rental(card_text, title):
            continue
        price = _parse_price_from_text(card_text)
        area = _parse_area_from_text(card_text)
        if area == 0:
            area_match = re.search(r"(\d+)m2", href, re.IGNORECASE)
            if area_match:
                area = float(area_match.group(1))
        address = ""
        if title:
            address = _parse_address_from_text(title)
            if not address:
                match = re.search(r"em\s+([^,]+),\s*([^,]+)", title)
                if match:
                    address = f"{match.group(2).strip()}, {match.group(1).strip()}"
        if not address:
            address = _parse_address_from_text(card_text)
            if address:
                address = re.split(r"\d+\s*m[²2]|R\$", address)[0].strip().rstrip(",")
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
    return results


def parse_imovelweb_html(
    html: str,
    metadata: PropertyMetadata,
) -> list[ComparableProperty]:
    tree = HTMLParser(html)
    cards = tree.css(IMOVELWEB_CARD_SELECTOR)
    if not cards:
        cards = tree.css(
            'div.postingCard, div[class*="PostingCard"], div[class*="posting-card"]'
        )
    if not cards:
        _raise_if_challenge(html, "ImovelWeb")
    expected_city = _slug(_clean_city(metadata.city))
    results = []
    for card in cards[:MAX_COMPS_PER_SITE * 2]:
        text = _node_text(card)
        if _is_rental(text) or (expected_city and expected_city not in _slug(text)):
            continue
        href = _node_attr(card, "data-to-posting")
        if not href:
            link = card.css_first('a[href*="/propriedades/"], a[href*="imovel"]')
            href = _node_attr(link, "href") if link else ""
        href = _canonical_listing_url("https://www.imovelweb.com.br", href)
        if not href or href in (
            "/", "https://www.imovelweb.com.br", "https://www.imovelweb.com.br/",
        ):
            continue
        price = _parse_price_from_text(text)
        area = _parse_area_from_text(text)
        if price <= 0 or area <= 0:
            continue
        address_node = card.css_first(
            '[data-qa="POSTING_CARD_LOCATION"], [class*="location"], [class*="Location"]'
        )
        address = _node_text(address_node) if address_node else _parse_address_from_text(text)
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
    return results


async def scrape_quintoandar(
    unlocker: BrightDataWebUnlocker,
    metadata: PropertyMetadata,
    location_override: str = "",
) -> list[ComparableProperty]:
    url = build_quintoandar_url(metadata, location_override=location_override)
    html = await unlocker.fetch_html("QuintoAndar", url)
    return parse_quintoandar_html(html)


async def scrape_chavesnamao(
    unlocker: BrightDataWebUnlocker,
    metadata: PropertyMetadata,
    location_override: str = "",
) -> list[ComparableProperty]:
    url = build_chavesnamao_url(metadata, location_override=location_override)
    html = await unlocker.fetch_html("Chaves na Mão", url)
    return parse_chavesnamao_html(html)


async def scrape_imovelweb(
    unlocker: BrightDataWebUnlocker,
    metadata: PropertyMetadata,
    location_override: str = "",
) -> list[ComparableProperty]:
    url = build_imovelweb_url(metadata, location_override=location_override)
    if not url:
        return []
    html = await unlocker.fetch_html("ImovelWeb", url)
    return parse_imovelweb_html(html, metadata)


class MarketReferenceCollector:
    """Reusable, bounded collector with per-source metrics and deadlines."""

    def __init__(
        self,
        unlocker: BrightDataWebUnlocker | None = None,
        *,
        source_deadline_seconds: float = SOURCE_DEADLINE_SECONDS,
    ) -> None:
        self.unlocker = unlocker or BrightDataWebUnlocker.from_env()
        self._owns_unlocker = unlocker is None
        self.source_deadline_seconds = source_deadline_seconds
        self.metrics: list[dict[str, object]] = []

    async def __aenter__(self) -> MarketReferenceCollector:
        if self._owns_unlocker:
            await self.unlocker.__aenter__()
        return self

    async def __aexit__(self, exc_type, exc, traceback) -> None:
        await self.aclose(exc_type, exc, traceback)

    async def aclose(self, exc_type=None, exc=None, traceback=None) -> None:
        if self._owns_unlocker:
            await self.unlocker.__aexit__(exc_type, exc, traceback)

    async def collect(
        self,
        metadata: PropertyMetadata,
        geocoder=None,
    ) -> list[ComparableProperty]:
        location = metadata.neighborhood
        scrapers = (
            ("QuintoAndar", scrape_quintoandar),
            ("Chaves na Mão", scrape_chavesnamao),
            ("ImovelWeb", scrape_imovelweb),
        )

        async def run_source(name, scraper):
            started = time.monotonic()
            status = "successful"
            error = ""
            comps: list[ComparableProperty] = []
            try:
                async with asyncio.timeout(self.source_deadline_seconds):
                    comps = await scraper(
                        self.unlocker, metadata, location_override=location,
                    )
                if not comps:
                    status = "empty"
            except TimeoutError:
                status = "failed"
                error = f"deadline exceeded ({self.source_deadline_seconds:.0f}s)"
            except ComparableSourceBlockedError as exc:
                status = "blocked"
                error = str(exc)
            except Exception as exc:  # one portal must not sink the other two
                status = "failed"
                error = f"{type(exc).__name__}: {exc}"
            metric = {
                "source": name,
                "status": status,
                "duration_seconds": round(time.monotonic() - started, 3),
                "comparables": len(comps),
            }
            if error:
                metric["error"] = error[:500]
            self.metrics.append(metric)
            logger.info("Market source metric: {}", json.dumps(metric, ensure_ascii=False))
            return comps, status

        source_results = await asyncio.gather(*(
            run_source(name, scraper) for name, scraper in scrapers
        ))
        all_comps = [comp for comps, _ in source_results for comp in comps]
        unavailable = [
            scrapers[index][0]
            for index, (_, status) in enumerate(source_results)
            if status in {"blocked", "failed"}
        ]
        valid = [comp for comp in all_comps if _is_usable_comparable(comp)]
        deduplicated: list[ComparableProperty] = []
        seen_urls: set[str] = set()
        seen_fingerprints: set[tuple[str, int, int]] = set()
        for comp in valid:
            fingerprint = (_slug(comp.address), round(comp.price), round(comp.area_m2))
            if comp.url in seen_urls or fingerprint in seen_fingerprints:
                continue
            seen_urls.add(comp.url)
            seen_fingerprints.add(fingerprint)
            deduplicated.append(comp)
        if not deduplicated and unavailable:
            raise ComparableSourceBlockedError(
                "No usable comparables returned while sources were unavailable: "
                + ", ".join(unavailable)
            )
        return await _filter_to_subject_radius(metadata, deduplicated, geocoder)

    def metrics_summary(self) -> dict[str, dict[str, float | int]]:
        summary: dict[str, dict[str, float | int]] = {}
        for metric in self.metrics:
            source = str(metric["source"])
            current = summary.setdefault(source, {
                "requests": 0,
                "successful": 0,
                "empty": 0,
                "failed": 0,
                "comparables": 0,
                "duration_seconds": 0.0,
                "max_duration_seconds": 0.0,
            })
            current["requests"] += 1
            status = str(metric["status"])
            bucket = status if status in {"successful", "empty"} else "failed"
            current[bucket] += 1
            current["comparables"] += int(metric["comparables"])
            duration = float(metric["duration_seconds"])
            current["duration_seconds"] = round(
                float(current["duration_seconds"]) + duration, 3,
            )
            current["max_duration_seconds"] = max(
                float(current["max_duration_seconds"]), duration,
            )
        return summary


async def scrape_comparables(
    metadata: PropertyMetadata,
    geocoder=None,
    collector: MarketReferenceCollector | None = None,
) -> list[ComparableProperty]:
    """Compatibility entry point; batch workers pass a reusable collector."""
    if collector is not None:
        return await collector.collect(metadata, geocoder)
    async with MarketReferenceCollector() as owned_collector:
        return await owned_collector.collect(metadata, geocoder)
