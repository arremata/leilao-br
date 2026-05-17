# Output Contracts Design

**Date:** 2026-05-12
**Status:** Draft

## Problem

The backend AI agents (discovery, planner, market, legal) produce `AuctionState` dataclasses and render an HTML report via Jinja2. The frontend (Arremate) needs structured JSON matching its `PROPERTIES` data model — a single 0-100 score, `risk: { j, f, l, o }` flags, ROI, and other fields that no agent currently computes. The two sides have no shared contract.

## Decision

Replace the HTML report output with a validated Pydantic model (`AuctionPropertyResult`) that matches the frontend's property card shape. Add a `scoring_node` between the parallel agents and the output to compute score, risk flags, and ROI. The function `run_analysis()` returns JSON instead of HTML.

## Output Contract

### `AuctionPropertyResult`

The single source of truth for what the frontend consumes:

```python
from pydantic import BaseModel
from typing import Literal

class RiskFlags(BaseModel):
    j: Literal["good", "warn", "bad"]  # Jurídico
    f: Literal["good", "warn", "bad"]  # Financeiro
    l: Literal["good", "warn", "bad"]  # Liquidez
    o: Literal["good", "warn", "bad"]  # Ocupação

class AuctionPropertyResult(BaseModel):
    id: str                          # generated from address + auction_price hash
    score: int                       # 0-100, computed by scoring node
    photo_label: str                 # e.g. "APTO · VILA MADALENA · SP"
    title: str                       # e.g. "Apto. 78 m², Rua Harmonia"
    address: str                     # full address
    type: str                        # Apartamento, Casa, Terreno, etc.
    neighborhood: str
    city: str                        # e.g. "São Paulo, SP"
    auction_type: str                # 1ª praça, Judicial, Extrajudicial
    auctioneer: str
    court: str                       # "—" if extrajudicial
    discount: float                  # % below market value
    min_bid: float                   # auction minimum bid (raw BRL number)
    market: float                    # estimated market value (raw BRL number)
    roi: float                       # projected ROI %
    area: float                      # m²
    beds: int | None                 # not yet extracted by agents, None for now
    baths: int | None                # not yet extracted by agents, None for now
    parking: int | None              # not yet extracted by agents, None for now
    floor: str | None                # not yet extracted by agents, None for now
    ends_at: str                     # ISO 8601 datetime
    occupancy: str                   # desocupado / ocupado / disputado
    risk: RiskFlags
```

### Field mapping: Backend → Frontend

| Frontend field | Backend source |
|---|---|
| `id` | Hash of `address + str(auction_price)` |
| `score` | Computed by `scoring_node` |
| `photo_label` | `f"{type.upper()} · {neighborhood.upper()} · {state}"` |
| `title` | `f"{type} {area} m², {street}"` (street extracted from address) |
| `address` | `PropertyMetadata.address` |
| `type` | `PropertyMetadata.property_type` |
| `neighborhood` | `PropertyMetadata.neighborhood` |
| `city` | `f"{PropertyMetadata.city}, {PropertyMetadata.state}"` |
| `auction_type` | `PropertyMetadata.auction_type` |
| `auctioneer` | `PropertyMetadata.court_or_leiloeiro` (always the leiloeiro/auctioneer name) |
| `court` | `PropertyMetadata.court_or_leiloeiro` if `auction_type` contains "Judicial", else "—" |

**Note:** Currently `court_or_leiloeiro` is a single field that may contain either the court name or the auctioneer name depending on auction type. This is ambiguous. The discovery/planner LLM prompts should be updated to extract `auctioneer` (leiloeiro) and `court` (vara/tribunal) as separate fields in `PropertyMetadata`. For now, `output_node` will:
- Set `auctioneer` = `court_or_leiloeiro` if it looks like a leiloeiro name (contains "Leilões", "Leiloeiro", etc.), else try to extract from PDF text
- Set `court` = `court_or_leiloeiro` if auction is judicial, else "—"

A cleaner fix (adding separate `auctioneer` and `court` fields to `PropertyMetadata`) is deferred to the beds/baths extraction enhancement.
| `discount` | `MarketResult.discount_percentage` |
| `min_bid` | `PropertyMetadata.auction_price` |
| `market` | `PropertyMetadata.market_value_estimate` or `MarketResult.price_per_m2_neighborhood * area` |
| `roi` | Computed by `scoring_node` |
| `area` | `PropertyMetadata.area_m2` |
| `beds` | `None` (future: extract from edital) |
| `baths` | `None` (future: extract from edital) |
| `parking` | `None` (future: extract from edital) |
| `floor` | `None` (future: extract from edital) |
| `ends_at` | `PropertyMetadata.auction_date` (parsed to ISO 8601) |
| `occupancy` | Mapped from `LegalResult.occupation_status` |
| `risk` | `RiskFlags` computed by `scoring_node` |

