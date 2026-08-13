"""Deterministic market calculation from a persisted regional reference."""

from __future__ import annotations

from statistics import median
import re
import unicodedata

from loguru import logger

from graph.state import AuctionState, ComparableProperty, MarketResult


def is_land_property_type(property_type: str | None) -> bool:
    """Return whether automated price/m² extrapolation is unsafe for the type."""
    normalized = unicodedata.normalize("NFKD", property_type or "").encode("ascii", "ignore").decode()
    return bool(re.search(r"\b(terreno|lote|gleba)\b", normalized.lower()))


def _normalized_address(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    value = re.sub(r"\b(rua|r|avenida|av|numero|n)\b", " ", value.lower())
    return " ".join(re.findall(r"[a-z0-9]+", value))


def _is_probable_auction_ad(metadata, comp: ComparableProperty) -> bool:
    """Identify portal ads that merely publicize the property being auctioned."""
    subject_tokens = set(_normalized_address(getattr(metadata, "address", "")).split())
    candidate_tokens = set(_normalized_address(comp.address).split())
    address_match = bool(subject_tokens) and len(subject_tokens & candidate_tokens) >= min(3, len(subject_tokens))
    subject_area = float(getattr(metadata, "area_m2", 0) or 0)
    same_area = subject_area > 0 and abs(comp.area_m2 - subject_area) / subject_area <= 0.03
    auction_values = {
        float(value) for value in (
            getattr(metadata, "auction_price", 0),
            getattr(metadata, "auction_price_2nd", 0),
            getattr(metadata, "market_value_estimate", 0),
        ) if value
    }
    same_price = any(abs(comp.price - value) / value <= 0.01 for value in auction_values)
    auction_language = any(term in f"{comp.address} {comp.url}".lower() for term in ("leilao", "leilão", "hasta"))
    return (address_match and same_area) or (same_area and same_price) or auction_language


def _matches_subject_standard(metadata, comp: ComparableProperty) -> bool:
    subject_area = float(getattr(metadata, "area_m2", 0) or 0)
    return subject_area <= 0 or 0.65 * subject_area <= comp.area_m2 <= 1.35 * subject_area


def calculate_market(
    metadata,
    comparables: list[ComparableProperty],
    regional_price_per_m2: float | None = None,
) -> MarketResult:
    """Calculate auditable market values without an LLM.

    A neighborhood reference is used only when no usable live comparable was
    found. The appraisal is deliberately not treated as a market comparable.
    """
    # Land values depend heavily on zoning, buildable area, topography and the
    # scale of the parcel. Multiplying a neighborhood-wide R$/m² reference by
    # the full land area can produce spectacularly wrong estimates.
    if is_land_property_type(getattr(metadata, "property_type", "")):
        return MarketResult()

    usable = [
        comp for comp in comparables
        if comp.price > 0 and comp.area_m2 > 0 and comp.price_per_m2 > 0
        and _matches_subject_standard(metadata, comp)
        and not _is_probable_auction_ad(metadata, comp)
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
