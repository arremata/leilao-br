# Backend — Arremate AI Pipeline & API

## Overview

Python backend: LangGraph AI pipeline for auction property analysis + FastAPI server exposing it to the frontend. Located in `backend/`.

## Commands

```bash
# Run API server (port 8000) — must run from backend/ so imports + .env resolve
cd backend && python api.py
# or from project root
./run-backend.sh

# Run tests — from backend/ so bare imports work
cd backend && python -m pytest tests/ -v

# Install deps — from project root (.venv lives there)
pip install -r backend/requirements.txt
playwright install chromium

# Both backend + frontend
./dev.sh
```

## Architecture

All paths below are relative to `backend/`.

### LangGraph Pipeline (`graph/`)

```
discovery → planner → [market, legal] (parallel) → scoring → output
```

| File | Node | LLM? | Purpose |
|------|------|------|---------|
| `discovery.py` | discovery | Claude Sonnet 4.6 | Scrape auction URL, extract metadata, find/download PDFs |
| `planner.py` | planner | Claude Opus 4.6 | Parse PDFs, build research plan |
| `market.py` | market | GPT-5.4 | Market prices, comparables, appreciation, liquidity |
| `legal.py` | legal | Claude Sonnet 4.6 | Legal risks: liens, debts, disputes, zoning, occupation |
| `scoring.py` | scoring | No (rule-based) | Compute score 0-100, risk flags, ROI |
| `output.py` | output | No (rule-based) | Build `AuctionPropertyResult` JSON |
| `workflow.py` | — | — | Assembles and compiles the LangGraph StateGraph |
| `state.py` | — | — | `AuctionState` dataclass + `PropertyMetadata`, `MarketResult`, `LegalResult` |
| `contracts.py` | — | — | `AuctionPropertyResult`, `ScoringResult`, `RiskFlags` Pydantic models |

### FastAPI Server (`api.py`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/properties` | GET | Return all previously analyzed properties from `data/results.json` |
| `/analyze` | POST | Run full pipeline on a URL or pdf_texts, persist result, return `AuctionPropertyResult` |

CORS allows `http://localhost:5173` (Vite dev server).

### Tools (`tools/`)

| File | Purpose |
|------|---------|
| `web_scraper.py` | Playwright + stealth: scrape auction pages, extract dynamic PDF URLs |
| `pdf_downloader.py` | Download PDFs from URLs |
| `pdf_parser.py` | PyMuPDF text extraction, pytesseract OCR fallback |
| `web_search.py` | Tavily API wrapper with retry logic |
| `property_scraper.py` | Playwright scraper for Zap Imoveis comparables |

## Data Contract

`graph/contracts.py` defines `AuctionPropertyResult` — the **single source of truth** for what the frontend consumes. It serializes to camelCase JSON (`by_alias=True`). Any field added/changed here must be reflected in the frontend.

## Key Conventions

- **Working directory**: Always run Python from `backend/` so bare imports (`from graph.state import ...`) and `.env` resolution work
- **State**: `AuctionState` dataclass in `state.py` — all nodes read/write to this
- **Results**: Nodes return `dict` patches (LangGraph merges into state)
- **LLM calls**: All via `litellm.completion()` with `api_base` from `config.py`
- **Config**: `config.py` reads `OPENROUTER_API_KEY` and `TAVILY_API_KEY` from `.env` (relative to CWD)
- **Scoring**: Rule-based algorithm (no LLM) — starts at 50, adjusts by market score, discount, legal risk, occupancy, liquidity
- **ROI**: `(market_value - total_cost) / total_cost * 100`, where total_cost = min_bid + reform + 7.8% fees
- **Persistence**: JSON file (`data/results.json`), no database yet
- **Tests**: `tests/` — unit tests per node, fixtures in `tests/fixtures/`
- **conftest.py**: Empty file at `backend/conftest.py` ensures pytest adds `backend/` to `sys.path`
