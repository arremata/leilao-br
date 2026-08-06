"""Lazy scraping of a single Caixa property detail page (photo, full text,
edital/matrícula PDF links). Parsing is pure and unit-tested; fetch_detail
reuses the existing Playwright scraper."""

from __future__ import annotations

import asyncio
import re
from datetime import datetime
from urllib.parse import urljoin
from zoneinfo import ZoneInfo

from curl_cffi.requests import AsyncSession
from curl_cffi.requests.errors import RequestsError
from loguru import logger

_PHOTO_RE = re.compile(r'<img[^>]+src="([^"]*/fotos/[^"]+)"', re.IGNORECASE)
_PDF_RE = re.compile(r'href="([^"]+\.pdf)"', re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_AUCTION_DATE_RE = re.compile(
    r"Data\s+do\s+([12])\s*[º°oªa]?\s*Leil[aã]o\s*[-–—:]?\s*"
    r"(\d{2}/\d{2}/\d{4})"
    r"(?:\s*[-–—]\s*(\d{1,2})\s*h\s*(\d{2})?)?",
    re.IGNORECASE,
)
_OPEN_BID_DATE_RE = re.compile(
    r"Data\s+da\s+Licita[cç][aã]o\s+Aberta\s*[-–—:]?\s*"
    r"(\d{2}/\d{2}/\d{4})"
    r"(?:\s*[-–—]\s*(\d{1,2})\s*h\s*(\d{2})?)?",
    re.IGNORECASE,
)
_AUCTION_PRICE_RE = re.compile(
    r"Valor\s+m[ií]nimo\s+de\s+venda\s+([12])\s*[º°oªa]?\s*Leil[aã]o"
    r"\s*:\s*R\$\s*([\d.]+,\d{2})",
    re.IGNORECASE,
)
_SAO_PAULO = ZoneInfo("America/Sao_Paulo")
_DETAIL_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def _parse_auction_dates(text: str) -> tuple[datetime | None, datetime | None]:
    dates: dict[str, datetime] = {}
    for number, date_text, hour, minute in _AUCTION_DATE_RE.findall(text):
        parsed = datetime.strptime(date_text, "%d/%m/%Y")
        parsed = parsed.replace(
            hour=int(hour or 0), minute=int(minute or 0), tzinfo=_SAO_PAULO
        )
        dates[number] = parsed
    first = dates.get("1")
    if first is None:
        open_bid = _OPEN_BID_DATE_RE.search(text)
        if open_bid:
            date_text, hour, minute = open_bid.groups()
            first = datetime.strptime(date_text, "%d/%m/%Y").replace(
                hour=int(hour or 0), minute=int(minute or 0), tzinfo=_SAO_PAULO
            )
    return first, dates.get("2")


def _parse_brl(value: str) -> float:
    return float(value.replace(".", "").replace(",", "."))


def _parse_auction_prices(text: str) -> tuple[float | None, float | None]:
    prices = {
        number: _parse_brl(value)
        for number, value in _AUCTION_PRICE_RE.findall(text)
    }
    return prices.get("1"), prices.get("2")


def parse_detail_html(html: str, base_url: str) -> dict:
    if not html:
        return {
            "photo_url": None, "full_description": "", "document_urls": [],
            "first_auction_at": None, "second_auction_at": None,
            "first_auction_price": None, "second_auction_price": None,
        }

    photo_match = _PHOTO_RE.search(html)
    photo_url = urljoin(base_url, photo_match.group(1)) if photo_match else None

    document_urls = [urljoin(base_url, m) for m in _PDF_RE.findall(html)]

    text = _TAG_RE.sub(" ", html)
    text = _WS_RE.sub(" ", text).strip()
    first_auction_at, second_auction_at = _parse_auction_dates(text)
    first_auction_price, second_auction_price = _parse_auction_prices(text)

    return {
        "photo_url": photo_url,
        "full_description": text,
        "document_urls": document_urls,
        "first_auction_at": first_auction_at,
        "second_auction_at": second_auction_at,
        "first_auction_price": first_auction_price,
        "second_auction_price": second_auction_price,
    }


async def fetch_auction_dates_batch(
    urls: list[str], concurrency: int = 2, retries: int = 1,
    request_interval: float = 1.0, max_consecutive_429: int = 3,
    recovery_rounds: int = 2,
) -> list[dict | None]:
    """Fetch Caixa detail dates concurrently, preserving input order.

    None means the request did not yield a valid auction page and should be
    retried on a future ingestion. A tuple (including a missing second date)
    means the page was parsed successfully.
    """
    if not urls:
        return []

    semaphore = asyncio.Semaphore(concurrency)
    request_lock = asyncio.Lock()
    rate_limit_lock = asyncio.Lock()
    circuit_open = asyncio.Event()
    last_request_started = 0.0
    consecutive_429 = 0
    headers = {"User-Agent": _DETAIL_UA}

    # curl_cffi impersonates Chrome's TLS/HTTP fingerprint. Plain httpx and
    # urllib are redirected to Radware CAPTCHA pages even with a browser UA.
    async with AsyncSession(impersonate="chrome", headers=headers) as client:
        async def _one(url: str):
            nonlocal last_request_started, consecutive_429
            async with semaphore:
                if circuit_open.is_set():
                    return None
                for attempt in range(retries + 1):
                    try:
                        # Caixa rate-limits bursty detail-page traffic. Space
                        # request starts globally even though a small amount of
                        # response overlap is allowed by the semaphore.
                        async with request_lock:
                            loop = asyncio.get_running_loop()
                            wait = request_interval - (loop.time() - last_request_started)
                            if wait > 0:
                                await asyncio.sleep(wait)
                            last_request_started = loop.time()
                        response = await client.get(
                            url, timeout=10, allow_redirects=True
                        )
                        response.raise_for_status()
                        async with rate_limit_lock:
                            consecutive_429 = 0
                        parsed = parse_detail_html(
                            response.text,
                            base_url="https://venda-imoveis.caixa.gov.br",
                        )
                        first = parsed["first_auction_at"]
                        second = parsed["second_auction_at"]
                        # Caixa's bot manager can return an HTML challenge with
                        # HTTP 200. An eligible scheduled-sale page must contain
                        # at least one date, otherwise treat it as a retryable miss.
                        if first is not None or second is not None:
                            return {
                                "first_auction_at": first,
                                "second_auction_at": second,
                                "first_auction_price": parsed["first_auction_price"],
                                "second_auction_price": parsed["second_auction_price"],
                            }
                    except (RequestsError, ValueError) as exc:
                        response = getattr(exc, "response", None)
                        if getattr(response, "status_code", None) == 429:
                            async with rate_limit_lock:
                                consecutive_429 += 1
                                if consecutive_429 >= max_consecutive_429:
                                    circuit_open.set()
                                    logger.warning(
                                        "Caixa detail rate-limit circuit opened; "
                                        "deferring remaining URLs"
                                    )
                        logger.debug(
                            f"auction-date fetch attempt {attempt + 1} failed "
                            f"for {url}: {exc}"
                        )
                        if circuit_open.is_set():
                            return None
                    if attempt < retries:
                        await asyncio.sleep(5.0 * (attempt + 1))
                logger.debug(f"Auction dates unavailable for {url} in this pass")
                return None

        results = await asyncio.gather(*[_one(url) for url in urls])

    failed_indexes = [index for index, result in enumerate(results) if result is None]
    if failed_indexes and recovery_rounds > 0:
        # Caixa occasionally returns an HTTP-200 bot-manager/partial page that
        # contains no auction data. Retrying inside the same curl session often
        # repeats that response. Start a fresh TLS/cookie session after a short
        # cooldown and retry only the misses, preserving the original order.
        logger.info(
            f"Retrying {len(failed_indexes)} auction detail pages with a fresh session"
        )
        await asyncio.sleep(10.0)
        recovered = await fetch_auction_dates_batch(
            [urls[index] for index in failed_indexes],
            concurrency=concurrency,
            retries=retries,
            request_interval=request_interval,
            max_consecutive_429=max_consecutive_429,
            recovery_rounds=recovery_rounds - 1,
        )
        for index, result in zip(failed_indexes, recovered):
            results[index] = result

    if recovery_rounds == 0:
        for index in failed_indexes:
            if results[index] is None:
                logger.warning(
                    f"Auction dates unavailable for {urls[index]}; will retry next run"
                )
    return results


async def fetch_detail(detail_url: str, base_url: str = "https://venda-imoveis.caixa.gov.br") -> dict:
    """Scrape a detail page via the existing stealth Playwright scraper."""
    from tools.web_scraper import scrape_page

    scraped = await scrape_page(detail_url)
    return parse_detail_html(scraped.get("html", ""), base_url=base_url)
