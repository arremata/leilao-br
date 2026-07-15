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

    # Area: prefer 'privativa', fall back to 'total', then any 'm2' number.
    area = None
    for pattern in (
        r"area privativa[^0-9]*([\d.,]+)\s*m",
        r"area total[^0-9]*([\d.,]+)\s*m",
        r"([\d.,]+)\s*m2",
        r"([\d.,]+)\s*m²",
    ):
        m = re.search(pattern, flat)
        if m:
            area = parse_brl_number(m.group(1))
            break
    result["area_m2"] = area if area else None

    beds_match = re.search(r"(\d+)\s*(?:quarto|dormit)", flat)
    if beds_match:
        result["beds"] = int(beds_match.group(1))

    return result
