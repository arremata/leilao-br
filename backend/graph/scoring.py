# graph/scoring.py
"""Scoring node: compute risk flags and ROI from market + legal results.

The 0-100 `score` was removed in favour of a simple Bom/Ruim verdict derived
from risk flags. Jurídico risk is still computed (kept for API compatibility
in RiskFlags.j) but is no longer surfaced in the frontend viability tab.
"""

from __future__ import annotations

import re
from typing import Optional

from loguru import logger

from graph.contracts import RiskFlags, ScoringResult
from graph.state import AuctionState, LegalResult, MarketResult, PropertyMetadata


_DEBT_INDICATORS = re.compile(r"r\$\s*[\d.,]+", re.IGNORECASE)
_NEGLECT_KEYWORDS = {"nenhum", "n/a", "inexistente", "não consta", "nao consta", "sem débito", "sem debito", ""}


def _has_non_trivial_debt(debt_text: str) -> bool:
    if not debt_text:
        return False
    lower = debt_text.lower().strip()
    if lower in _NEGLECT_KEYWORDS:
        return False
    return bool(_DEBT_INDICATORS.search(debt_text))


def compute_risk_flags(
    risk_level: str,
    tax_debts_iptu: str,
    condominium_debts: str,
    federal_state_debts: str,
) -> RiskFlags:
    if risk_level == "low":
        j = "good"
    elif risk_level == "medium":
        j = "warn"
    else:
        j = "bad"

    has_condo_debt = _has_non_trivial_debt(condominium_debts)
    has_federal_debt = _has_non_trivial_debt(federal_state_debts)
    has_iptu_debt = _has_non_trivial_debt(tax_debts_iptu)

    if has_condo_debt or has_federal_debt:
        f = "bad"
    elif has_iptu_debt:
        f = "warn"
    else:
        f = "good"

    return RiskFlags(j=j, f=f)


def compute_roi(min_bid: float, market_value: float, fee_rate: float = 0.0) -> float:
    if min_bid <= 0:
        return 0.0
    fees = min_bid * max(fee_rate, 0.0)
    total_cost = min_bid + fees
    if total_cost <= 0:
        return 0.0
    return round(((market_value - total_cost) / total_cost) * 100, 2)


def scoring_node(state: AuctionState) -> dict:
    """LangGraph node: compute risk flags and ROI from market + legal results."""
    metadata = state.property_metadata if hasattr(state, "property_metadata") else state.get("property_metadata")
    market_result = state.market_result if hasattr(state, "market_result") else state.get("market_result")
    legal_result = state.legal_result if hasattr(state, "legal_result") else state.get("legal_result")

    if not metadata:
        logger.warning("Scoring node: no property metadata available")
        return {
            "scoring_result": ScoringResult(
                risk=RiskFlags(j="bad", f="bad"),
                roi=0.0,
            ),
            "errors": ["No property metadata for scoring"],
        }

    risk_level = legal_result.risk_level if legal_result and legal_result.risk_level else "critical"

    iptu = legal_result.tax_debts_iptu if legal_result else ""
    condo = legal_result.condominium_debts if legal_result else ""
    federal = legal_result.federal_state_debts if legal_result else ""

    risk = compute_risk_flags(
        risk_level=risk_level, tax_debts_iptu=iptu,
        condominium_debts=condo, federal_state_debts=federal,
    )

    market_value = (
        ((market_result.price_per_m2_neighborhood or 0.0) * (metadata.area_m2 or 0.0) if market_result else 0.0)
        or 0.0
    )
    auction_price = metadata.auction_price if metadata.auction_price is not None else 0.0
    fee_rate = (metadata.itbi_rate or 0.0) + (metadata.commission_rate or 0.0)
    roi = compute_roi(min_bid=auction_price, market_value=market_value, fee_rate=fee_rate)

    scoring_result = ScoringResult(risk=risk, roi=roi)
    logger.info(f"Scoring node: risk={risk.model_dump()}, roi={roi}%")
    return {"scoring_result": scoring_result}
