# graph/output.py
"""Output node: build AuctionPropertyResult from workflow state and serialize to JSON."""

from __future__ import annotations

import hashlib
import re
from typing import Optional

from loguru import logger

from graph.contracts import (
    AuctionPropertyResult, RiskFlags, ScoringResult,
    RiskDimension, AlertItem, ViabilityDetail,
    MarketIndicator, ComparableSale, MarketDetail,
    CostLineItem, EditalDetail,
)
from graph.state import AuctionState, LegalResult, MarketResult, PropertyMetadata


def _generate_id(address: str, auction_price: float) -> str:
    raw = f"{address}{auction_price}"
    return hashlib.sha256(raw.encode()).hexdigest()[:12]


def _parse_brl(text: str) -> float:
    """Parse a BRL currency string from free-form LLM text into a float.

    Handles: 'R$ 271.851,12', 'R$ 271851.12.', 'R$ 1.200.000', etc.
    Strips trailing punctuation before conversion.
    """
    if not text:
        return 0.0
    match = re.search(r"r\$\s*([\d.,]+)", text, re.IGNORECASE)
    if not match:
        return 0.0
    raw = match.group(1).rstrip(".")  # remove trailing period from sentence
    # Heuristic: if there's a comma followed by exactly 2 digits, it's decimal
    if re.search(r",\d{2}$", raw):
        # Brazilian format: 1.200.000,50 -> remove dots, comma -> dot
        raw = raw.replace(".", "").replace(",", ".")
    else:
        # Already decimal-dot format or integer: 1200000 or 1200000.50
        raw = raw.replace(",", "")
    try:
        return float(raw)
    except ValueError:
        return 0.0


def _extract_street(address: str) -> str:
    if not address:
        return ""
    parts = address.split(",")
    street = parts[0].strip()
    street = re.sub(r"\s*n[ºo.]?\s*\d+$", "", street, flags=re.IGNORECASE).strip()
    street = re.sub(r"\s+\d+$", "", street).strip()
    return street


def _map_occupancy(occupation_status: str) -> str:
    if not occupation_status:
        return "ocupado"
    lower = occupation_status.lower()
    if "desocupado" in lower:
        return "desocupado"
    if any(w in lower for w in ("disputado", "posseiro", "invasor")):
        return "disputado"
    return "ocupado"


def _classify_auction_type(auction_type: str) -> str:
    if not auction_type:
        return "Extrajudicial"
    lower = auction_type.lower()
    if "judicial" in lower and "extrajudicial" not in lower:
        return "Judicial"
    return "Extrajudicial"


def _extract_praca(auction_type: str) -> str | None:
    if not auction_type:
        return None
    lower = auction_type.lower()
    if "1" in lower and "praça" in lower:
        return "1ª praça"
    if "2" in lower and "praça" in lower:
        return "2ª praça"
    if "praça" in lower:
        return auction_type.strip()
    return None


def _extract_modalidade(auction_type: str) -> str | None:
    if not auction_type:
        return None
    lower = auction_type.lower()
    if "venda direta" in lower:
        return "Venda direta"
    if "licitação" in lower or "licitacao" in lower:
        return "Licitação aberta"
    return "Licitação aberta"


def _determine_court(auction_type: str, court_name: str, court_or_leiloeiro: str) -> str:
    if not auction_type:
        return "—"
    lower = auction_type.lower()
    if "judicial" in lower and "extrajudicial" not in lower:
        return court_name or court_or_leiloeiro or "—"
    return "—"


def _determine_auctioneer(auctioneer_name: str, court_or_leiloeiro: str) -> str:
    name = auctioneer_name or court_or_leiloeiro or "—"
    # Truncate to first line / first sentence if the LLM returned a paragraph
    name = name.split("\n")[0].split(". ")[0].strip()
    if len(name) > 80:
        name = name[:80].rsplit(" ", 1)[0] + "…"
    return name


def _parse_auction_date(auction_date: str) -> str:
    if not auction_date:
        return ""
    match = re.match(r"(\d{2})/(\d{2})/(\d{4})", auction_date)
    if match:
        return f"{match.group(3)}-{match.group(2)}-{match.group(1)}T00:00:00"
    if re.match(r"\d{4}-\d{2}-\d{2}", auction_date):
        if "T" in auction_date:
            return auction_date
        return f"{auction_date}T00:00:00"
    return auction_date


def _derive_risk_pct(state: str, base_offset: float = 0) -> int:
    """Derive an approximate 0-100 risk pct from good/warn/bad + offset."""
    base = {"good": 85, "warn": 60, "bad": 30}
    return max(0, min(100, int(base.get(state, 50) + base_offset)))


