# Extended Data Model + Backend Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `AuctionPropertyResult` with nested detail objects for viability, market, costs, and edital; add a backend seed file; update the frontend to read from these objects instead of hardcoded data.

**Architecture:** Add 7 new Pydantic models to `contracts.py`, populate them in `output.py` from existing workflow state, create a `seed.json` with 3 fully-populated properties, load it via `api.py` on startup, and update frontend components to read from the property object.

**Tech Stack:** Python / Pydantic / FastAPI (backend), React / JSX (frontend)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `backend/graph/contracts.py` | All Pydantic models for the API contract |
| `backend/graph/output.py` | Build `AuctionPropertyResult` from workflow state |
| `backend/api.py` | FastAPI app, seed loading on startup |
| `backend/data/seed.json` | 3 fully-populated seed properties |
| `backend/tests/test_output.py` | Tests for `build_result()` including new detail fields |
| `frontend/src/components/shared.jsx` | Fixtures with extended data |
| `frontend/src/components/PropertyDetail.jsx` | Tab components reading from `p.*` |

---

### Task 1: Add new Pydantic models to contracts.py

**Files:**
- Modify: `backend/graph/contracts.py`

- [ ] **Step 1: Add the 7 new models and 4 new fields to AuctionPropertyResult**

Add the following to `backend/graph/contracts.py` after the existing `ScoringResult` class:

```python
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
    days_listed: int
    sale_date: str  # "fev/2026"


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
```

Then add 4 new optional fields to `AuctionPropertyResult`:

```python
    viability: ViabilityDetail | None = None
    market_detail: MarketDetail | None = None
    costs: list[CostLineItem] | None = None
    edital: EditalDetail | None = None
```

- [ ] **Step 2: Verify models import and serialize correctly**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao/backend && python -c "from graph.contracts import AuctionPropertyResult, ViabilityDetail, MarketDetail, CostLineItem, EditalDetail; print('OK')"`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/graph/contracts.py
git commit -m "feat: add detail models to AuctionPropertyResult contract"
```

---

### Task 2: Update output.py to populate detail objects

**Files:**
- Modify: `backend/graph/output.py`
- Modify: `backend/tests/test_output.py`

- [ ] **Step 1: Write failing tests for the new detail fields**

Add to `backend/tests/test_output.py`:

```python
from graph.contracts import ViabilityDetail, MarketDetail, CostLineItem, EditalDetail


class TestBuildResultDetails:
    def test_viability_populated_from_state(self):
        state = _make_full_state()
        result = build_result(state)
        assert result.viability is not None
        assert len(result.viability.risk_dimensions) == 4
        assert result.viability.risk_dimensions[0].dim == "Jurídico"
        assert result.viability.risk_dimensions[0].state == "good"
        assert len(result.viability.alerts) > 0
        assert result.viability.description != ""

    def test_market_detail_populated_from_state(self):
        state = _make_full_state()
        result = build_result(state)
        assert result.market_detail is not None
        assert len(result.market_detail.indicators) > 0
        assert result.market_detail.trend_start_label != ""
        assert len(result.market_detail.comparables) >= 0

    def test_costs_populated_from_state(self):
        state = _make_full_state()
        result = build_result(state)
        assert result.costs is not None
        assert len(result.costs) > 0
        assert result.costs[0].kind in ("price", "tax", "fee", "debt", "reno")

    def test_edital_populated_from_state(self):
        state = _make_full_state()
        result = build_result(state)
        assert result.edital is not None
        assert result.edital.process != ""

    def test_details_none_when_no_metadata(self):
        state = AuctionState()
        result = build_result(state)
        assert result.viability is None
        assert result.market_detail is None
        assert result.costs is None
        assert result.edital is None

    def test_details_serialized_to_camel_case_json(self):
        state = _make_full_state()
        result = output_node(state)
        parsed = json.loads(result["result_json"])
        assert "viability" in parsed
        assert "marketDetail" in parsed
        assert "costs" in parsed
        assert "edital" in parsed
        assert "riskDimensions" in parsed["viability"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao/backend && python -m pytest tests/test_output.py::TestBuildResultDetails -v`

Expected: FAIL — `result.viability is None` etc.

- [ ] **Step 3: Implement detail population in output.py**

Add these imports to `backend/graph/output.py`:

```python
from graph.contracts import (
    AuctionPropertyResult, RiskFlags, ScoringResult,
    RiskDimension, AlertItem, ViabilityDetail,
    MarketIndicator, ComparableSale, MarketDetail,
    CostLineItem, EditalDetail,
)
```

Add these helper functions before `build_result()`:

```python
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
        parts = [f"{metadata.property_type} de {metadata.area_m2:.0f} m²"]
        if metadata.address:
            parts.append(f"localizado na {metadata.address}")
        if metadata.neighborhood:
            parts.append(f"no bairro {metadata.neighborhood}")
        description = ", ".join(parts) + "."

    features = {}
    if metadata.area_m2:
        features["Área"] = f"{metadata.area_m2:.0f} m²"
    if metadata.city:
        features["Cidade"] = metadata.city
    if metadata.auction_type:
        features["Tipo de leilão"] = metadata.auction_type

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
            delta=f"+{market.area_appreciation_1y:.1f}% YoY" if market.area_appreciation_1y else "",
            pos=True,
        ))
    price_per_m2_property = metadata.auction_price / metadata.area_m2 if metadata.area_m2 > 0 else 0
    if price_per_m2_property:
        indicators.append(MarketIndicator(
            lbl="Preço/m² · imóvel",
            val=f"R$ {price_per_m2_property:,.0f}".replace(",", "."),
            delta="abaixo da média" if price_per_m2_property < market.price_per_m2_neighborhood else "acima da média",
            pos=price_per_m2_property < market.price_per_m2_neighborhood,
        ))
    if market.liquidity_days:
        indicators.append(MarketIndicator(
            lbl="Dias médios p/ venda",
            val=f"{market.liquidity_days} dias",
            delta=f"vs. SP 102",
            pos=market.liquidity_days < 90,
        ))
    if market.price_per_m2_neighborhood and metadata.area_m2:
        annual_yield = (market.price_per_m2_neighborhood * 12 * 0.005) / market.price_per_m2_neighborhood * 100
        indicators.append(MarketIndicator(
            lbl="Yield aluguel",
            val=f"{annual_yield:.1f}% a.a.",
            delta="vs. SP 0,52%",
        ))
    if market.market_score:
        indicators.append(MarketIndicator(
            lbl="Liquidez · score",
            val=f"{market.market_score} / 10",
            delta="estável 12m",
        ))

    comparables = []
    for cp in (market.comparable_properties or []):
        comparables.append(ComparableSale(
            address=cp.address,
            area_m2=cp.area_m2,
            beds=None,
            price_per_m2=cp.price_per_m2,
            sale_price=cp.price,
            days_listed=0,
            sale_date=cp.source,
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
    min_bid = metadata.auction_price
    reform = market.reform_estimate if market else 0

    costs = [
        CostLineItem(label="Lance de arremate", value=min_bid, hint="Valor declarado como mínimo no edital.", kind="price"),
    ]

    # ITBI — ~3% of bid
    itbi = round(min_bid * 0.03)
    city = metadata.city or ""
    costs.append(CostLineItem(
        label=f"ITBI · {city} (3%)",
        value=itbi,
        hint="Imposto de transmissão devido ao município.",
        kind="tax",
    ))

    # Leiloeiro commission — ~5%
    commission = round(min_bid * 0.05)
    costs.append(CostLineItem(
        label="Comissão do leiloeiro (5%)",
        value=commission,
        hint="Sobre o valor do arremate, devida no ato.",
        kind="fee",
    ))

    # Court fees
    court_fees = round(min_bid * 0.015)
    costs.append(CostLineItem(
        label="Custas judiciais",
        value=court_fees,
        hint="Taxa cartorária, edital, oficial de justiça.",
        kind="fee",
    ))

    # Cartório registration
    cartorio = round(min_bid * 0.02)
    costs.append(CostLineItem(
        label="Registro em cartório",
        value=cartorio,
        hint="Inclui escritura e averbações na matrícula.",
        kind="fee",
    ))

    # IPTU debt
    iptu_debt = 0
    if legal and legal.tax_debts_iptu:
        import re as _re
        match = _re.search(r"r\$\s*([\d.,]+)", legal.tax_debts_iptu, _re.IGNORECASE)
        if match:
            iptu_debt = float(match.group(1).replace(".", "").replace(",", "."))
    costs.append(CostLineItem(
        label="IPTU em atraso assumido",
        value=iptu_debt,
        hint="IPTU vencido até a data do arremate." if iptu_debt else "IPTU em dia.",
        kind="debt",
    ))

    # Condo debt
    condo_debt = 0
    if legal and legal.condominium_debts:
        import re as _re
        match = _re.search(r"r\$\s*([\d.,]+)", legal.condominium_debts, _re.IGNORECASE)
        if match:
            condo_debt = float(match.group(1).replace(".", "").replace(",", "."))
    costs.append(CostLineItem(
        label="Condomínio em atraso",
        value=condo_debt,
        hint="Débito condominial cobrado pelo síndico." if condo_debt else "Sem débito condominial.",
        kind="debt",
    ))

    # Reform
    costs.append(CostLineItem(
        label="Reforma estimada",
        value=reform,
        hint="Estimativa de reforma necessária." if reform else "Sem estimativa de reforma.",
        kind="reno",
    ))

    # Capital gains tax — 0 for now (exempt scenarios)
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
        property_description = f"{metadata.property_type} com {metadata.area_m2:.0f} m²"
        if metadata.address:
            property_description += f", situado na {metadata.address}"

    return EditalDetail(
        process=metadata.matricula or "",
        creditor="",
        debtor="",
        modality="Eletrônico" if "eletrôni" in state.pdf_texts.lower() else "Presencial",
        first_bid_date=metadata.auction_date,
        first_bid_price=metadata.auction_price,
        second_bid_date="",
        second_bid_price=round(metadata.auction_price * 0.87) if metadata.auction_price else 0,
        property_description=property_description,
        liens=liens,
        payment_terms="À vista no prazo de 24h via depósito judicial.",
        summary_note="Texto resumido pela IA Arremate.",
    )
```

