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
    l: Literal["good", "warn", "bad"]  # Liquidez
    o: Literal["good", "warn", "bad"]  # Ocupação


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
    """Detail data for the viability/financial feasibility tab.

    Jurídico dimension dropped — only Financeiro, Liquidez and Ocupação remain.
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


class LegalOnusItem(BaseModel):
    """Um ônus/gravame listado na matrícula ou no edital."""
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    tipo: str
    descricao: str
    gravidade: Literal["info", "warn", "bad"] = "info"


class LegalConclusao(BaseModel):
    """Recomendação acionável: participar, cautela ou não participar."""
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    recomendacao: Literal["sim", "cautela", "nao"]
    principal_risco: str
    providencia: str


class LegalProcesso(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    tipo: str = ""
    numero: str = ""
    foro: str = ""
    fase: str = ""
    link: str | None = None


class LegalPartes(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    credor: str = ""
    devedor: str = ""
    observacao: str = ""


class LegalDivida(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    valor: float | None = None
    data_atualizacao: str = ""
    memoria_calculo: str = ""
    impugnacao: str = ""


class LegalMatricula(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    numero: str = ""
    cartorio: str = ""
    proprietario: str = ""
    titularidade: str = ""
    onus: list[LegalOnusItem] = []


class LegalEditalAnalise(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    data_publicacao: str = ""
    antecedencia: str = ""
    valor_avaliacao: float | None = None
    lance_minimo: float | None = None
    debitos: str = ""
    desocupacao: str = ""
    divergencias: list[str] = []


class LegalAvaliacao(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    data: str = ""
    valor: float | None = None
    avaliador: str = ""
    vistoria: str = ""
    atualidade: str = ""
    impugnacao: str = ""


class LegalRisco(BaseModel):
    """Risco identificado, com estado de verificação anti-alucinação e fonte citada."""
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    tipo: str
    nivel: Literal["baixo", "medio", "alto"]
    verificacao: Literal["verificado", "nao-localizado", "requer-humano"]
    fonte: str  # trecho literal do documento ou justificativa da não-localização


class LegalVerificacao(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    item: str
    estado: Literal["verificado", "nao-localizado", "requer-humano"]
    fonte: str = ""
    nota: str = ""


class LegalDocumento(BaseModel):
    """Proveniência: documento usado (ou não disponível) na análise."""
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    tipo: str
    nome: str
    origem: str = ""
    url: str | None = None
    data: str | None = None
    status: Literal["baixado", "parcial", "nao-disponivel"] = "nao-disponivel"
    baseou: str = ""


class LegalDetail(BaseModel):
    """Análise jurídica ramificada por modalidade — shape consumido pela aba
    Jurídica do frontend (espelha frontend/src/data/legalDemo.js)."""
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    modalidade: Literal["judicial", "extrajudicial", "venda-direta"]
    modalidade_label: str
    base_legal: str = ""
    conclusao: LegalConclusao
    processo: LegalProcesso = LegalProcesso()
    partes: LegalPartes = LegalPartes()
    divida: LegalDivida = LegalDivida()
    matricula: LegalMatricula = LegalMatricula()
    edital_analise: LegalEditalAnalise = LegalEditalAnalise()
    avaliacao: LegalAvaliacao = LegalAvaliacao()
    riscos: list[LegalRisco] = []
    verificacoes: list[LegalVerificacao] = []
    documentos: list[LegalDocumento] = []


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
    occupancy: str
    risk: RiskFlags
    viability: ViabilityDetail | None = None
    market_detail: MarketDetail | None = None
    costs: list[CostLineItem] | None = None
    edital: EditalDetail | None = None
    # Análise jurídica completa (aba Jurídica). O frontend usa
    # property.legal ?? legalDemo[id] — quando presente, o demo é ignorado.
    legal: LegalDetail | None = None
    auction_url: str | None = None
    photo_url: str | None = None
    # Monthly recurring expenses used by the cost simulator to project
    # recurring debts over the months-until-sale horizon.
    monthly_condo: float | None = None
    monthly_iptu: float | None = None
    occupant_removal_cost: float | None = None
