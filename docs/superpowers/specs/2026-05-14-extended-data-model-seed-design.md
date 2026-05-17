# Extended Data Model + Backend Seed

**Date:** 2026-05-14
**Status:** Approved

## Problem

The backend's `AuctionPropertyResult` only contains card-level data (score, risk flags, pricing, basic specs). The frontend detail page needs much more — risk dimension scores, alerts, comparable properties, cost breakdown line items, market indicators, trend data, and edital text. All of this extra detail is currently hardcoded inside React components.

When a user submits an auction URL, the backend returns a partial result; the frontend can't render full detail pages from real data.

## Goal

1. Extend `AuctionPropertyResult` with nested detail objects covering all data the detail page tabs need.
2. Create a backend seed file with 3-5 fully-populated example properties.
3. Update the frontend to read detail data from the property object instead of hardcoded values.
4. Ensure the backend output node populates these details from existing workflow state.

## Approach

Extend the existing `AuctionPropertyResult` with 4 optional nested objects. One API call, one data model. Seed data lives in `backend/data/seed.json` and loads on startup if `results.json` is empty.

## New Pydantic Models

### ViabilityDetail

```python
class RiskDimension(BaseModel):
    dim: str          # "Jurídico", "Financeiro", "Liquidez", "Ocupação"
    pct: int          # 0-100
    state: str        # "good" | "warn" | "bad"
    note: str

class AlertItem(BaseModel):
    level: str        # "good" | "warn" | "bad"
    title: str
    text: str

class ViabilityDetail(BaseModel):
    risk_dimensions: list[RiskDimension]
    alerts: list[AlertItem]
    description: str             # property description paragraph
    features: dict[str, str]     # {"Ano de construção": "2003", ...}
```

### MarketDetail

```python
class MarketIndicator(BaseModel):
    lbl: str
    val: str
    delta: str
    pos: bool | None = None
    neg: bool | None = None

class ComparableSale(BaseModel):
    address: str
    area_m2: float
    beds: int | None
    price_per_m2: float
    sale_price: float
    days_listed: int
    sale_date: str               # "fev/2026"

class MarketDetail(BaseModel):
    indicators: list[MarketIndicator]
    trend: list[float]           # monthly R$/m² values
    trend_start_label: str       # "mai/2023"
    trend_end_label: str         # "mai/2026"
    comparables: list[ComparableSale]
```

### CostLineItem

```python
class CostLineItem(BaseModel):
    label: str
    value: float
    hint: str
    kind: str       # "price" | "tax" | "fee" | "debt" | "reno"
```

### EditalDetail

```python
class EditalDetail(BaseModel):
    process: str
    creditor: str                # exequente
    debtor: str                  # executado
    modality: str                # "Eletrônico · plataforma Zukerman"
    first_bid_date: str
    first_bid_price: float
    second_bid_date: str
    second_bid_price: float
    property_description: str
    liens: list[str]
    payment_terms: str
    summary_note: str
```

### Extended AuctionPropertyResult

Add these 4 optional fields:

```python
viability: ViabilityDetail | None = None
market_detail: MarketDetail | None = None
costs: list[CostLineItem] | None = None
edital: EditalDetail | None = None
```

CamelCase aliases:
- `viability` → `viability`
- `market_detail` → `marketDetail`
- `costs` → `costs`
- `edital` → `edital`

## Backend Changes

### 1. contracts.py

Add the 7 new models above and the 4 new optional fields to `AuctionPropertyResult`.

### 2. output.py — `build_result()`

Populate the detail objects from existing `MarketResult`, `LegalResult`, and `PropertyMetadata`:

- **ViabilityDetail**: Build `risk_dimensions` from scoring's risk flags + compute pct from scoring inputs. Build `alerts` from legal result debts/occupation. `description` and `features` from metadata + legal findings.
- **MarketDetail**: Build `indicators` from `MarketResult` fields. `trend` from `MarketResult.raw_findings` or a simple generated series. `comparables` from `MarketResult.comparable_properties`.
- **CostLineItem list**: Compute from `min_bid`, legal debts, reform estimate, standard fee rates (ITBI, commission, court, cartório).
- **EditalDetail**: Extract from `state.pdf_texts` if available, or from metadata fields.

When the workflow doesn't produce enough data, these fields remain `None` — the frontend handles the empty state gracefully.

**Note on risk dimension percentages:** The scoring node currently produces only good/warn/bad flags, not per-dimension 0-100 scores. For seed data, we provide explicit values. For real analysis, `build_result()` will derive approximate pcts from the scoring inputs (e.g., "good" → 80-95, "warn" → 50-75, "bad" → 0-45) with adjustments based on available debt/liquidity data. This is acceptable for testing; a more precise per-dimension scoring model is a future enhancement.

### 3. Seed file — `backend/data/seed.json`

Create 3 properties (p1, p3, p5 from current frontend fixtures) with fully-populated detail objects matching the hardcoded data in `PropertyDetail.jsx`. This file is the source of truth for demo/testing data.

### 4. api.py — Seed loading

On startup, if `results.json` doesn't exist or is empty, copy seed data into it. This keeps the existing persist-and-read pattern unchanged.

## Frontend Changes

### 1. shared.jsx — Fixtures

Update the `PROPERTIES` array to include the 4 new fields on each fixture object. Values match the seed data.

### 2. PropertyDetail.jsx — Tab components

Each tab component already receives `p` but currently ignores it. Update:

- **Viability**: Read `p.viability.riskDimensions`, `p.viability.alerts`, `p.viability.description`, `p.viability.features`. Remove hardcoded `market=540000`, `bid=312000`, risk bars, alerts, description text.
- **Market**: Read `p.marketDetail.indicators`, `p.marketDetail.trend`, `p.marketDetail.comparables`. Remove hardcoded stats, comparables table, trend chart data.
- **CostBreakdown**: Read `p.costs`. Remove hardcoded `rows` array.
- **Edital**: Read `p.edital`. Remove hardcoded process/creditor/description/liens text.

### 3. Graceful fallback

When a field is `null`/`undefined`, show a placeholder: "Dados não disponíveis" or a skeleton loader. This handles cases where the backend analysis didn't produce full detail data.

### 4. Home.jsx — Dashboard

Dashboard KPIs and market signals remain hardcoded for now — they're aggregate data not tied to individual properties and would require a separate analytics endpoint.

## File Change Summary

| File | Change |
|------|--------|
| `backend/graph/contracts.py` | Add 7 new models, 4 new fields on AuctionPropertyResult |
| `backend/graph/output.py` | Populate detail objects in `build_result()` |
| `backend/graph/state.py` | No changes needed |
| `backend/api.py` | Add seed loading on startup |
| `backend/data/seed.json` | New file — 3 fully-populated properties |
| `frontend/src/components/shared.jsx` | Update PROPERTIES fixtures with detail fields |
| `frontend/src/components/PropertyDetail.jsx` | Read from `p.viability`, `p.marketDetail`, `p.costs`, `p.edital` |

## Out of Scope

- Dashboard (Home.jsx) aggregate data — needs separate analytics endpoint
- Legal tab — currently a locked/premium placeholder, stays as-is
- Trend chart data generation in the backend — for now, seed data provides the values; real trend generation is a future enhancement
- beds/baths/parking/floor in backend output — already `None`, to be extracted from PDF parsing in a future iteration
