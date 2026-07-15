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
