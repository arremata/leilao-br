"""Pydantic models for the output contract between backend agents and frontend."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict


def _to_camel(snake: str) -> str:
    """Convert snake_case to camelCase."""
    parts = snake.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


class RiskFlags(BaseModel):
    """Risk assessment flags — Jurídico dropped per product decision (Sep 2026).

    Kept for backward-compat in the API surface but the frontend no longer
    reads `j`. Computed as a placeholder only.
    """

    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    j: Literal["good", "warn", "bad"]  # Jurídico — deprecated, kept for API compat
    f: Literal["good", "warn", "bad"]  # Financeiro


class ScoringResult(BaseModel):
    """Computed scoring data produced by the scoring node.

    The 0-100 `score` field has been removed — verdict is now derived from
    risk flags. Only ROI and risk are computed.
    """

    risk: RiskFlags
    roi: float  # projected ROI %


class RiskDimension(BaseModel):
    """A single risk dimension score for the viability tab."""
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    dim: str      # currently "Financeiro"
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
    """Detail data for the viability/financial feasibility tab.

    Only evidence-backed dimensions are returned.
    """
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
    comparables: list[ComparableSale]
    confidence_level: Literal["low", "medium", "high"] = "low"


class CostLineItem(BaseModel):
    """A single cost line item for the cost breakdown tab."""
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    label: str
    value: float
    hint: str
    kind: str  # "price" | "tax" | "fee" | "debt" | "reno"
    id: str | None = None
    # Decimal fraction of the considered bid when this is a percentage-based
    # cost. The frontend uses it to keep fees dynamic as the bid changes.
    rate: float | None = None


class EditalDetail(BaseModel):
    """Detail data for the edital tab."""
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    process: str
    creditor: str
    debtor: str
    matricula: str = ""
    first_bid_date: str
    first_bid_price: float
    second_bid_date: str
    second_bid_price: float
    property_description: str
    liens: list[str]
    summary_note: str


class AuctionPropertyResult(BaseModel):
    """The single source of truth for what the frontend consumes.

    Maps to the PROPERTIES array item shape in the Arremate frontend's shared.jsx.
    Monetary values are raw BRL numbers — the frontend formats them with fmtBRL().
    Serializes to camelCase JSON keys matching the frontend's expected shape.
    """

    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    id: str
    photo_label: str
    title: str
    address: str
    type: str
    neighborhood: str
    city: str
    auction_type: str
    praca: str | None = None
    modalidade: str | None = None
    auctioneer: str
    court: str
    discount: float
    min_bid: float
    market: float
    roi: float
    # Valor de avaliação do edital (separado do market que é IA via comparáveis).
    # Quando o edital não expõe avaliação própria, cai para min_bid.
    appraisal: float
    # Deságio oficial do leilão: (appraisal - min_bid) / appraisal * 100.
    # Em 1ª praça costuma ser 0% (lance = avaliação).
    auction_discount: float
    area: float
    beds: int | None = None
    baths: int | None = None
    parking: int | None = None
    floor: str | None = None
    ends_at: str
    risk: RiskFlags
    viability: ViabilityDetail | None = None
    market_detail: MarketDetail | None = None
    costs: list[CostLineItem] | None = None
    edital: EditalDetail | None = None
    auction_url: str | None = None
    photo_url: str | None = None
    matricula: str | None = None
    edital_url: str | None = None
    matricula_url: str | None = None
    edital_data: dict | None = None
    # Monthly recurring expenses used by the cost simulator to project
    # recurring debts over the months-until-sale horizon.
    monthly_condo: float | None = None
    monthly_iptu: float | None = None
    annual_iptu: float | None = None
    expense_estimate: dict | None = None
