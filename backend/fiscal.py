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


# Simplified registration-cost references by state. Real-estate registry fees
# are progressive and may include more than one act, so these percentages are
# deliberately exposed as editable estimates in the frontend rather than as a
# definitive cartorio quote.
_REGISTRATION_RATE_OVERRIDES = {
    "PR": 0.008,
    "SP": 0.009,
    "RJ": 0.0085,
    "MG": 0.0075,
    "RS": 0.007,
    "SC": 0.007,
    "DF": 0.008,
    "BA": 0.008,
    "GO": 0.0075,
}
_DEFAULT_REGISTRATION_RATE = 0.0075
_BRAZILIAN_UFS = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT",
    "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO",
    "RR", "SC", "SP", "SE", "TO",
}

REGISTRATION_RATES = {
    uf: _REGISTRATION_RATE_OVERRIDES.get(uf, _DEFAULT_REGISTRATION_RATE)
    for uf in _BRAZILIAN_UFS
}


def get_itbi(uf: str, city: str) -> dict | None:
    return ITBI_RATES.get(((uf or "").upper(), _key(city)))


def get_registration_fee(uf: str) -> dict | None:
    """Return the simplified 2025 registry estimate for a Brazilian state."""
    normalized_uf = (uf or "").upper().strip()
    rate = REGISTRATION_RATES.get(normalized_uf)
    if rate is None:
        return None
    return {
        "rate": rate,
        "source": (
            "Referência simplificada Arremate baseada nas tabelas estaduais "
            "de emolumentos reunidas pelo IRIB (2025). O valor final varia por "
            "faixa e pelos atos praticados; confirme com o cartório."
        ),
    }
