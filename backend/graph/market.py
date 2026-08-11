"""Deterministic market calculation from a persisted regional reference."""

from __future__ import annotations

from statistics import median

from loguru import logger

from graph.state import AuctionState, ComparableProperty, MarketResult


def calculate_market(
    metadata,
    comparables: list[ComparableProperty],
    regional_price_per_m2: float | None = None,
) -> MarketResult:
    """Calculate auditable market values without an LLM.

    A neighborhood reference is used only when no usable live comparable was
    found. The appraisal is deliberately not treated as a market comparable.
    """
    usable = [
        comp for comp in comparables
        if comp.price > 0 and comp.area_m2 > 0 and comp.price_per_m2 > 0
    ]
    if len(usable) >= 3:
        center = median(comp.price_per_m2 for comp in usable)
        usable = [
            comp for comp in usable
            if center * 0.5 <= comp.price_per_m2 <= center * 2.0
        ]
    prices = [comp.price_per_m2 for comp in usable]
    price_per_m2 = float(median(prices)) if prices else float(regional_price_per_m2 or 0)
    area = float(getattr(metadata, "area_m2", 0) or 0)
    auction_price = float(getattr(metadata, "auction_price", 0) or 0)
    market_value = price_per_m2 * area
    discount = (
        round((market_value - auction_price) / market_value * 100, 2)
        if market_value > 0 else 0.0
    )
    return MarketResult(
        price_per_m2_neighborhood=round(price_per_m2, 2),
        comparable_properties=usable,
        discount_percentage=discount,
    )


def market_node(
    state: AuctionState,
    regional_price_per_m2: float | None = None,
    persisted_comparables: list[ComparableProperty] | None = None,
) -> dict:
    """Calculate instantly from the reference maintained by the market worker.

    The request path deliberately performs no browsing. Missing references
    produce a zero/unknown market result instead of blocking the UI or inventing
    a value.
    """
    metadata = state.property_metadata
    if not metadata:
        return {
            "market_result": MarketResult(),
            "errors": ["No property metadata for market calculation"],
        }

    result = calculate_market(
        metadata, persisted_comparables or [], regional_price_per_m2,
    )
    logger.info(
        "Market calculator: persisted reference R$ {:.2f}/m²",
        result.price_per_m2_neighborhood,
    )
    return {"market_result": result}
