"""Caixa CSV source adapter.

The per-state CSV lives at
https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_<UF>.csv
It is Latin-1 encoded, ';'-delimited, with preamble lines before the header.

The CSV path is guarded by Radware Bot Manager: a direct HTTP GET (or a headless
browser) is served an interactive hCaptcha/reCAPTCHA challenge, never the file.
A genuine *headed* Chrome with a persistent profile passes the challenge
transparently, so we drive the public download wizard (pick state -> Próximo)
and capture the CSV via the browser's own download. On a headless server this
must run under a virtual display (e.g. Xvfb). Callers may also inject csv_bytes
(e.g. in tests) to bypass fetching entirely.
"""

from __future__ import annotations

import asyncio
import os
import unicodedata
from typing import Optional

from loguru import logger
from playwright.async_api import async_playwright

from ingestion.adapters.base import NormalizedProperty, RawListing
from ingestion.normalize import (
    compute_discount, map_modalidade, parse_brl_number, parse_description,
)

CSV_URL_TEMPLATE = "https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_{uf}.csv"
DOWNLOAD_PAGE_URL = "https://venda-imoveis.caixa.gov.br/sistema/download-lista.asp"
# Persistent Chrome profile: reputation cookies build up here so the bot manager
# keeps letting us through without a CAPTCHA across runs.
PROFILE_DIR = os.path.join(
    os.path.expanduser("~"), ".cache", "leilao", "caixa_chrome_profile"
)

# The Caixa detail page embeds a single photo whose filename is deterministic
# from the listing's source_id (the "n° do imóvel"): it lives under /fotos/ as
# "F" + source_id zero-padded to 13 digits + "21.jpg". The "21" suffix is a
# fixed photo slot (not a per-listing index -- neighbors 01/02/20/22/23/30 all
# 404). The /fotos/ path is NOT behind Radware (only the CSV and detail HTML
# are), so the URL can be constructed from the CSV alone and validated with a
# plain HEAD. This lets the ingestor skip the per-listing detail-page browser
# navigation entirely.
PHOTO_URL_TEMPLATE = "https://venda-imoveis.caixa.gov.br/fotos/F{padded_id}21.jpg"


def build_photo_url(source_id: str) -> str:
    """Construct the Caixa photo URL from a listing's source_id.

    The id is zero-padded to 13 digits, e.g. "10139954" -> "F000001013995421.jpg".
    """
    return PHOTO_URL_TEMPLATE.format(padded_id=source_id.zfill(13))


class CaixaFetchError(RuntimeError):
    """Raised when the CSV could not be retrieved: an empty body, or a
    bot-manager CAPTCHA/HTML page served instead of the CSV data."""


def looks_like_captcha(raw: bytes) -> bool:
    """True when the response body is an HTML/bot-manager challenge page rather
    than CSV data (Radware Bot Manager serves this to automated clients)."""
    head = raw[:2000].lower()
    return (
        b"radware bot manager" in head
        or b"captcha" in head
        or b"<html" in head
        or b"<head" in head
    )

# Maps normalized (lower/stripped) CSV headers -> canonical raw keys.
CAIXA_HEADER_MAP = {
    "n° do imóvel": "source_id",
    "n° do imovel": "source_id",
    "nº do imóvel": "source_id",
    "numero do imovel": "source_id",
    "uf": "uf",
    "cidade": "city",
    "bairro": "neighborhood",
    "endereço": "address",
    "endereco": "address",
    "preço": "preco",
    "preco": "preco",
    "valor de avaliação": "avaliacao",
    "valor de avaliacao": "avaliacao",
    "desconto": "desconto_csv",
    "descrição": "descricao",
    "descricao": "descricao",
    "modalidade de venda": "modalidade",
    "link de acesso": "detail_url",
}