def _build_viability(state: AuctionState) -> ViabilityDetail | None:
    metadata = state.property_metadata
    legal = state.legal_result
    scoring = state.scoring_result
    if not metadata:
        return None

    risk = scoring.risk if scoring else RiskFlags(j="bad", f="bad", l="bad", o="bad")

    risk_dimensions = [
        RiskDimension(
            dim="Jurídico",
            pct=_derive_risk_pct(risk.j, 7),
            state=risk.j,
            note="Sem ônus, sem processos correlatos" if risk.j == "good"
            else "Riscos jurídicos identificados" if risk.j == "warn"
            else "Riscos jurídicos significativos",
        ),
        RiskDimension(
            dim="Financeiro",
            pct=_derive_risk_pct(risk.f, -7),
            state=risk.f,
            note="Dívida conhecida: IPTU + condomínio" if risk.f != "good"
            else "Sem débitos significativos identificados",
        ),
        RiskDimension(
            dim="Liquidez",
            pct=_derive_risk_pct(risk.l, -8),
            state=risk.l,
            note="Média de 84 dias para vender no bairro" if risk.l == "warn"
            else "Alta liquidez no bairro" if risk.l == "good"
            else "Baixa liquidez — mais de 120 dias para venda",
        ),
        RiskDimension(
            dim="Ocupação",
            pct=_derive_risk_pct(risk.o, 10),
            state=risk.o,
            note="Imóvel desocupado" if risk.o == "good"
            else "Imóvel ocupado — verificar necessidade de imissão na posse" if risk.o == "warn"
            else "Imóvel disputado — risco de conflito possessório",
        ),
    ]

    alerts = []
    if legal:
        if legal.tax_debts_iptu and legal.tax_debts_iptu.lower().strip() not in ("", "n/a", "inexistente", "não consta", "nao consta", "sem débito", "sem debito"):
            alerts.append(AlertItem(level="warn", title="IPTU em atraso", text=legal.tax_debts_iptu))
        if legal.condominium_debts and legal.condominium_debts.lower().strip() not in ("", "n/a", "inexistente", "não consta", "nao consta", "sem débito", "sem debito"):
            alerts.append(AlertItem(level="warn", title="Condomínio em atraso", text=legal.condominium_debts))
        occ = legal.occupation_status.lower() if legal.occupation_status else ""
        if "desocupado" in occ:
            alerts.append(AlertItem(level="good", title="Imóvel desocupado", text="Sem inquilinos, disponível para posse imediata."))
        elif any(w in occ for w in ("disputado", "posseiro", "invasor")):
            alerts.append(AlertItem(level="bad", title="Imóvel disputado", text="Risco de conflito possessório — consulte advogado."))

    description = ""
    if metadata.property_type:
        parts = [f"{metadata.property_type} de {metadata.area_m2 or 0:.0f} m²"]
        if metadata.address:
            parts.append(f"localizado na {metadata.address}")
        if metadata.neighborhood:
            parts.append(f"no bairro {metadata.neighborhood}")
        description = ", ".join(parts) + "."

    features = {}
    if metadata.area_m2 is not None and metadata.area_m2 > 0:
        features["Área"] = f"{metadata.area_m2:.0f} m²"
    if metadata.beds is not None:
        features["Dormitórios"] = str(metadata.beds)
    if metadata.baths is not None:
        features["Banheiros"] = str(metadata.baths)
    if metadata.parking is not None:
        features["Vagas"] = str(metadata.parking)
    if metadata.floor:
        features["Andar"] = metadata.floor
    if metadata.city:
        features["Cidade"] = metadata.city
    if metadata.neighborhood:
        features["Bairro"] = metadata.neighborhood
    if metadata.auction_type:
        features["Tipo de leilão"] = metadata.auction_type
    if metadata.property_type:
        features["Tipo de imóvel"] = metadata.property_type

    return ViabilityDetail(
        risk_dimensions=risk_dimensions,
        alerts=alerts,
        description=description,
        features=features,
    )


