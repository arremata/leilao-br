"""Pure normalization helpers for ingested rows (no I/O, no LLM)."""

from __future__ import annotations

import re
import unicodedata
from typing import Optional


def parse_brl_number(text: str) -> float:
    """Parse a Brazilian-formatted number ('150.000,00', 'R$ 68.816,17', '90000')
    into a float. Returns 0.0 for empty/unparseable input."""
    if not text:
        return 0.0
    match = re.search(r"[\d.,]+", str(text))
    if not match:
        return 0.0
    raw = match.group(0)
    if re.search(r",\d{1,2}$", raw):
        # Brazilian decimal: dots are thousands separators, comma is decimal.
        raw = raw.replace(".", "").replace(",", ".")
    else:
        raw = raw.replace(",", "")
    try:
        return float(raw)
    except ValueError:
        return 0.0


def compute_discount(preco: float, avaliacao: Optional[float]) -> Optional[float]:
    """Desconto oficial = (1 - preco/avaliacao) * 100, rounded to 2 decimals.
    Returns None when the appraisal is missing/zero; clamps negatives to 0."""
    if not avaliacao or avaliacao <= 0:
        return None
    pct = (1 - (preco / avaliacao)) * 100
    return round(max(pct, 0.0), 2)


_KNOWN_TYPES = [
    "Apartamento", "Casa", "Terreno", "Loja", "Sala", "Galpão",
    "Gleba", "Prédio", "Sobrado", "Imóvel", "Comercial", "Chácara",
]


def _strip_accents(text: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c)
    )


def parse_description(desc: str) -> dict:
    """Best-effort extraction of property_type, area_m2 and beds from the
    free-text Caixa description. Missing fields come back as None."""
    result = {"property_type": None, "area_m2": None, "beds": None}
    if not desc:
        return result

    flat = _strip_accents(desc).lower()

    for t in _KNOWN_TYPES:
        if _strip_accents(t).lower() in flat:
            result["property_type"] = t
            break

    # Area: prefer 'privativa', then 'total', then land area, taking the first
    # positive value. Handles both the real Caixa format (number *before* the
    # keyword, dot decimals, no 'm2' suffix, e.g. "41.54 de área privativa") and
    # the older format (number *after*, comma decimals, 'm2' suffix).
    area = None
    for pattern in (
        r"([\d.,]+)\s+de\s+area privativa",   # real: "41.54 de área privativa"
        r"area privativa\s+de\s+([\d.,]+)",   # old:  "área privativa de 65,00"
        r"([\d.,]+)\s+de\s+area total",       # real: "43.37 de área total"
        r"area total\s+([\d.,]+)\s*m",        # old:  "área total 120,00 m2"
        r"([\d.,]+)\s+de\s+area do terreno",  # real fallback (terrenos)
        r"([\d.,]+)\s*m2",
        r"([\d.,]+)\s*m²",
    ):
        m = re.search(pattern, flat)
        if m:
            value = parse_brl_number(m.group(1))
            if value > 0:
                area = value
                break
    result["area_m2"] = area

    beds_match = re.search(r"(\d+)\s*(?:quarto|dormit|qto)", flat)
    if beds_match:
        result["beds"] = int(beds_match.group(1))

    return result


def map_modalidade(raw: str) -> str:
    """Map the Caixa 'Modalidade de venda' free text to a stable enum-ish label."""
    if not raw:
        return "Outros"
    low = _strip_accents(raw).lower()
    if "leilao" in low or "sfi" in low:
        return "Leilão SFI"
    if "licita" in low:
        return "Licitação Aberta"
    if "venda direta" in low or "online" in low:
        return "Venda Direta Online"
    return "Outros"