class CaixaCsvAdapter:
    source = "caixa"

    def __init__(self, uf: str, csv_bytes: Optional[bytes] = None,
                 headless: bool = False):
        self.uf = uf.upper()
        self._csv_bytes = csv_bytes
        # Headed Chrome passes the bot manager; headless is served a CAPTCHA.
        # Kept overridable for environments that wrap headed Chrome in Xvfb.
        self.headless = headless
        # Long-lived browser session, opened lazily by _download and closed by
        # close(). Kept on the adapter so detail-page fetches (fetch_detail_html)
        # reuse the same context/cookies/Radware reputation as the CSV download.
        self._pw = None
        self._context = None
        self._page = None

    def csv_url(self) -> str:
        return CSV_URL_TEMPLATE.format(uf=self.uf)

    def fetch_raw(self) -> list[RawListing]:
        """Sync entrypoint: parses injected csv_bytes or downloads via _download.

        Kept for backwards compatibility (tests, `run_cli --file` reingest). The
        ingest loop uses fetch_raw_async instead so the Playwright session stays
        on one event loop across the CSV download and all detail-page fetches.
        """
        return asyncio.run(self.fetch_raw_async())

    async def fetch_raw_async(self) -> list[RawListing]:
        """Async entrypoint: parses injected csv_bytes or downloads via _download.

        The browser context opened by _download is kept on self._context /
        self._page so subsequent fetch_detail_html_async calls reuse it. The
        caller must close() the adapter when done.
        """
        raw = self._csv_bytes if self._csv_bytes is not None else await self._download()
        if not raw:
            raise CaixaFetchError(f"Empty response fetching Caixa CSV for {self.uf}")
        if looks_like_captcha(raw):
            raise CaixaFetchError(
                f"Bot-manager CAPTCHA returned instead of CSV for {self.uf}"
            )
        return parse_caixa_csv(raw)

    async def _download(self) -> bytes:  # pragma: no cover - network dependent
        """Drive the public download wizard in a real (headed) Chrome with a
        persistent profile and capture the CSV via the browser's own download.

        The wizard navigates the browser to the CSV URL itself, so the bot
        manager's JS challenge runs in a genuine browser and passes. We must NOT
        use context.request.get (no JS -> always CAPTCHA). Raises CaixaFetchError
        on any failure so the caller never silently sees an empty result.

        The browser context is kept open on `self._context`/`self._page` after
        the download so subsequent `fetch_detail_html` calls can reuse it for
        photo scraping in the same session. Call `close()` to release it.
        """
        try:
            self._pw = await async_playwright().start()
            self._context = await self._pw.chromium.launch_persistent_context(
                PROFILE_DIR,
                channel="chrome",
                headless=self.headless,
                accept_downloads=True,
                viewport={"width": 1440, "height": 900},
            )
            self._page = self._context.pages[0] if self._context.pages else await self._context.new_page()
            await self._page.goto(DOWNLOAD_PAGE_URL, wait_until="networkidle", timeout=60000)
            await self._page.select_option("#cmb_estado", self.uf)
            async with self._page.expect_download(timeout=60000) as dl_info:
                await self._page.click("#btn_next1")
            download = await dl_info.value
            path = await download.path()
            with open(path, "rb") as fh:
                return fh.read()
        except Exception as e:
            # On failure, tear down the session so close() is a no-op later.
            await self._teardown_async()
            logger.error(f"Caixa CSV download failed for {self.uf}: {e}")
            raise CaixaFetchError(
                f"Caixa CSV download failed for {self.uf}: {e}"
            ) from e

    async def _fetch_detail_html(self, detail_url: str) -> str:
        """Navigate the already-open page to detail_url and return its HTML.

        Returns '' on any failure (never raises) so the caller can skip the
        photo and leave detail_fetched=False for a retry next run.
        """
        if self._page is None:
            # Session was never opened (e.g. csv_bytes injected in tests, or
            # _download failed before opening the context).
            return ""
        try:
            await self._page.goto(detail_url, wait_until="domcontentloaded", timeout=30000)
            # Let images render so parse_detail_html can find the <img src=".../fotos/...">.
            await self._page.wait_for_timeout(2000)
            return await self._page.content()
        except Exception as e:
            logger.warning(f"Detail page fetch failed for {detail_url}: {e}")
            return ""

    async def fetch_detail_html_async(self, detail_url: Optional[str]) -> str:
        """Async entrypoint used by ingest() on the shared event loop."""
        if not detail_url:
            return ""
        return await self._fetch_detail_html(detail_url)

    def fetch_detail_html(self, detail_url: Optional[str]) -> str:
        """Sync wrapper around _fetch_detail_html. Returns HTML or '' (never
        raises). Returns '' immediately when detail_url is blank or the browser
        session was never opened."""
        if not detail_url:
            return ""
        return asyncio.run(self._fetch_detail_html(detail_url))

    async def _teardown_async(self) -> None:
        """Close the persistent context and stop Playwright (best-effort)."""
        if self._context is not None:
            try:
                await self._context.close()
            except Exception:
                pass
            self._context = None
            self._page = None
        if self._pw is not None:
            try:
                await self._pw.stop()
            except Exception:
                pass
            self._pw = None

    async def close_async(self) -> None:
        """Async teardown for use on the shared event loop. Idempotent."""
        if self._context is None and self._pw is None:
            return
        await self._teardown_async()

    def close(self) -> None:
        """Sync wrapper around close_async. Idempotent and safe to call when the
        session was never opened. Use close_async instead when already on the
        ingest event loop (asyncio.run on a running loop raises)."""
        if self._context is None and self._pw is None:
            return
        asyncio.run(self._teardown_async())

    def normalize(self, raw: RawListing) -> NormalizedProperty:
        r = raw.raw
        preco = parse_brl_number(r.get("preco", ""))
        avaliacao_val = parse_brl_number(r.get("avaliacao", ""))
        avaliacao = avaliacao_val if avaliacao_val > 0 else None
        desc = parse_description(r.get("descricao", ""))
        return NormalizedProperty(
            source=self.source,
            source_id=raw.source_id,
            uf=(r.get("uf") or self.uf or "").strip().upper() or None,
            city=(r.get("city") or "").strip() or None,
            neighborhood=(r.get("neighborhood") or "").strip() or None,
            address=(r.get("address") or "").strip(),
            property_type=desc["property_type"],
            area_m2=desc["area_m2"],
            beds=desc["beds"],
            preco=preco,
            avaliacao=avaliacao,
            desconto_oficial=compute_discount(preco, avaliacao),
            modalidade=map_modalidade(r.get("modalidade", "")),
            descricao_raw=(r.get("descricao") or "").strip(),
            detail_url=(r.get("detail_url") or "").strip(),
            # Photo URL is deterministic from source_id (see build_photo_url);
            # set here so ingest() can HEAD-validate without a browser.
            photo_url=build_photo_url(raw.source_id),
            raw=r,
        )


