"""Pydantic models for the output contract between backend agents and frontend."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict


def _to_camel(snake: str) -> str:
    """Convert snake_case to camelCase."""
    parts = snake.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


class RiskFlags(BaseModel):
    """Risk assessment flags for the four dimensions that matter most in auctions."""

    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    j: Literal["good", "warn", "bad"]  # Jurídico
    f: Literal["good", "warn", "bad"]  # Financeiro
    l: Literal["good", "warn", "bad"]  # Liquidez
    o: Literal["good", "warn", "bad"]  # Ocupação


class ScoringResult(BaseModel):
    """Computed scoring data produced by the scoring node."""

    score: int  # 0-100
    risk: RiskFlags
    roi: float  # projected ROI %


class RiskDimension(BaseModel):
    """A single risk dimension score for the viability tab."""
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    dim: str      # "Jurídico", "Financeiro", "Liquidez", "Ocupação"
    pct: int      # 0-100
    state: Literal["good", "warn", "bad"]
    note: str


class AlertItem(BaseModel):
    """A single alert item for the viability tab."""
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    level: Literal["good", "warn", "bad"]
    title: str
    text: str


class ViabilityDetail(BaseModel):
    """Detail data for the viability/financial feasibility tab."""
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    risk_dimensions: list[RiskDimension]
    alerts: list[AlertItem]
    description: str
    features: dict[str, str]


class MarketIndicator(BaseModel):
    """A single market indicator stat."""
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    lbl: str
    val: str
    delta: str
    pos: bool | None = None
    neg: bool | None = None


class ComparableSale(BaseModel):
    """A comparable property sale for the market tab."""
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    address: str
    area_m2: float
    beds: int | None
    price_per_m2: float
    sale_price: float
    source: str  # e.g. "ZAP Imóveis", "Viva Real"
    url: str  # link to the comparable property listing


class MarketDetail(BaseModel):
    """Detail data for the market tab."""
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    indicators: list[MarketIndicator]
    trend: list[float]
    trend_start_label: str
    trend_end_label: str
    comparables: list[ComparableSale]


class CostLineItem(BaseModel):
    """A single cost line item for the cost breakdown tab."""
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    label: str
    value: float
    hint: str
    kind: str  # "price" | "tax" | "fee" | "debt" | "reno"


class EditalDetail(BaseModel):
    """Detail data for the edital tab."""
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    process: str
    creditor: str
    debtor: str
    modality: str
    first_bid_date: str
    first_bid_price: float
    second_bid_date: str
    second_bid_price: float
    property_description: str
    liens: list[str]
    payment_terms: str
    summary_note: str


class AuctionPropertyResult(BaseModel):
    """The single source of truth for what the frontend consumes.

    Maps to the PROPERTIES array item shape in the Arremate frontend's shared.jsx.
    Monetary values are raw BRL numbers — the frontend formats them with fmtBRL().
    Serializes to camelCase JSON keys matching the frontend's expected shape.
    """

    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    id: str
    score: int
    photo_label: str
    title: str
    address: str
    type: str
    neighborhood: str
    city: str
    auction_type: str
    auctioneer: str
    court: str
    discount: float
    min_bid: float
    market: float
    roi: float
    area: float
    beds: int | None = None
    baths: int | None = None
    parking: int | None = None
    floor: str | None = None
    ends_at: str
    occupancy: str
    risk: RiskFlags
    viability: ViabilityDetail | None = None
    market_detail: MarketDetail | None = None
    costs: list[CostLineItem] | None = None
    edital: EditalDetail | None = None
    auction_url: str | None = None