Then update `build_result()` — add the 4 detail fields to the `AuctionPropertyResult(...)` constructor call:

```python
    viability=_build_viability(state),
    market_detail=_build_market_detail(state),
    costs=_build_costs(state),
    edital=_build_edital(state),
```

Also add these same 4 fields as `None` to the "no metadata" fallback `AuctionPropertyResult` (the one returned when `not metadata`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao/backend && python -m pytest tests/test_output.py -v`

Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add backend/graph/output.py backend/tests/test_output.py
git commit -m "feat: populate viability, market, costs, edital details in output node"
```

---

### Task 3: Create seed.json with 3 fully-populated properties

**Files:**
- Create: `backend/data/seed.json`

- [ ] **Step 1: Create seed.json with p1, p3, p5 including full detail data**

Create `backend/data/seed.json` with 3 properties. Each property includes all existing fields plus `viability`, `marketDetail`, `costs`, and `edital`. The detail data matches what is currently hardcoded in `PropertyDetail.jsx`.

```json
[
  {
    "id": "p1",
    "score": 87,
    "photoLabel": "APTO · VILA MADALENA · SP",
    "title": "Apto. 78 m², Rua Harmonia",
    "address": "R. Harmonia, 412 · ap. 71",
    "type": "Apartamento",
    "neighborhood": "Vila Madalena",
    "city": "São Paulo, SP",
    "auctionType": "1ª praça",
    "auctioneer": "Zukerman Leilões",
    "court": "7ª Vara Cível SP",
    "discount": 42,
    "minBid": 312000,
    "market": 540000,
    "roi": 38,
    "area": 78,
    "beds": 2,
    "baths": 2,
    "parking": 1,
    "floor": "7º",
    "endsAt": "2026-05-17T14:30:00",
    "occupancy": "desocupado",
    "risk": { "j": "good", "f": "good", "l": "warn", "o": "good" },
    "viability": {
      "riskDimensions": [
        { "dim": "Jurídico", "pct": 92, "state": "good", "note": "Sem ônus, sem processos correlatos" },
        { "dim": "Financeiro", "pct": 78, "state": "good", "note": "Dívida conhecida: R$ 4.200 IPTU + R$ 18.400 condomínio" },
        { "dim": "Liquidez", "pct": 62, "state": "warn", "note": "Média de 84 dias para vender no bairro" },
        { "dim": "Ocupação", "pct": 95, "state": "good", "note": "Imóvel desocupado há 11 meses · vistoria registrada" }
      ],
      "alerts": [
        { "level": "warn", "title": "Divergência de área", "text": "Edital declara 78 m², matrícula consta 76,4 m²." },
        { "level": "warn", "title": "Condomínio em atraso", "text": "R$ 18.400 de dívida condominial — assumir no arremate." },
        { "level": "good", "title": "Imóvel desocupado", "text": "Sem inquilinos há 11 meses, vistoria registrada." },
        { "level": "good", "title": "IPTU em dia até Q1", "text": "Apenas R$ 4.200 do trimestre atual pendentes." }
      ],
      "description": "Apartamento de 78 m² no 7º andar do Edifício Harmonia, frente leste, em rua arborizada da Vila Madalena. Dois dormitórios sendo uma suíte, sala ampla integrada à varanda, cozinha planejada e área de serviço separada. Prédio com elevador, portaria 24h e uma vaga de garagem coberta.",
      "features": {
        "Ano de construção": "2003 (22 anos)",
        "Conservação": "Bom estado",
        "Posição solar": "Leste · sol da manhã",
        "Vista": "Rua arborizada",
        "Andar": "7º de 12 andares",
        "Mobiliado": "Não",
        "IPTU mensal": "R$ 380",
        "Condomínio": "R$ 1.240"
      }
    },
    "marketDetail": {
      "indicators": [
        { "lbl": "Preço/m² · bairro", "val": "R$ 11.420", "delta": "+4,2% YoY", "pos": true },
        { "lbl": "Preço/m² · imóvel", "val": "R$ 6.923", "delta": "abaixo da média", "pos": true },
        { "lbl": "Dias médios p/ venda", "val": "84 dias", "delta": "vs. SP 102", "pos": true },
        { "lbl": "Yield aluguel", "val": "0,58 %/mês", "delta": "vs. SP 0,52%", "pos": true },
        { "lbl": "Cap rate projetado", "val": "6,9% a.a.", "delta": "vs. Selic 10,5%", "neg": true },
        { "lbl": "Liquidez · score", "val": "62 / 100", "delta": "estável 12m" }
      ],
      "trend": [9200, 9180, 9320, 9410, 9380, 9500, 9620, 9580, 9700, 9850, 9920, 10010, 10180, 10240, 10120, 10350, 10480, 10560, 10620, 10680, 10780, 10820, 10960, 11020, 11100, 11050, 11150, 11240, 11200, 11280, 11320, 11380, 11410, 11420, 11380, 11420],
      "trendStartLabel": "mai/2023",
      "trendEndLabel": "mai/2026",
      "comparables": [
        { "address": "R. Harmonia, 320", "areaM2": 82, "beds": 2, "pricePerM2": 11200, "salePrice": 918000, "daysListed": 67, "saleDate": "fev/2026" },
        { "address": "R. Aspicuelta, 511", "areaM2": 75, "beds": 2, "pricePerM2": 11680, "salePrice": 876000, "daysListed": 92, "saleDate": "jan/2026" },
        { "address": "R. Fradique Coutinho, 1240", "areaM2": 95, "beds": 3, "pricePerM2": 11050, "salePrice": 1050000, "daysListed": 51, "saleDate": "dez/2025" },
        { "address": "R. Mourato Coelho, 880", "areaM2": 68, "beds": 2, "pricePerM2": 11400, "salePrice": 775000, "daysListed": 78, "saleDate": "dez/2025" },
        { "address": "R. Wisard, 422", "areaM2": 88, "beds": 3, "pricePerM2": 11820, "salePrice": 1040000, "daysListed": 84, "saleDate": "nov/2025" }
      ]
    },
    "costs": [
      { "label": "Lance de arremate", "value": 312000, "hint": "Valor declarado como mínimo no edital.", "kind": "price" },
      { "label": "ITBI · São Paulo (3%)", "value": 9360, "hint": "Imposto de transmissão devido ao município.", "kind": "tax" },
      { "label": "Comissão do leiloeiro (5%)", "value": 15600, "hint": "Sobre o valor do arremate, devida no ato.", "kind": "fee" },
      { "label": "Custas judiciais", "value": 4800, "hint": "Taxa cartorária, edital, oficial de justiça.", "kind": "fee" },
      { "label": "Registro em cartório", "value": 6240, "hint": "Inclui escritura e averbações na matrícula.", "kind": "fee" },
      { "label": "IPTU em atraso assumido", "value": 4200, "hint": "IPTU vencido até a data do arremate.", "kind": "debt" },
      { "label": "Condomínio em atraso", "value": 18400, "hint": "Débito condominial cobrado pelo síndico.", "kind": "debt" },
      { "label": "Ação de imissão na posse", "value": 0, "hint": "Não aplicável — imóvel desocupado.", "kind": "fee" },
      { "label": "Reforma estimada", "value": 36000, "hint": "Cozinha, banheiros, pintura, piso laminado.", "kind": "reno" },
      { "label": "Imposto sobre ganho de capital", "value": 0, "hint": "Isento · primeiro imóvel · até R$ 35k.", "kind": "tax" }
    ],
    "edital": {
      "process": "1024778-32.2024.8.26.0100",
      "creditor": "Banco Santander S.A.",
      "debtor": "Construtora Vila Madalena Ltda.",
      "modality": "Eletrônico · plataforma Zukerman",
      "firstBidDate": "15/05/2026 às 14h30",
      "firstBidPrice": 312000,
      "secondBidDate": "29/05/2026 às 14h30",
      "secondBidPrice": 270000,
      "propertyDescription": "Apartamento nº 71 do 7º pavimento do Edifício Harmonia, situado na Rua Harmonia, nº 412, Vila Madalena, com área privativa de 78,00 m², compreendendo dois dormitórios sendo um suíte, sala de estar e jantar, cozinha, área de serviço, dois banheiros e uma vaga de garagem (vaga 24). Matriculado sob nº 87.412 no 14º Cartório de Registro de Imóveis da Capital.",
      "liens": [
        "Hipoteca de 1º grau em favor de Banco Santander S.A. — extinta com a arrematação (art. 1.501 CC).",
        "IPTU em aberto: R$ 4.200,00 referente ao 1º trimestre de 2026.",
        "Dívida condominial: R$ 18.400,00 conforme certidão do síndico anexa aos autos (fls. 412).",
        "Não há registro de penhoras adicionais sobre o imóvel."
      ],
      "paymentTerms": "À vista no prazo de 24h via depósito judicial, ou parcelado em até 30 vezes mediante caução de 25% e atualização pela tabela do TJSP, com correção mensal pelo IPCA + 1% a.m. (art. 895 CPC).",
      "summaryNote": "Texto resumido pela IA Arremate. O documento original contém 14 páginas e está disponível no link \"PDF original\" acima."
    }
  },
  {
    "id": "p3",
    "score": 91,
    "photoLabel": "COMERCIAL · ITAIM BIBI · SP",
    "title": "Sala 64 m², Faria Lima",
    "address": "Av. Brig. Faria Lima, 1845 · cj. 412",
    "type": "Comercial",
    "neighborhood": "Itaim Bibi",
    "city": "São Paulo, SP",
    "auctionType": "Extrajudicial",
    "auctioneer": "Mega Leilões",
    "court": "—",
    "discount": 38,
    "minBid": 680000,
    "market": 1100000,
    "roi": 44,
    "area": 64,
    "beds": 0,
    "baths": 1,
    "parking": 1,
    "floor": "14º",
    "endsAt": "2026-05-16T00:00:00",
    "occupancy": "desocupado",
    "risk": { "j": "good", "f": "good", "l": "good", "o": "good" },
    "viability": {
      "riskDimensions": [
        { "dim": "Jurídico", "pct": 95, "state": "good", "note": "Sem ônus, sem processos correlatos" },
        { "dim": "Financeiro", "pct": 82, "state": "good", "note": "Sem débitos significativos identificados" },
        { "dim": "Liquidez", "pct": 88, "state": "good", "note": "Alta liquidez no bairro" },
        { "dim": "Ocupação", "pct": 93, "state": "good", "note": "Imóvel desocupado" }
      ],
      "alerts": [
        { "level": "good", "title": "Imóvel desocupado", "text": "Sala comercial vazia, disponível para posse imediata." },
        { "level": "good", "title": "Sem débitos", "text": "IPTU e condomínio em dia." }
      ],
      "description": "Sala comercial de 64 m² no 14º andar, na Av. Faria Lima, Itaim Bibi. Uma sala ampla com recepção, banheiro privativo e uma vaga de garagem. Edifício corporativo com portaria, elevador e infraestrutura de TI.",
      "features": {
        "Área": "64 m²",
        "Cidade": "São Paulo",
        "Tipo de leilão": "Extrajudicial",
        "Andar": "14º",
        "IPTU mensal": "R$ 720",
        "Condomínio": "R$ 2.100"
      }
    },
    "marketDetail": {
      "indicators": [
        { "lbl": "Preço/m² · bairro", "val": "R$ 17.180", "delta": "+3,8% YoY", "pos": true },
        { "lbl": "Preço/m² · imóvel", "val": "R$ 10.625", "delta": "abaixo da média", "pos": true },
        { "lbl": "Dias médios p/ venda", "val": "56 dias", "delta": "vs. SP 102", "pos": true },
        { "lbl": "Liquidez · score", "val": "9 / 10", "delta": "alta liquidez" }
      ],
      "trend": [15200, 15350, 15480, 15600, 15700, 15850, 16000, 16120, 16250, 16400, 16500, 16620, 16750, 16880, 16950, 17050, 17150, 17200, 17300, 17380, 17450, 17500, 17600, 17680, 17750, 17800, 17850, 17920, 18000, 18050, 18100, 18150, 18200, 18250, 18300, 18350],
      "trendStartLabel": "mai/2023",
      "trendEndLabel": "mai/2026",
      "comparables": []
    },
    "costs": [
      { "label": "Lance de arremate", "value": 680000, "hint": "Valor declarado como mínimo no edital.", "kind": "price" },
      { "label": "ITBI · São Paulo (3%)", "value": 20400, "hint": "Imposto de transmissão devido ao município.", "kind": "tax" },
      { "label": "Comissão do leiloeiro (5%)", "value": 34000, "hint": "Sobre o valor do arremate, devida no ato.", "kind": "fee" },
      { "label": "Custas judiciais", "value": 0, "hint": "Não aplicável — leilão extrajudicial.", "kind": "fee" },
      { "label": "Registro em cartório", "value": 13600, "hint": "Inclui escritura e averbações na matrícula.", "kind": "fee" },
      { "label": "IPTU em atraso assumido", "value": 0, "hint": "IPTU em dia.", "kind": "debt" },
      { "label": "Condomínio em atraso", "value": 0, "hint": "Sem débito condominial.", "kind": "debt" },
      { "label": "Reforma estimada", "value": 25000, "hint": "Pintura, piso, adequação elétrica.", "kind": "reno" },
      { "label": "Imposto sobre ganho de capital", "value": 0, "hint": "Isento · primeiro imóvel · até R$ 35k.", "kind": "tax" }
    ],
    "edital": {
      "process": "",
      "creditor": "",
      "debtor": "",
      "modality": "Eletrônico · Mega Leilões",
      "firstBidDate": "",
      "firstBidPrice": 680000,
      "secondBidDate": "",
      "secondBidPrice": 591600,
      "propertyDescription": "Sala comercial de 64 m² no 14º andar, Av. Brig. Faria Lima, 1845, cj. 412, Itaim Bibi, São Paulo-SP.",
      "liens": [],
      "paymentTerms": "À vista no prazo de 24h via depósito judicial.",
      "summaryNote": "Texto resumido pela IA Arremate."
    }
  },
  {
    "id": "p5",
    "score": 82,
    "photoLabel": "COBERTURA · BARRA SUL · SC",
    "title": "Cobertura 180 m², Av. Atlântica",
    "address": "Av. Atlântica, 5500 · cobertura",
    "type": "Cobertura",
    "neighborhood": "Barra Sul",
    "city": "Balneário Camboriú, SC",
    "auctionType": "1ª praça",
    "auctioneer": "Lance Já",
    "court": "2ª Vara Cível BC",
    "discount": 35,
    "minBid": 1240000,
    "market": 1900000,
    "roi": 41,
    "area": 180,
    "beds": 3,
    "baths": 4,
    "parking": 3,
    "floor": "20º",
    "endsAt": "2026-05-18T00:00:00",
    "occupancy": "desocupado",
    "risk": { "j": "good", "f": "good", "l": "warn", "o": "good" },
    "viability": {
      "riskDimensions": [
        { "dim": "Jurídico", "pct": 88, "state": "good", "note": "Sem ônus, sem processos correlatos" },
        { "dim": "Financeiro", "pct": 80, "state": "good", "note": "Sem débitos significativos identificados" },
        { "dim": "Liquidez", "pct": 65, "state": "warn", "note": "Média de 78 dias para vender no bairro" },
        { "dim": "Ocupação", "pct": 92, "state": "good", "note": "Imóvel desocupado" }
      ],
      "alerts": [
        { "level": "good", "title": "Imóvel desocupado", "text": "Cobertura vazia, disponível para posse imediata." },
        { "level": "good", "title": "Sem débitos", "text": "IPTU e condomínio em dia." }
      ],
      "description": "Cobertura duplex de 180 m² no 20º andar, na Av. Atlântica, Barra Sul, Balneário Camboriú. Três suítes, sala ampla com terraço panorâmico, cozinha gourmet, área de serviço, quatro banheiros e três vagas de garagem cobertas.",
      "features": {
        "Área": "180 m²",
        "Cidade": "Balneário Camboriú",
        "Tipo de leilão": "1ª praça",
        "Andar": "20º",
        "IPTU mensal": "R$ 1.200",
        "Condomínio": "R$ 3.800"
      }
    },
    "marketDetail": {
      "indicators": [
        { "lbl": "Preço/m² · bairro", "val": "R$ 15.200", "delta": "+5,8% YoY", "pos": true },
        { "lbl": "Preço/m² · imóvel", "val": "R$ 6.889", "delta": "abaixo da média", "pos": true },
        { "lbl": "Dias médios p/ venda", "val": "78 dias", "delta": "vs. SC 95", "pos": true },
        { "lbl": "Liquidez · score", "val": "7 / 10", "delta": "alta liquidez" }
      ],
      "trend": [11800, 11950, 12100, 12200, 12350, 12500, 12650, 12800, 12950, 13100, 13250, 13400, 13550, 13700, 13850, 14000, 14150, 14300, 14450, 14600, 14750, 14900, 15050, 15150, 15200, 15300, 15400, 15500, 15600, 15700, 15800, 15900, 16000, 16100, 16200, 16300],
      "trendStartLabel": "mai/2023",
      "trendEndLabel": "mai/2026",
      "comparables": []
    },
    "costs": [
      { "label": "Lance de arremate", "value": 1240000, "hint": "Valor declarado como mínimo no edital.", "kind": "price" },
      { "label": "ITBI · Balneário Camboriú (3%)", "value": 37200, "hint": "Imposto de transmissão devido ao município.", "kind": "tax" },
      { "label": "Comissão do leiloeiro (5%)", "value": 62000, "hint": "Sobre o valor do arremate, devida no ato.", "kind": "fee" },
      { "label": "Custas judiciais", "value": 18600, "hint": "Taxa cartorária, edital, oficial de justiça.", "kind": "fee" },
      { "label": "Registro em cartório", "value": 24800, "hint": "Inclui escritura e averbações na matrícula.", "kind": "fee" },
      { "label": "IPTU em atraso assumido", "value": 0, "hint": "IPTU em dia.", "kind": "debt" },
      { "label": "Condomínio em atraso", "value": 0, "hint": "Sem débito condominial.", "kind": "debt" },
      { "label": "Reforma estimada", "value": 55000, "hint": "Pintura, cozinha, banheiros, pisos.", "kind": "reno" },
      { "label": "Imposto sobre ganho de capital", "value": 0, "hint": "Isento · primeiro imóvel · até R$ 35k.", "kind": "tax" }
    ],
    "edital": {
      "process": "",
      "creditor": "",
      "debtor": "",
      "modality": "Eletrônico · Lance Já",
      "firstBidDate": "",
      "firstBidPrice": 1240000,
      "secondBidDate": "",
      "secondBidPrice": 1078000,
      "propertyDescription": "Cobertura duplex de 180 m² no 20º andar, Av. Atlântica, 5500, Barra Sul, Balneário Camboriú-SC.",
      "liens": [],
      "paymentTerms": "À vista no prazo de 24h via depósito judicial.",
      "summaryNote": "Texto resumido pela IA Arremate."
    }
  }
]
```

- [ ] **Step 2: Verify seed.json is valid JSON**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao/backend && python -c "import json; data=json.load(open('data/seed.json')); print(f'{len(data)} properties, keys: {list(data[0].keys())}')"`

Expected: `3 properties, keys: ['id', 'score', ...]`

- [ ] **Step 3: Verify seed data parses through Pydantic model**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao/backend && python -c "
import json
from graph.contracts import AuctionPropertyResult
data = json.load(open('data/seed.json'))
for p in data:
    result = AuctionPropertyResult.model_validate(p)
    print(f'{result.id}: viability={result.viability is not None}, market={result.market_detail is not None}, costs={result.costs is not None}, edital={result.edital is not None}')
"`

Expected: All 3 properties show `True` for all 4 detail fields.

- [ ] **Step 4: Commit**

```bash
git add backend/data/seed.json
git commit -m "feat: add seed.json with 3 fully-populated properties"
```

---

### Task 4: Add seed loading to api.py

**Files:**
- Modify: `backend/api.py`

- [ ] **Step 1: Add seed loading logic**

Add these imports and function to `backend/api.py`:

```python
from pathlib import Path
import json

SEED_FILE = Path(__file__).parent / "data" / "seed.json"
```

Add a `_load_seed_if_empty` function:

```python
def _load_seed_if_empty() -> None:
    """Load seed data into results.json if it doesn't exist or is empty."""
    if RESULTS_FILE.exists():
        existing = _load_results()
        if existing:
            return
    if not SEED_FILE.exists():
        return
    seed_data = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    _save_results(seed_data)
```

Add a startup event to call it. Add this after `app = FastAPI(...)`:

```python
@app.on_event("startup")
def _startup():
    _load_seed_if_empty()
```

- [ ] **Step 2: Verify it works**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao/backend && python -c "
import tempfile, shutil, json
from pathlib import Path

# Simulate empty results
tmp = tempfile.mkdtemp()
from api import _load_seed_if_empty, RESULTS_FILE, _load_results, DATA_DIR, SEED_FILE
import api

# Override paths for test
api.RESULTS_FILE = Path(tmp) / 'results.json'
api.DATA_DIR = Path(tmp)
_load_seed_if_empty()
results = _load_results()
print(f'Loaded {len(results)} properties from seed')
shutil.rmtree(tmp)
"`

Expected: `Loaded 3 properties from seed`

- [ ] **Step 3: Commit**

```bash
git add backend/api.py
git commit -m "feat: load seed data on API startup when results are empty"
```

---

### Task 5: Update frontend fixtures in shared.jsx

**Files:**
- Modify: `frontend/src/components/shared.jsx`

- [ ] **Step 1: Add detail fields to the PROPERTIES fixture objects**

For each of the 3 seeded properties (p1, p3, p5), add `viability`, `marketDetail`, `costs`, and `edital` objects matching the seed.json data. For the other 5 properties (p2, p4, p6, p7, p8), leave these fields absent — they'll show fallback UI.

Add to the `p1` object in `PROPERTIES` (after the `risk` field):

```javascript
    viability: {
      riskDimensions: [
        { dim: 'Jurídico', pct: 92, state: 'good', note: 'Sem ônus, sem processos correlatos' },
        { dim: 'Financeiro', pct: 78, state: 'good', note: 'Dívida conhecida: R$ 4.200 IPTU + R$ 18.400 condomínio' },
        { dim: 'Liquidez', pct: 62, state: 'warn', note: 'Média de 84 dias para vender no bairro' },
        { dim: 'Ocupação', pct: 95, state: 'good', note: 'Imóvel desocupado há 11 meses · vistoria registrada' },
      ],
      alerts: [
        { level: 'warn', title: 'Divergência de área', text: 'Edital declara 78 m², matrícula consta 76,4 m².' },
        { level: 'warn', title: 'Condomínio em atraso', text: 'R$ 18.400 de dívida condominial — assumir no arremate.' },
        { level: 'good', title: 'Imóvel desocupado', text: 'Sem inquilinos há 11 meses, vistoria registrada.' },
        { level: 'good', title: 'IPTU em dia até Q1', text: 'Apenas R$ 4.200 do trimestre atual pendentes.' },
      ],
      description: 'Apartamento de 78 m² no 7º andar do Edifício Harmonia, frente leste, em rua arborizada da Vila Madalena. Dois dormitórios sendo uma suíte, sala ampla integrada à varanda, cozinha planejada e área de serviço separada. Prédio com elevador, portaria 24h e uma vaga de garagem coberta.',
      features: {
        'Ano de construção': '2003 (22 anos)',
        'Conservação': 'Bom estado',
        'Posição solar': 'Leste · sol da manhã',
        'Vista': 'Rua arborizada',
        'Andar': '7º de 12 andares',
        'Mobiliado': 'Não',
        'IPTU mensal': 'R$ 380',
        'Condomínio': 'R$ 1.240',
      },
    },
    marketDetail: {
      indicators: [
        { lbl: 'Preço/m² · bairro', val: 'R$ 11.420', delta: '+4,2% YoY', pos: true },
        { lbl: 'Preço/m² · imóvel', val: 'R$ 6.923', delta: 'abaixo da média', pos: true },
        { lbl: 'Dias médios p/ venda', val: '84 dias', delta: 'vs. SP 102', pos: true },
        { lbl: 'Yield aluguel', val: '0,58 %/mês', delta: 'vs. SP 0,52%', pos: true },
        { lbl: 'Cap rate projetado', val: '6,9% a.a.', delta: 'vs. Selic 10,5%', neg: true },
        { lbl: 'Liquidez · score', val: '62 / 100', delta: 'estável 12m' },
      ],
      trend: [9200, 9180, 9320, 9410, 9380, 9500, 9620, 9580, 9700, 9850, 9920, 10010, 10180, 10240, 10120, 10350, 10480, 10560, 10620, 10680, 10780, 10820, 10960, 11020, 11100, 11050, 11150, 11240, 11200, 11280, 11320, 11380, 11410, 11420, 11380, 11420],
      trendStartLabel: 'mai/2023',
      trendEndLabel: 'mai/2026',
      comparables: [
        { address: 'R. Harmonia, 320', areaM2: 82, beds: 2, pricePerM2: 11200, salePrice: 918000, daysListed: 67, saleDate: 'fev/2026' },
        { address: 'R. Aspicuelta, 511', areaM2: 75, beds: 2, pricePerM2: 11680, salePrice: 876000, daysListed: 92, saleDate: 'jan/2026' },
        { address: 'R. Fradique Coutinho, 1240', areaM2: 95, beds: 3, pricePerM2: 11050, salePrice: 1050000, daysListed: 51, saleDate: 'dez/2025' },
        { address: 'R. Mourato Coelho, 880', areaM2: 68, beds: 2, pricePerM2: 11400, salePrice: 775000, daysListed: 78, saleDate: 'dez/2025' },
        { address: 'R. Wisard, 422', areaM2: 88, beds: 3, pricePerM2: 11820, salePrice: 1040000, daysListed: 84, saleDate: 'nov/2025' },
      ],
    },
    costs: [
      { label: 'Lance de arremate', value: 312000, hint: 'Valor declarado como mínimo no edital.', kind: 'price' },
      { label: 'ITBI · São Paulo (3%)', value: 9360, hint: 'Imposto de transmissão devido ao município.', kind: 'tax' },
      { label: 'Comissão do leiloeiro (5%)', value: 15600, hint: 'Sobre o valor do arremate, devida no ato.', kind: 'fee' },
      { label: 'Custas judiciais', value: 4800, hint: 'Taxa cartorária, edital, oficial de justiça.', kind: 'fee' },
      { label: 'Registro em cartório', value: 6240, hint: 'Inclui escritura e averbações na matrícula.', kind: 'fee' },
      { label: 'IPTU em atraso assumido', value: 4200, hint: 'IPTU vencido até a data do arremate.', kind: 'debt' },
      { label: 'Condomínio em atraso', value: 18400, hint: 'Débito condominial cobrado pelo síndico.', kind: 'debt' },
      { label: 'Ação de imissão na posse', value: 0, hint: 'Não aplicável — imóvel desocupado.', kind: 'fee' },
      { label: 'Reforma estimada', value: 36000, hint: 'Cozinha, banheiros, pintura, piso laminado.', kind: 'reno' },
      { label: 'Imposto sobre ganho de capital', value: 0, hint: 'Isento · primeiro imóvel · até R$ 35k.', kind: 'tax' },
    ],
    edital: {
      process: '1024778-32.2024.8.26.0100',
      creditor: 'Banco Santander S.A.',
      debtor: 'Construtora Vila Madalena Ltda.',
      modality: 'Eletrônico · plataforma Zukerman',
      firstBidDate: '15/05/2026 às 14h30',
      firstBidPrice: 312000,
      secondBidDate: '29/05/2026 às 14h30',
      secondBidPrice: 270000,
      propertyDescription: 'Apartamento nº 71 do 7º pavimento do Edifício Harmonia, situado na Rua Harmonia, nº 412, Vila Madalena, com área privativa de 78,00 m², compreendendo dois dormitórios sendo um suíte, sala de estar e jantar, cozinha, área de serviço, dois banheiros e uma vaga de garagem (vaga 24). Matriculado sob nº 87.412 no 14º Cartório de Registro de Imóveis da Capital.',
      liens: [
        'Hipoteca de 1º grau em favor de Banco Santander S.A. — extinta com a arrematação (art. 1.501 CC).',
        'IPTU em aberto: R$ 4.200,00 referente ao 1º trimestre de 2026.',
        'Dívida condominial: R$ 18.400,00 conforme certidão do síndico anexa aos autos (fls. 412).',
        'Não há registro de penhoras adicionais sobre o imóvel.',
      ],
      paymentTerms: 'À vista no prazo de 24h via depósito judicial, ou parcelado em até 30 vezes mediante caução de 25% e atualização pela tabela do TJSP, com correção mensal pelo IPCA + 1% a.m. (art. 895 CPC).',
      summaryNote: 'Texto resumido pela IA Arremate. O documento original contém 14 páginas e está disponível no link "PDF original" acima.',
    },
```

Add the same structure for `p3` and `p5` using the corresponding data from seed.json.

- [ ] **Step 2: Verify frontend still loads**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao/frontend && npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/shared.jsx
git commit -m "feat: add detail fields to frontend fixtures for p1, p3, p5"
```

---

### Task 6: Update Viability tab to read from p.viability

**Files:**
- Modify: `frontend/src/components/PropertyDetail.jsx`

- [ ] **Step 1: Update Viability component to use p.viability data**

Replace the `Viability` function (starting around line 301) with one that reads from `p.viability`:

```jsx
function Viability({ p }) {
  const [reno, setReno] = useState(45);
  const [target, setTarget] = useState(30);
  const [city, setCity] = useState('São Paulo / SP');
  const [exempt, setExempt] = useState('Primeiro imóvel');

  const v = p.viability;
  const market = p.market;
  const bid = p.minBid;
  const renoCost = Math.round((reno / 100) * 80000);
  const fees = Math.round(bid * 0.078);
  const totalCost = bid + renoCost + fees;
  const netSale = Math.round(market * 0.94);
  const grossROI = Math.round(((netSale - totalCost) / totalCost) * 100);
  const maxBid = Math.round((netSale / (1 + target / 100)) - renoCost - fees);

  if (!v) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: 'var(--fg-2)', fontSize: 14 }}>Dados de viabilidade não disponíveis para este imóvel.</p>
      </div>
    );
  }

  const goodCount = v.riskDimensions.filter(d => d.state === 'good').length;
  const warnCount = v.riskDimensions.filter(d => d.state === 'warn').length;

  return (
    <div>
      {/* Hero metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16, marginBottom: 24,
      }}>
        <Metric
          lbl="ROI líquido projetado"
          big={`+${grossROI}%`}
          sub="após custos, tributos e venda em 12 meses"
          color={grossROI >= 25 ? 'var(--good)' : grossROI >= 10 ? 'var(--warn)' : 'var(--bad)'}
        />
        <Metric
          lbl="Custo total estimado"
          big={`R$ ${fmtBRL(totalCost)}`}
          sub={`Lance + R$ ${fmtBRL(renoCost)} reforma + R$ ${fmtBRL(fees)} custos`}
        />
        <Metric
          lbl="Lance máximo recomendado"
          big={`R$ ${fmtBRL(maxBid)}`}
          sub={`Para atingir ${target}% de retorno líquido`}
          color="var(--accent)"
        />
        <Metric
          lbl="Payback"
          big="11 meses"
          sub="Considerando venda direta após reforma"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Risk dimensions */}
        <div className="card" style={{ padding: 22 }}>
          <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 18 }}>
            <div>
              <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 03.01</span>
              <h3 className="h2" style={{ marginTop: 4 }}>Riscos por dimensão</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-2)' }}>
                Score quebrado nas quatro dimensões que mais explicam atrito em leilões.
              </p>
            </div>
            <span className={`tag dot ${warnCount === 0 ? 'good' : 'warn'}`}>
              {goodCount} boas · {warnCount} atenção{v.riskDimensions.filter(d => d.state === 'bad').length > 0 ? ` · ${v.riskDimensions.filter(d => d.state === 'bad').length} crítico${v.riskDimensions.filter(d => d.state === 'bad').length > 1 ? 's' : ''}` : ''}
            </span>
          </div>
          <div className="col gap-4" style={{ marginTop: 20 }}>
            {v.riskDimensions.map(rd => (
              <RiskBar key={rd.dim} dim={rd.dim} pct={rd.pct} state={rd.state} note={rd.note} />
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div className="card" style={{ padding: 22 }}>
          <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 18 }}>
            <div>
              <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 03.02</span>
              <h3 className="h2" style={{ marginTop: 4 }}>Alertas detectados</h3>
            </div>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
              {v.alerts.length} itens
            </span>
          </div>
          <div className="col gap-3" style={{ marginTop: 20 }}>
            {v.alerts.map((a, i) => (
              <Alert key={i} level={a.level} title={a.title}>{a.text}</Alert>
            ))}
          </div>
        </div>
      </div>

      {/* Investor scenario */}
      <div className="card" style={{ padding: 24 }}>
        <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 6 }}>
          <div>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 03.03 · simulador</span>
            <h3 className="h2" style={{ marginTop: 4 }}>Cenário do investidor</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-2)' }}>
              Arraste os controles abaixo — as métricas no topo recalculam ao vivo.
            </p>
          </div>
          <button className="btn sm">Resetar</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginTop: 22 }}>
          <SliderField
            label="Nível de reforma"
            value={reno}
            onChange={setReno}
            display={`R$ ${fmtBRL(renoCost)}`}
            description={reno < 25 ? 'Mínima — pintura e ajustes' :
                          reno < 60 ? 'Padrão — cozinha, banheiros, piso' :
                          'Completa — desmontagem e reconstrução'}
          />
          <SliderField
            label="Meta de retorno líquido"
            value={target}
            onChange={setTarget}
            display={`${target}%`}
            description="Após custos, impostos e venda em 12 meses"
            min={5} max={80}
          />
        </div>

        <div className="divider" style={{ margin: '24px 0 20px' }}></div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <Selector
            label="Cidade do comprador"
            value={city}
            options={['São Paulo / SP', 'Rio de Janeiro / RJ', 'Belo Horizonte / MG', 'Curitiba / PR']}
            onChange={setCity}
            hint="Define alíquota de ITBI aplicável"
          />
          <Selector
            label="Cenário tributário"
            value={exempt}
            options={['Primeiro imóvel', 'Reinvestimento em 180 dias', 'Pagamento integral de GC']}
            onChange={setExempt}
            hint="Isenção ou incidência do ganho de capital"
          />
        </div>
      </div>
    </div>
  );
}
```

Also update the Collapsible "Descrição do imóvel" and "Características" sections in the main component (around line 178-198) to read from `p.viability`:

Replace the hardcoded description text inside the "Descrição do imóvel" Collapsible with:
```jsx
<p style={{ margin: 0, fontSize: 13, color: 'var(--fg-1)', lineHeight: 1.5 }}>
  {p.viability?.description || 'Descrição não disponível.'}
