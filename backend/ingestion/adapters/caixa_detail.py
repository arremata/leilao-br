"""Lazy scraping of a single Caixa property detail page (photo, full text,
edital/matrícula PDF links). Parsing is pure and unit-tested; fetch_detail
reuses the existing Playwright scraper."""

from __future__ import annotations

import re
from urllib.parse import urljoin

_PHOTO_RE = re.compile(r'<img[^>]+src="([^"]*/fotos/[^"]+)"', re.IGNORECASE)
_PDF_RE = re.compile(r'href="([^"]+\.pdf)"', re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def parse_detail_html(html: str, base_url: str) -> dict:
    if not html:
        return {"photo_url": None, "full_description": "", "document_urls": []}

    photo_match = _PHOTO_RE.search(html)
    photo_url = urljoin(base_url, photo_match.group(1)) if photo_match else None

    document_urls = [urljoin(base_url, m) for m in _PDF_RE.findall(html)]

    text = _TAG_RE.sub(" ", html)
    text = _WS_RE.sub(" ", text).strip()

    return {
        "photo_url": photo_url,
        "full_description": text,
        "document_urls": document_urls,
    }


async def fetch_detail(detail_url: str, base_url: str = "https://venda-imoveis.caixa.gov.br") -> dict:
    """Scrape a detail page via the existing stealth Playwright scraper."""
    from tools.web_scraper import scrape_page

    scraped = await scrape_page(detail_url)
    return parse_detail_html(scraped.get("html", ""), base_url=base_url)