def _build_market_detail(state: AuctionState) -> MarketDetail | None:
    metadata = state.property_metadata
    market = state.market_result
    if not metadata or not market:
        return None

    indicators = []
    if market.price_per_m2_neighborhood:
        indicators.append(MarketIndicator(
            lbl="Preço/m² · bairro",
            val=f"R$ {market.price_per_m2_neighborhood:,.0f}".replace(",", "."),
            delta=f"+{market.area_appreciation_1y:.1f}% ao ano" if market.area_appreciation_1y else "",
            pos=True,
        ))
    price_per_m2_property = (metadata.auction_price or 0) / metadata.area_m2 if metadata.area_m2 and metadata.area_m2 > 0 else 0
    if price_per_m2_property:
        indicators.append(MarketIndicator(
            lbl="Preço/m² · imóvel",
            val=f"R$ {price_per_m2_property:,.0f}".replace(",", "."),
            delta="abaixo da média" if market.price_per_m2_neighborhood and price_per_m2_property < market.price_per_m2_neighborhood else "acima da média",
            pos=market.price_per_m2_neighborhood is not None and price_per_m2_property < market.price_per_m2_neighborhood,
        ))
    if market.liquidity_days:
        city_name = metadata.city or "região"
        indicators.append(MarketIndicator(
            lbl="Dias médios p/ venda",
            val=f"{market.liquidity_days} dias",
            delta=f"bairro {metadata.neighborhood}" if metadata.neighborhood else city_name,
            pos=(market.liquidity_days or 0) < 90,
        ))
    if market.market_score:
        indicators.append(MarketIndicator(
            lbl="Liquidez · score",
            val=f"{market.market_score} / 10",
            delta="",
        ))

    comparables = []
    for cp in (market.comparable_properties or []):
        comparables.append(ComparableSale(
            address=cp.address,
            area_m2=cp.area_m2,
            beds=None,
            price_per_m2=cp.price_per_m2,
            sale_price=cp.price,
            source=cp.source,
            url=cp.url,
        ))

    trend = []
    if market.area_appreciation_1y and market.price_per_m2_neighborhood:
        base = market.price_per_m2_neighborhood / (1 + market.area_appreciation_1y / 100)
        for i in range(36):
            factor = 1 + (market.area_appreciation_1y / 100) * (i / 36)
            trend.append(round(base * factor))

    return MarketDetail(
        indicators=indicators,
        trend=trend,
        trend_start_label="",
        trend_end_label="",
        comparables=comparables,
    )


def _build_costs(state: AuctionState) -> list[CostLineItem] | None:
    metadata = state.property_metadata
    if not metadata:
        return None

    legal = state.legal_result
    market = state.market_result
    min_bid = metadata.auction_price or 0
    reform = market.reform_estimate if market and market.reform_estimate is not None else 0

    costs = [
        CostLineItem(label="Lance de arremate", value=min_bid, hint="Valor declarado como mínimo no edital.", kind="price"),
    ]

    itbi = round(min_bid * 0.03)
    city = metadata.city or ""
    costs.append(CostLineItem(
        label=f"ITBI · {city} (3%)",
        value=itbi,
        hint="Imposto de transmissão devido ao município.",
        kind="tax",
    ))

    commission = round(min_bid * 0.05)
    costs.append(CostLineItem(
        label="Comissão do leiloeiro (5%)",
        value=commission,
        hint="Sobre o valor do arremate, devida no ato.",
        kind="fee",
    ))

    court_fees = round(min_bid * 0.015)
    costs.append(CostLineItem(
        label="Custas judiciais",
        value=court_fees,
        hint="Taxa cartorária, edital, oficial de justiça.",
        kind="fee",
    ))

    cartorio = round(min_bid * 0.02)
    costs.append(CostLineItem(
        label="Registro em cartório",
        value=cartorio,
        hint="Inclui escritura e averbações na matrícula.",
        kind="fee",
    ))

    iptu_debt = 0
    if legal and legal.tax_debts_iptu:
        iptu_debt = _parse_brl(legal.tax_debts_iptu)
    costs.append(CostLineItem(
        label="IPTU em atraso assumido",
        value=iptu_debt,
        hint="IPTU vencido até a data do arremate." if iptu_debt else "IPTU em dia.",
        kind="debt",
    ))

    condo_debt = 0
    if legal and legal.condominium_debts:
        condo_debt = _parse_brl(legal.condominium_debts)
    costs.append(CostLineItem(
        label="Condomínio em atraso",
        value=condo_debt,
        hint="Débito condominial cobrado pelo síndico." if condo_debt else "Sem débito condominial.",
        kind="debt",
    ))

    costs.append(CostLineItem(
        label="Reforma estimada",
        value=reform,
        hint="Estimativa de reforma necessária." if reform else "Sem estimativa de reforma.",
        kind="reno",
    ))

    costs.append(CostLineItem(
        label="Imposto sobre ganho de capital",
        value=0,
        hint="Isento · primeiro imóvel · até R$ 35k.",
        kind="tax",
    ))

    return costs