## Scoring Node

### New workflow step

**Flow:** `discovery → planner → [market, legal] → scoring → output → END`

The `scoring_node` sits after the parallel market/legal agents and before the output node. It reads `PropertyMetadata`, `MarketResult`, and `LegalResult` from state, and returns a `ScoringResult`.

### `ScoringResult`

```python
class ScoringResult(BaseModel):
    score: int           # 0-100
    risk: RiskFlags
    roi: float           # projected ROI %
```

### Score formula (0-100)

Starting from 50 (neutral):

| Factor | Adjustment |
|---|---|
| Market score (1-10) | `+market_score * 3` |
| Discount % | `+discount_percentage * 0.3` |
| Legal risk: low | `+15` |
| Legal risk: medium | `0` |
| Legal risk: high | `-15` |
| Legal risk: critical | `-30` |
| Occupation: desocupado | `+10` |
| Occupation: ocupado | `-5` |
| Occupation: disputado/posseiro | `-15` |
| Liquidity < 60 days | `+5` |
| Liquidity > 120 days | `-5` |

Clamped to 0-100.

Example: market_score=8, discount=42%, legal=low, desocupado, liquidity=84 days:
50 + 24 + 12.6 + 15 + 10 + 0 = **111.6 → 100**

### Risk flag mapping

| Flag | Source | good | warn | bad |
|---|---|---|---|---|
| j (Jurídico) | `LegalResult.risk_level` | low | medium | high or critical |
| f (Financeiro) | Combined debts | no debts found | minor debts (IPTU only) | significant debts (condominium, federal, multiple) |
| l (Liquidez) | `MarketResult.liquidity_days` | < 60 | 60-120 | > 120 |
| o (Ocupação) | `LegalResult.occupation_status` | desocupado | ocupado | disputado/posseiro/invasor |

**Financeiro logic:**
- good: `tax_debts_iptu` is empty/negligible AND `condominium_debts` is empty/negligible AND `federal_state_debts` is empty
- bad: `condominium_debts` is non-trivial OR `federal_state_debts` is non-trivial OR multiple debt sources
- warn: everything else (e.g. only IPTU mentioned)

### ROI formula

```
fees = min_bid * 0.078  # ITBI ~3% + comissão leiloeiro ~5% + custas ~1%
roi = ((market - (min_bid + reform_estimate + fees)) / (min_bid + reform_estimate + fees)) * 100
```

## Architecture Changes

### New files

| File | Purpose |
|---|---|
| `graph/contracts.py` | `RiskFlags`, `ScoringResult`, `AuctionPropertyResult` Pydantic models |
| `graph/scoring.py` | `scoring_node` — computes score, risk flags, ROI |
| `graph/output.py` | `output_node` — builds `AuctionPropertyResult` from state, returns JSON |

### Modified files

| File | Changes |
|---|---|
| `graph/state.py` | Add `scoring_result: Optional[ScoringResult]` and `result_json: str`. Remove `report_html`. |
| `graph/workflow.py` | New flow: `... → [market, legal] → scoring → output → END`. Remove reporter import. |
| `app.py` | `analyze_url()` and `analyze_pdfs()` return JSON instead of HTML. Remove `_save_report()`. |

### Deleted files

| File | Reason |
|---|---|
| `graph/reporter.py` | Replaced by `scoring.py` + `output.py` |
| `report/generator.py` | No longer generating HTML reports |
| `report/templates/report.html` | No longer generating HTML reports |
| `report/__init__.py` | No longer needed |

### State changes

Before:
```python
@dataclass
class AuctionState:
    ...
    report_html: str = ""
    errors: list[str] = field(default_factory=list)
```

After:
```python
@dataclass
class AuctionState:
    ...
    scoring_result: Optional[ScoringResult] = None
    result_json: str = ""
    errors: list[str] = field(default_factory=list)
```

## App.py changes

`run_analysis()` now returns the full state dict with `result_json`. The Gradio UI changes:

- Output component: `gr.JSON()` instead of `gr.HTML()`
- `analyze_url()` returns parsed JSON (dict) instead of HTML string
- `analyze_pdfs()` same
- `_save_report()` is removed — no more HTML artifacts

## Future work (not in scope)

- Extract `beds/baths/parking/floor` from edital text (enhance planner/discovery prompts)
- Detail tab contracts (Market comparables table, Cost breakdown, Legal findings, Edital text)
- HTTP API endpoint wrapping `run_analysis()`
- Frontend wiring to consume `AuctionPropertyResult` JSON