</p>
```

Replace the hardcoded features grid inside "Características" Collapsible with:
```jsx
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5 }}>
  {p.viability?.features
    ? Object.entries(p.viability.features).map(([lbl, val]) => (
        <Meta key={lbl} lbl={lbl} val={val} />
      ))
    : <span style={{ color: 'var(--fg-2)' }}>Dados não disponíveis</span>
  }
</div>
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao/frontend && npm run build`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PropertyDetail.jsx
git commit -m "feat: wire Viability tab and property details to p.viability data"
```

---

### Task 7: Update Market tab to read from p.marketDetail

**Files:**
- Modify: `frontend/src/components/PropertyDetail.jsx`

- [ ] **Step 1: Replace the Market component to use p.marketDetail**

Replace the `Market` function (starting around line 565) with:

```jsx
function Market({ p }) {
  const md = p.marketDetail;

  if (!md) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: 'var(--fg-2)', fontSize: 14 }}>Dados de mercado não disponíveis para este imóvel.</p>
      </div>
    );
  }

  const bidPct = p.market > 0 ? (p.minBid / p.market * 100) : 0;
  const gapValue = p.market - p.minBid;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Value gap */}
        <div className="card" style={{ padding: 22 }}>
          <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 01.01 · spread</span>
          <h3 className="h2" style={{ marginTop: 4, marginBottom: 18 }}>Valor de mercado vs. lance mínimo</h3>

          <div style={{ position: 'relative', marginTop: 28 }}>
            <div style={{ height: 12, background: 'var(--bg-3)', borderRadius: 6, position: 'relative' }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${bidPct}%`,
                background: 'var(--accent)',
                borderRadius: 6,
              }}></div>
              <div style={{
                position: 'absolute', left: `${bidPct}%`, top: -10,
                width: 2, height: 32,
                background: 'var(--fg-0)',
              }}></div>
            </div>
            <div className="row between" style={{ marginTop: 14 }}>
              <div>
                <span className="uppy" style={{ color: 'var(--fg-3)' }}>Lance mínimo</span>
                <div className="num-md" style={{ marginTop: 4, color: 'var(--accent)' }}>R$ {fmtBRL(p.minBid)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="uppy" style={{ color: 'var(--fg-3)' }}>Mercado estimado</span>
                <div className="num-md" style={{ marginTop: 4 }}>R$ {fmtBRL(p.market)}</div>
              </div>
            </div>
            <div style={{
              marginTop: 18, padding: '12px 14px',
              background: 'var(--good-soft)', borderRadius: 6,
              fontSize: 13, color: 'var(--fg-0)',
            }}>
              <b style={{ color: 'var(--good)', fontFamily: 'var(--f-mono)' }}>R$ {fmtBRL(gapValue)}</b>
              <span style={{ color: 'var(--fg-1)' }}> de gap bruto · </span>
              <b>−{p.discount}%</b>
              <span style={{ color: 'var(--fg-1)' }}> abaixo da avaliação</span>
            </div>
          </div>
        </div>

        {/* Metrics grid */}
        <div className="card" style={{ padding: 22 }}>
          <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 01.02 · indicadores</span>
          <h3 className="h2" style={{ marginTop: 4, marginBottom: 18 }}>{p.neighborhood} · base 2024–26</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            {md.indicators.map(ind => (
              <Stat2 key={ind.lbl} lbl={ind.lbl} val={ind.val} delta={ind.delta} pos={ind.pos} neg={ind.neg} />
            ))}
          </div>
        </div>
      </div>

      {/* Trend chart */}
      {md.trend.length > 0 && (
        <div className="card" style={{ padding: 22 }}>
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <div>
              <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 01.03 · tendência</span>
              <h3 className="h2" style={{ marginTop: 4 }}>R$ / m² · {p.neighborhood} · 36 meses</h3>
            </div>
          </div>
          <TrendChart points={md.trend} startLabel={md.trendStartLabel} endLabel={md.trendEndLabel} />
          <p style={{ margin: '14px 0 0', fontSize: 11, color: 'var(--fg-3)' }}>
            Fontes: FipeZap · DataZap · Caixa SBPE · cartórios eletrônicos · 412 leiloeiros agregados.
          </p>
        </div>
      )}

      {/* Comparables */}
      {md.comparables.length > 0 && (
        <div className="card" style={{ marginTop: 16, padding: 22 }}>
          <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 01.04 · comparáveis</span>
          <h3 className="h2" style={{ marginTop: 4, marginBottom: 16 }}>Imóveis vendidos no raio de 800m · 6 meses</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--line-1)' }}>Endereço</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', borderBottom: '1px solid var(--line-1)' }}>Área</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', borderBottom: '1px solid var(--line-1)' }}>Quartos</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', borderBottom: '1px solid var(--line-1)' }}>R$/m²</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', borderBottom: '1px solid var(--line-1)' }}>Venda</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', borderBottom: '1px solid var(--line-1)' }}>Dias listado</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', borderBottom: '1px solid var(--line-1)' }}>Data</th>
                </tr>
              </thead>
              <tbody>
                {md.comparables.map((r, i) => (
                  <tr key={i} style={{ fontFamily: 'var(--f-sans)' }}>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-1)' }}>{r.address}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-1)', textAlign: 'right', fontFamily: 'var(--f-mono)' }}>{r.areaM2} m²</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-1)', textAlign: 'right', fontFamily: 'var(--f-mono)' }}>{r.beds ?? '—'}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-1)', textAlign: 'right', fontFamily: 'var(--f-mono)' }}>R$ {fmtBRL(r.pricePerM2)}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-1)', textAlign: 'right', fontFamily: 'var(--f-mono)' }}>R$ {fmtBRL(r.salePrice)}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-1)', textAlign: 'right', fontFamily: 'var(--f-mono)', color: 'var(--fg-2)' }}>{r.daysListed}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-1)', textAlign: 'right', fontFamily: 'var(--f-mono)', color: 'var(--fg-2)' }}>{r.saleDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

