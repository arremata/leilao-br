from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from graph.contracts import ScoringResult


@dataclass
class PropertyMetadata:
    address: str = ""
    property_type: str = ""
    area_m2: float = 0.0
    auction_price: float = 0.0
    auction_price_1st: float = 0.0
    auction_price_2nd: float = 0.0
    market_value_estimate: Optional[float] = None
    auction_date: str = ""
    auction_date_2nd: str = ""
    auction_type: str = ""
    matricula: str = ""
    edital_url: str = ""
    matricula_url: str = ""
    edital_data: dict | None = None
    process_number: str = ""
    court_or_leiloeiro: str = ""
    auctioneer_name: str = ""
    court_name: str = ""
    city: str = ""
    neighborhood: str = ""
    state: str = ""
    lat: float | None = None
    lng: float | None = None
    beds: int | None = None
    baths: int | None = None
    parking: int | None = None
    floor: str | None = None
    creditor: str = ""
    debtor: str = ""
    photo_url: str = ""
    itbi_rate: Optional[float] = None
    itbi_source: str = ""
    commission_rate: Optional[float] = None


@dataclass
class ComparableProperty:
    address: str = ""
    property_type: str = ""
    price: float = 0.0
    area_m2: float = 0.0
    beds: int | None = None
    price_per_m2: float = 0.0
    source: str = ""
    url: str = ""
    lat: float | None = None
    lng: float | None = None
    distance_km: float | None = None


@dataclass
class MarketResult:
    price_per_m2_neighborhood: float = 0.0
    comparable_properties: list[ComparableProperty] = field(default_factory=list)
    discount_percentage: float = 0.0
    confidence_level: str = "low"


@dataclass
class LegalResult:
    registration_status: str = ""
    liens: list[str] = field(default_factory=list)
    judicial_disputes: list[str] = field(default_factory=list)
    tax_debts_iptu: str = ""
    tax_debts_itbi: str = ""
    condominium_debts: str = ""
    federal_state_debts: str = ""
    zoning_compliance: str = ""
    construction_permits: str = ""
    occupation_status: str = ""
    usufruct_rights: str = ""
    risk_level: str = ""  # low, medium, high, critical
    risk_details: str = ""
    raw_findings: str = ""


@dataclass
class AuctionState:
    pdf_texts: str = ""
    pdf_sources: list[str] = field(default_factory=list)
    property_metadata: Optional[PropertyMetadata] = None
    research_plan: str = ""
    market_result: Optional[MarketResult] = None
    legal_result: Optional[LegalResult] = None
    scoring_result: Optional[ScoringResult] = None
    result_json: str = ""
    errors: list[str] = field(default_factory=list)
    auction_url: str = ""
    downloaded_pdfs: list[str] = field(default_factory=list)
    page_source_type: str = ""