def _build_edital(state: AuctionState) -> EditalDetail | None:
    metadata = state.property_metadata
    if not metadata:
        return None

    legal = state.legal_result
    liens = []
    if legal:
        if legal.liens:
            liens.extend(legal.liens)
        if legal.tax_debts_iptu and legal.tax_debts_iptu.lower().strip() not in ("", "n/a", "inexistente", "não consta", "nao consta", "sem débito", "sem debito"):
            liens.append(f"IPTU em aberto: {legal.tax_debts_iptu}")
        if legal.condominium_debts and legal.condominium_debts.lower().strip() not in ("", "n/a", "inexistente", "não consta", "nao consta", "sem débito", "sem debito"):
            liens.append(f"Dívida condominial: {legal.condominium_debts}")

    property_description = ""
    if metadata.property_type and metadata.area_m2:
        property_description = f"{metadata.property_type} com {metadata.area_m2 or 0:.0f} m²"
        if metadata.address:
            property_description += f", situado na {metadata.address}"

    second_bid_price = metadata.auction_price_2nd or 0

    return EditalDetail(
        process=metadata.process_number or "",
        creditor=metadata.creditor or "",
        debtor=metadata.debtor or "",
        modality="Eletrônico" if "eletrôni" in state.pdf_texts.lower() else "Presencial",
        first_bid_date=metadata.auction_date or "",
        first_bid_price=metadata.auction_price or 0,
        second_bid_date=metadata.auction_date_2nd or "",
        second_bid_price=second_bid_price,
        property_description=property_description,
        liens=liens,
        payment_terms="À vista no prazo de 24h via depósito judicial.",
        summary_note="Texto resumido pela IA Arremate.",
    )


def build_result(state: AuctionState) -> AuctionPropertyResult:
    metadata = state.property_metadata
    market_result = state.market_result
    legal_result = state.legal_result
    scoring_result = state.scoring_result

    if not metadata:
        return AuctionPropertyResult(
            id="unknown", score=0, photo_label="", title="Propriedade desconhecida",
            address="", type="", neighborhood="", city="", auction_type="",
            auctioneer="—", court="—", discount=0.0, min_bid=0.0, market=0.0,
            roi=0.0, area=0.0, ends_at="", occupancy="ocupado",
            risk=RiskFlags(j="bad", f="bad", l="bad", o="bad"),
            viability=None,
            market_detail=None,
            costs=None,
            edital=None,
            auction_url=None,
        )

    prop_type = metadata.property_type or ""
    neighborhood = metadata.neighborhood or ""
    state_abbrev = metadata.state or ""

    market_value = metadata.market_value_estimate
    # If the LLM set market_value_estimate to the auction price, it likely
    # confused the two — treat as missing and use market research instead
    if market_value and metadata.auction_price and abs(market_value - metadata.auction_price) < 1:
        market_value = None
    if not market_value and market_result:
        market_value = (market_result.price_per_m2_neighborhood or 0.0) * (metadata.area_m2 or 0.0)
    if not market_value:
        market_value = 0.0

    score = scoring_result.score if scoring_result else 0
    risk = scoring_result.risk if scoring_result else RiskFlags(j="bad", f="bad", l="bad", o="bad")
    roi = scoring_result.roi if scoring_result else 0.0

    occupation_status = legal_result.occupation_status if legal_result else ""
    occupancy = _map_occupancy(occupation_status)

    discount = market_result.discount_percentage if market_result else 0.0

    return AuctionPropertyResult(
        id=_generate_id(metadata.address, metadata.auction_price or 0),
        score=score,
        photo_label=f"{prop_type.upper()} · {neighborhood.upper()} · {state_abbrev}" if prop_type else "",
        title=f"{prop_type} {metadata.area_m2 or 0:.0f} m², {_extract_street(metadata.address)}" if prop_type else metadata.address,
        address=metadata.address,
        type=prop_type,
        neighborhood=neighborhood,
        city=f"{metadata.city}, {state_abbrev}" if metadata.city else "",
        auction_type=_classify_auction_type(metadata.auction_type),
        praca=_extract_praca(metadata.auction_type),
        modalidade=_extract_modalidade(metadata.auction_type),
        auctioneer=_determine_auctioneer(metadata.auctioneer_name, metadata.court_or_leiloeiro),
        court=_determine_court(metadata.auction_type, metadata.court_name, metadata.court_or_leiloeiro),
        discount=discount,
        min_bid=metadata.auction_price or 0,
        market=market_value,
        roi=roi,
        area=metadata.area_m2 or 0,
        beds=metadata.beds,
        baths=metadata.baths,
        parking=metadata.parking,
        floor=metadata.floor,
        ends_at=_parse_auction_date(metadata.auction_date),
        occupancy=occupancy,
        risk=risk,
        viability=_build_viability(state),
        market_detail=_build_market_detail(state),
        costs=_build_costs(state),
        edital=_build_edital(state),
        auction_url=state.auction_url or None,
    )


def output_node(state: AuctionState) -> dict:
    logger.info("Output node: building AuctionPropertyResult")
    result = build_result(state)
    result_json = result.model_dump_json(by_alias=True)
    logger.info(f"Output node: result JSON produced ({len(result_json)} chars)")
    return {"result_json": result_json}