Also update `TrendChart` to accept dynamic points:

```jsx
function TrendChart({ points, startLabel, endLabel }) {
  const W = 1000, H = 180, pad = 8;
  const min = Math.min(...points) - 200;
  const max = Math.max(...points) + 200;
  const x = (i) => pad + (i / (points.length - 1)) * (W - 2 * pad);
  const y = (v) => H - pad - ((v - min) / (max - min)) * (H - 2 * pad);
  const line = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - pad} L${pad},${H - pad} Z`;
  return (
    <div style={{ marginTop: 22, position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 180, display: 'block' }}>
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.6 0.18 45)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="oklch(0.6 0.18 45)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(g => (
          <line key={g} x1={pad} x2={W - pad} y1={H * g} y2={H * g}
            stroke="var(--line-1)" strokeWidth="1" strokeDasharray="2 4" />
        ))}
        <path d={area} fill="url(#trendGrad)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="1.6" />
        <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r="3.5" fill="var(--accent)" />
      </svg>
      <div className="row between" style={{ marginTop: 6 }}>
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>{startLabel}</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>{endLabel}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao/frontend && npm run build`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PropertyDetail.jsx
git commit -m "feat: wire Market tab to p.marketDetail data"
```

---

### Task 8: Update CostBreakdown tab to read from p.costs

