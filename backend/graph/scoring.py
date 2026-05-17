# graph/scoring.py
"""Scoring node: compute overall score, risk flags, and ROI from market + legal results."""

from __future__ import annotations

import re
from typing import Optional

from loguru import logger

from graph.contracts import RiskFlags, ScoringResult
from graph.state import AuctionState, LegalResult, MarketResult, PropertyMetadata


_DEBT_INDICATORS = re.compile(r"r\$\s*[\d.,]+", re.IGNORECASE)
_NEGLECT_KEYWORDS = {"nenhum", "n/a", "inexistente", "não consta", "nao consta", "sem débito", "sem debito", ""}


def compute_score(
    market_score: int,
    discount_percentage: float,
    risk_level: str,
    occupation: str,
    liquidity_days: int,
) -> int:
    """Compute a 0-100 score from market and legal factors."""
    score = 50.0
    score += market_score * 3
    score += discount_percentage * 0.3
    legal_adj = {"low": 15, "medium": 0, "high": -15, "critical": -30}
    score += legal_adj.get(risk_level, 0)
    occ_lower = occupation.lower()
    if "desocupado" in occ_lower:
        score += 10
    elif any(w in occ_lower for w in ("disputado", "posseiro", "invasor")):
        score -= 15
    else:
        score -= 5
    if liquidity_days < 60:
        score += 5
    elif liquidity_days > 120:
        score -= 5
    return max(0, min(100, int(round(score))))


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
    liquidity_days: int,
    occupation_status: str,
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

    if liquidity_days < 60:
        l = "good"
    elif liquidity_days <= 120:
        l = "warn"
    else:
        l = "bad"

    occ_lower = occupation_status.lower()
    if "desocupado" in occ_lower:
        o = "good"
    elif any(w in occ_lower for w in ("disputado", "posseiro", "invasor")):
        o = "bad"
    else:
        o = "warn"

    return RiskFlags(j=j, f=f, l=l, o=o)


def compute_roi(min_bid: float, market_value: float, reform_estimate: float) -> float:
    if min_bid <= 0:
        return 0.0
    fees = min_bid * 0.078
    total_cost = min_bid + reform_estimate + fees
    if total_cost <= 0:
        return 0.0
    return round(((market_value - total_cost) / total_cost) * 100, 2)


def _get_occupation(legal_result: Optional[LegalResult]) -> str:
    if legal_result and legal_result.occupation_status:
        return legal_result.occupation_status
    return "ocupado"


def scoring_node(state: AuctionState) -> dict:
    """LangGraph node: compute score, risk flags, and ROI from market + legal results."""
    metadata = state.property_metadata if hasattr(state, "property_metadata") else state.get("property_metadata")
    market_result = state.market_result if hasattr(state, "market_result") else state.get("market_result")
    legal_result = state.legal_result if hasattr(state, "legal_result") else state.get("legal_result")

    if not metadata:
        logger.warning("Scoring node: no property metadata available")
        return {
            "scoring_result": ScoringResult(
                score=0,
                risk=RiskFlags(j="bad", f="bad", l="bad", o="bad"),
                roi=0.0,
            ),
            "errors": ["No property metadata for scoring"],
        }

    market_score = market_result.market_score if market_result and market_result.market_score is not None else 0
    discount_pct = market_result.discount_percentage if market_result and market_result.discount_percentage is not None else 0.0
    liquidity_days = market_result.liquidity_days if market_result and market_result.liquidity_days is not None else 90
    risk_level = legal_result.risk_level if legal_result and legal_result.risk_level else "critical"
    occupation = _get_occupation(legal_result)

    iptu = legal_result.tax_debts_iptu if legal_result else ""
    condo = legal_result.condominium_debts if legal_result else ""
    federal = legal_result.federal_state_debts if legal_result else ""

    score = compute_score(
        market_score=market_score, discount_percentage=discount_pct,
        risk_level=risk_level, occupation=occupation, liquidity_days=liquidity_days,
    )

    risk = compute_risk_flags(
        risk_level=risk_level, tax_debts_iptu=iptu,
        condominium_debts=condo, federal_state_debts=federal,
        liquidity_days=liquidity_days, occupation_status=occupation,
    )

    market_value = (
        metadata.market_value_estimate
        or ((market_result.price_per_m2_neighborhood or 0.0) * (metadata.area_m2 or 0.0) if market_result else 0.0)
    ) or 0.0
    reform_estimate = market_result.reform_estimate if market_result and market_result.reform_estimate is not None else 0.0

    auction_price = metadata.auction_price if metadata.auction_price is not None else 0.0
    roi = compute_roi(min_bid=auction_price, market_value=market_value, reform_estimate=reform_estimate)

    scoring_result = ScoringResult(score=score, risk=risk, roi=roi)
    logger.info(f"Scoring node: score={score}, risk={risk.model_dump()}, roi={roi}%")
    return {"scoring_result": scoring_result}
