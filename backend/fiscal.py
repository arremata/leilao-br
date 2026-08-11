"""Versioned municipal transfer-tax references used by the cost calculator."""

from __future__ import annotations

import unicodedata


def _key(value: str) -> str:
    return "".join(
        char for char in unicodedata.normalize("NFKD", value or "")
        if not unicodedata.combining(char)
    ).casefold().strip()


# Rates are decimals. Sources must be reviewed whenever municipal law changes.
ITBI_RATES = {
    ("PR", "curitiba"): {
        "rate": 0.027,
        "source": "Prefeitura de Curitiba — ITBI, alíquota geral de 2,7%",
    },
    ("PR", "londrina"): {
        "rate": 0.02,
        "source": "Prefeitura de Londrina — Código Tributário Municipal, ITBI 2%",
    },
}


def get_itbi(uf: str, city: str) -> dict | None:
    return ITBI_RATES.get(((uf or "").upper(), _key(city)))