**Files:**
- Modify: `frontend/src/components/PropertyDetail.jsx`

- [ ] **Step 1: Replace CostBreakdown to use p.costs**

Replace the `CostBreakdown` function (starting around line 752) with:

```jsx
function CostBreakdown({ p }) {
  if (!p.costs || p.costs.length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: 'var(--fg-2)', fontSize: 14 }}>Dados de custos não disponíveis para este imóvel.</p>
      </div>
    );
  }

  const rows = p.costs;
  const total = rows.reduce((a, r) => a + r.value, 0);

  return (
    <div>
      <div className="row between" style={{ alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 02 · custo total</span>
          <h3 className="h2" style={{ marginTop: 4 }}>Da batida do martelo à chave na mão</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-2)', maxWidth: 540 }}>
            Cada centavo que sai do seu bolso, linha a linha. Passe o cursor em qualquer item para entender o porquê.
          </p>
        </div>
        <div className="row gap-2">
          <button className="btn sm">Editar valores</button>
          <button className="btn sm"><span className="mono">↓</span> PDF</button>
        </div>
      </div>

      <div className="card">
        <div style={{
          display: 'grid',
          gridTemplateColumns: '24px 1fr 100px 160px',
          gap: 14,
          padding: '10px 20px',
          background: 'var(--bg-2)',
          fontFamily: 'var(--f-mono)',
          fontSize: 10.5,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--fg-3)',
        }}>
          <span></span>
          <span>Item</span>
          <span style={{ textAlign: 'right' }}>% sobre total</span>
          <span style={{ textAlign: 'right' }}>Valor</span>
        </div>
        {rows.map((r, i) => (
          <CostRow key={i} l={r.label} v={r.value} hint={r.hint} pct={total > 0 ? r.value / total * 100 : 0} />
        ))}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '24px 1fr 100px 160px',
          gap: 14,
          padding: '20px 20px',
          background: 'var(--bg-2)',
          alignItems: 'baseline',
          borderTop: '2px solid var(--line-2)',
        }}>
          <span className="mono" style={{ color: 'var(--fg-3)' }}>∑</span>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Custo total — chave na mão</span>
          <span></span>
          <span className="num-xl" style={{ textAlign: 'right', color: 'var(--accent)' }}>
            R$ {fmtBRL(total)}
          </span>
        </div>
      </div>

      <p style={{ marginTop: 14, fontSize: 11.5, color: 'var(--fg-3)' }}>
        Cálculo conservador. Ganho de capital varia conforme reinvestimento. Honorários advocatícios não inclusos.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao/frontend && npm run build`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PropertyDetail.jsx
