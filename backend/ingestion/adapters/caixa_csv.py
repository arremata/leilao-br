"""Caixa CSV source adapter.

The per-state CSV lives at
https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_<UF>.csv
It is Latin-1 encoded, ';'-delimited, with preamble lines before the header.
Both the file and the portal sit behind Radware Bot Manager, so automated
fetching must go through the existing Playwright (stealth) browser. Callers may
also inject csv_bytes (e.g. a manually downloaded file) to bypass fetching.
"""

from __future__ import annotations

from typing import Optional

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
