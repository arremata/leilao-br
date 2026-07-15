"""Caixa CSV source adapter.

The per-state CSV lives at
https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_<UF>.csv
It is Latin-1 encoded, ';'-delimited, with preamble lines before the header.
Both the file and the portal sit behind Radware Bot Manager, so automated
fetching must go through the existing Playwright (stealth) browser. Callers may
also inject csv_bytes (e.g. a manually downloaded file) to bypass fetching.
"""

from __future__ import annotations

import asyncio
import unicodedata
from typing import Optional

from loguru import logger
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

from ingestion.adapters.base import NormalizedProperty, RawListing
from ingestion.normalize import (
    compute_discount, map_modalidade, parse_brl_number, parse_description,
)

CSV_URL_TEMPLATE = "https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_{uf}.csv"

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

    def __init__(self, uf: str, csv_bytes: Optional[bytes] = None):
        self.uf = uf.upper()
        self._csv_bytes = csv_bytes

    def csv_url(self) -> str:
        return CSV_URL_TEMPLATE.format(uf=self.uf)

    def fetch_raw(self) -> list[RawListing]:
        raw = self._csv_bytes if self._csv_bytes is not None else asyncio.run(self._download())
        return parse_caixa_csv(raw)

    async def _download(self) -> bytes:
        """Fetch the CSV through a stealth browser context so the Radware bot
        manager sees a real browser session. Visits the download page first to
        pick up cookies, then requests the CSV via the browser's request API."""
        pw = await async_playwright().start()
        try:
            browser = await pw.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1920, "height": 1080},
            )
            page = await context.new_page()
            await Stealth().apply_stealth_async(page)
            await page.goto(
                "https://venda-imoveis.caixa.gov.br/sistema/download-lista.asp",
                wait_until="domcontentloaded",
                timeout=30000,
            )
            await page.wait_for_timeout(4000)
            resp = await context.request.get(self.csv_url(), timeout=30000)
            body = await resp.body()
            await browser.close()
            return body
        except Exception as e:  # pragma: no cover - network dependent
            logger.error(f"Caixa CSV download failed for {self.uf}: {e}")
            return b""
        finally:
            await pw.stop()

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