git commit -m "feat: wire CostBreakdown tab to p.costs data"
```

---

### Task 9: Update Edital tab to read from p.edital

**Files:**
- Modify: `frontend/src/components/PropertyDetail.jsx`

- [ ] **Step 1: Replace Edital component to use p.edital**

Replace the `Edital` function (starting around line 987) with:

```jsx
function Edital({ p }) {
  const e = p.edital;

  if (!e) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: 'var(--fg-2)', fontSize: 14 }}>Dados do edital não disponíveis para este imóvel.</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 24, fontSize: 13, lineHeight: 1.65 }}>
      <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 04 · edital integral</span>
          <h3 className="h2" style={{ marginTop: 4 }}>Edital de Leilão Judicial Eletrônico</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-2)' }}>
            Originado em: {e.firstBidDate || 'não informado'}
          </p>
        </div>
        <div className="row gap-2">
          <button className="btn sm"><span className="mono">↗</span> Abrir no tribunal</button>
          <button className="btn sm"><span className="mono">↓</span> PDF original</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 22 }}>
        <Meta lbl="Processo" val={e.process || '—'} />
        <Meta lbl="Exequente" val={e.creditor || '—'} />
        <Meta lbl="Executado" val={e.debtor || '—'} />
        <Meta lbl="Modalidade" val={e.modality || '—'} />
        <Meta lbl="1ª praça" val={e.firstBidDate ? `${e.firstBidDate} · R$ ${fmtBRL(e.firstBidPrice)}` : '—'} />
        <Meta lbl="2ª praça" val={e.secondBidDate ? `${e.secondBidDate} · R$ ${fmtBRL(e.secondBidPrice)}` : '—'} />
      </div>

      {e.propertyDescription && (
        <>
          <h4 className="h3" style={{ marginBottom: 10 }}>Descrição do bem</h4>
          <p style={{ margin: 0, color: 'var(--fg-1)' }}>{e.propertyDescription}</p>
        </>
      )}

      {e.liens.length > 0 && (
        <>
          <div className="divider" style={{ margin: '20px 0' }}></div>
          <h4 className="h3" style={{ marginBottom: 10 }}>Ônus, gravames e dívidas</h4>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--fg-1)' }}>
            {e.liens.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </>
      )}

      {e.paymentTerms && (
        <>
          <div className="divider" style={{ margin: '20px 0' }}></div>
          <h4 className="h3" style={{ marginBottom: 10 }}>Forma de pagamento</h4>
          <p style={{ margin: 0, color: 'var(--fg-1)' }}>{e.paymentTerms}</p>
        </>
      )}

      {e.summaryNote && (
        <div style={{ marginTop: 22, padding: 14, background: 'var(--bg-2)', borderRadius: 6, fontSize: 12, color: 'var(--fg-2)' }}>
          <b style={{ color: 'var(--fg-1)' }}>↳</b> {e.summaryNote}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao/frontend && npm run build`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PropertyDetail.jsx
git commit -m "feat: wire Edital tab to p.edital data"
```

---

### Task 10: End-to-end verification

**Files:**
- No new files

- [ ] **Step 1: Run all backend tests**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao/backend && python -m pytest tests/ -v`

Expected: All PASS

- [ ] **Step 2: Verify frontend builds clean**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao/frontend && npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 3: Manual smoke test — start both servers**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && ./dev.sh`

Then open http://localhost:5173 and verify:
- Dashboard loads with seed properties
- Click on p1 (Apto. Rua Harmonia) → detail page shows all tabs with data
- Viability tab shows risk dimensions and alerts from seed data
- Market tab shows indicators, trend chart, and comparables from seed data
- Costs tab shows cost breakdown from seed data
- Edital tab shows process info and liens from seed data
- Click on a property without detail data (e.g. p2) → shows "Dados não disponíveis" fallback
- Paste a URL and analyze → new property appears with whatever data the backend generates

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during e2e verification"
```
