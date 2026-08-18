"""Deterministic recurring-cost estimates backed by persisted city references."""

from __future__ import annotations

import re
import unicodedata


def _normalized(value: str | None) -> str:
    return unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode().casefold()


def estimate_property_expenses(prop, reference) -> dict:
    """Calculate monthly estimates without presenting them as billed values."""
    appraisal = float(getattr(prop, "avaliacao", None) or getattr(prop, "preco", 0) or 0)
    area = float(getattr(prop, "area_m2", None) or 0)
    property_type = _normalized(getattr(prop, "property_type", ""))
    description = _normalized(getattr(prop, "descricao_raw", ""))
    annual_iptu = round(appraisal * float(reference.annual_iptu_rate), 2)

    is_apartment = bool(re.search(r"\b(apartamento|apto|flat|kitnet|studio)\b", property_type))
    explicitly_condo = "condomin" in description
    monthly_condo = round(area * float(reference.condo_per_m2_monthly), 2) if (
        area > 0 and (is_apartment or explicitly_condo)
    ) else 0.0

    return {
        "monthlyIptu": round(annual_iptu / 12, 2),
        "annualIptu": annual_iptu,
        "monthlyCondo": monthly_condo,
        "expenseEstimate": {
            "kind": "city_reference",
            "uf": reference.uf,
            "city": reference.city,
            "referenceYear": reference.reference_year,
            "annualIptuRate": reference.annual_iptu_rate,
            "condoPerM2Monthly": reference.condo_per_m2_monthly,
            "source": reference.source,
        },
    }


def apply_property_expenses(result, prop, reference):
    if reference is None:
        return result
    values = estimate_property_expenses(prop, reference)
    result.monthly_iptu = values["monthlyIptu"]
    result.monthly_condo = values["monthlyCondo"] or None
    result.annual_iptu = values["annualIptu"]
    result.expense_estimate = values["expenseEstimate"]
    return result