def _norm_header(cell: str) -> str:
    flat = unicodedata.normalize("NFKD", cell).strip().lower()
    return flat


def _is_header_row(cells: list[str]) -> bool:
    normalized = {_norm_header(c) for c in cells}
    _cidade = _norm_header("cidade")
    _n1 = _norm_header("n° do imóvel")
    _n2 = _norm_header("nº do imóvel")
    _n3 = _norm_header("numero do imovel")
    return "uf" in normalized and any(
        h in normalized for h in (_cidade, _n1, _n2, _n3)
    )


def parse_caixa_csv(raw: bytes) -> list[RawListing]:
    """Decode Latin-1 CSV bytes, locate the header row, and return one
    RawListing per data row keyed by canonical raw keys (see CAIXA_HEADER_MAP)."""
    # Pre-normalize the map keys with NFKD so they match the NFKD-normalized CSV headers.
    _norm_map = {_norm_header(k): v for k, v in CAIXA_HEADER_MAP.items()}

    text = raw.decode("latin-1", errors="replace")
    lines = [ln for ln in text.splitlines()]

    header_idx = None
    header_keys: list[str] = []
    for i, line in enumerate(lines):
        cells = line.split(";")
        if _is_header_row(cells):
            header_idx = i
            header_keys = [_norm_map.get(_norm_header(c), _norm_header(c)) for c in cells]
            break

    if header_idx is None:
        return []

    listings: list[RawListing] = []
    for line in lines[header_idx + 1:]:
        if not line.strip():
            continue
        cells = line.split(";")
        row = {}
        for key, value in zip(header_keys, cells):
            row[key] = value.strip()
        source_id = row.get("source_id", "").strip()
        if not source_id:
            continue
        listings.append(RawListing(source="caixa", source_id=source_id, raw=row))
    return listings
