# Arremate — Project Vision & Architecture

## Product Vision

**Arremate** is a demo of a future Brazilian real estate auction intelligence platform. The goal is to map all real estate auctions in Brazil and provide AI-powered analysis that makes auction investing accessible and safer. Properties are sold at 30-70% below market value but carry complex legal risks — Arremate automates the research that today takes a full day and R$ 200-800 in legal fees into a 3-minute analysis.

## Current Status: Demo Ready

The platform is demo-ready with 3 real Brazilian auction properties, real property photos, real market data (comparables, price/m² trends), and a responsive PWA frontend. Backend serves seed data via FastAPI; frontend consumes it. Deployed to Vercel (frontend + serverless backend).

```
leilao/
├── backend/                 # Python — API + AI pipeline
│   ├── api.py               # FastAPI server (port 8000)
│   ├── app.py               # Gradio UI (legacy)
│   ├── analyze.py           # CLI entry point
│   ├── config.py            # Settings (LiteLLM proxy key)
│   ├── graph/               # LangGraph agent pipeline
│   │   └── contracts.py     # Pydantic data contract (AuctionPropertyResult)
│   ├── tools/               # Web scraper, PDF parser, search, property scraper
│   ├── tests/               # pytest suite
│   ├── data/                # seed.json + results.json persistence
│   ├── requirements.txt
│   └── .env
├── frontend/                # React 19 SPA (Vite, port 5173)
│   └── public/photos/       # Real auction property photos
├── vercel-backend/          # Vercel serverless backend (synced seed.json)
├── docs/                    # Design docs and plans
├── .venv/                   # Python virtual environment
└── Makefile, dev.sh         # Dev scripts
```

```
┌─────────────────────────────────────────────┐
│           Frontend (React SPA)               │
│  Home · Feed · PropertyDetail                │
│  Backend-driven data (seed + live analysis)   │
└──────────────────────┬──────────────────────┘
                       │  /api/* (Vite proxy → :8000)
┌──────────────────────┴──────────────────────┐
│           API Server (FastAPI)                │
│  GET /properties  ·  POST /analyze           │
│  JSON file persistence (data/results.json)    │
│  Seed data loaded on startup (data/seed.json) │
└──────────────────────┬──────────────────────┘
                       │
┌──────────────────────┴──────────────────────┐
│         AI Agent Pipeline (LangGraph)         │
│  Discovery → Planner → [Market, Legal]        │
│  → Scoring → Output                          │
└──────────────────────────────────────────────┘
```

## AI Agent Pipeline

The core intelligence — currently a standalone script, will become the backend service.

### Agents

| Agent | Model (via litellm proxy) | Purpose |
|-------|---------------------------|---------|
| Discovery | `openai/claude-sonnet-4.6` | Scrape auction URL, extract metadata + PDF links, download + parse PDFs |
| Planner | `openai/claude-opus-4.6` | Extract property metadata from PDFs, create research plan |
| Market Analyst | `openai/gpt-5.4` | Research market prices, comparables, appreciation, liquidity, tendencies |
| Legal Analyst | `openai/claude-sonnet-4.6` | Assess legal risks: liens, debts, judicial disputes, zoning, permits, occupation |
| Scoring | (rule-based, no LLM) | Compute 0-100 score, risk flags (J/F/L/O), projected ROI |
| Output | (rule-based, no LLM) | Build `AuctionPropertyResult` JSON for frontend consumption |

### Workflow

```
URL → Discovery → Planner → [Market (parallel), Legal (parallel)] → Scoring → Output → JSON
```

### Tools

- **Web Scraper** (Playwright with stealth) — scrapes auction listing pages
- **PDF Downloader** — downloads PDFs from extracted URLs
- **PDF Parser** (PyMuPDF + pytesseract OCR fallback) — extracts text from edital PDFs
- **Property Scraper** (Playwright) — scrapes Zap Imoveis for comparables

## Data Contract

The `AuctionPropertyResult` Pydantic model (`backend/graph/contracts.py`) is the single source of truth for the frontend shape. It serializes to camelCase JSON matching what the React components expect.

Key fields: `id`, `score` (0-100), `minBid`, `market`, `discount`, `roi`, `risk` (J/F/L/O flags), `occupancy`, `endsAt`, `auctionType` (Judicial/Extrajudicial), `praca` (1ª praça/2ª praça or null), `modalidade` (Licitação aberta/Venda direta), `auctioneer`, `court`, `photoUrl`, `auctionUrl`, plus optional detail objects: `viability` (risk dimensions, alerts, description, features), `marketDetail` (indicators, trend, comparables), `costs` (line items), `edital` (process, creditor, liens, payment terms).

Frontend starts with an empty property list and populates exclusively from `GET /properties`. Seed data (`backend/data/seed.json`) loads into `results.json` on API startup via `_merge_seed()`, providing 3 real auction properties (a1, a2, a3).

**Important:** `market` field should reflect real comparable sales data, not just the official auction appraisal. `discount` and `roi` derive from the gap between `minBid` and `market`. When updating seed data, always sync to `vercel-backend/seed.json` and clear `backend/data/results.json`.

## Competitors

- **ProLeilão** (proleilao.com.br): Auction aggregation, basic property data, no AI analysis
- **SpyLeilões** (app.spyleiloes.com.br): Auction aggregation with map view, pricing data, no AI analysis
- **Smart Leilões**: Auction aggregation, no AI analysis

## Future Product (from general_context.md)

The full platform will include:
- **Feed**: 3-column grid with real photos, score badges, countdown, filters (praca, type, occupancy, score, city)
- **Analysis Modal**: 4 tabs (Viabilidade, Mercado, Encargos, Juridico)
- **Fiscal Tables**: ITBI by municipality (13 cities), emolumentos by state (IRIB table)
- **Investor Profile**: Onboarding quiz, personalized feed
- **Monetization**: Free (3/mo), Essencial R$97, Pro R$197, Expert R$490, Escritorio R$790/mo
- **Legal Analysis**: Premium R$197 per property, lawyer review with ONR/DataJud

## Roadmap

### Phase 1 - Demo (Current)
- AI agent pipeline with LangGraph
- FastAPI backend with JSON file persistence
- React SPA with backend-driven data (seed + live analysis)
- URL input → full analysis → property card in feed

### Phase 2 - Live Aggregation
- Scheduled scraper for major auctioneers (Mega Leiloes, Zuk, Sold, CEF, BB, etc.)
- Property images from listings
- Database (PostgreSQL) replacing JSON file
- User authentication

### Phase 3 - Full Platform
- Map view with Airbnb-style filters
- Investor profile and onboarding
- ITBI/emolumentos calculators per city/state
- Watchlist, alerts, batch analysis
- Subscription tiers and credit system

## Tech Stack

| Component | Current | Future |
|-----------|---------|--------|
| Language | Python 3.12+ | Python 3.12+ |
| Agent Framework | LangGraph | LangGraph |
| LLM Access | LiteLLM + Proxy | LiteLLM + Proxy |
| LLM - Discovery | Claude Sonnet 4.6 | Claude Sonnet |
| LLM - Planner | Claude Opus 4.6 | Claude Opus |
| LLM - Legal | Claude Sonnet 4.6 | Claude Sonnet |
| LLM - Market | GPT-5.4 | GPT-5.4 |
| API | FastAPI | FastAPI |
| Frontend | React 19 + Vite | React + Mapbox |
| PDF Parsing | PyMuPDF | PyMuPDF |
| Market research | Direct listing scrapers | Direct listing scrapers |
| Web Scraping | Playwright | Playwright + Scrapy |
| Persistence | JSON file | PostgreSQL |
| Deployment | Local | Docker + AWS/GCP |

## Changelog

Every meaningful change to the project should be recorded here with a brief description.

- **2026-07-29** — Added a daily/manual GitHub Actions workflow for the Caixa ingestion worker, with isolated staging/production environments, configurable UFs, optional limits/geocoding, Xvfb-backed Chrome, concurrency protection, and failure summaries. Manual runs default to staging, scheduled runs target production, and the worker exits nonzero when any UF fails so scheduled runs cannot report false success.
- **2026-07-29** — Added Caixa auction-date and praça-price ingestion. Leilão SFI detail pages are fetched concurrently with Chrome TLS impersonation; both 1º/2º leilão dates and minimum prices are parsed and cached for 24 hours, independently from appraisal/current CSV price. Failures retry without aborting CSV ingestion, existing databases receive compatibility columns on startup, and catalog cards expose/render both praças plus the next auction as `endsAt`.
- **2026-07-29** — Connected the lightweight Vercel backend to Supabase for read-only `GET /catalog` and `GET /catalog/{id}` endpoints, keeping the heavy ingestion and AI pipeline outside serverless functions.

- **2026-05-14** — Extended `AuctionPropertyResult` with detail objects (`viability`, `marketDetail`, `costs`, `edital`). Created seed data (`backend/data/seed.json`) with 3 demo properties. Frontend now reads all detail tab data from the property object instead of hardcoded values. Removed non-seeded fixture properties (p2, p4, p6, p7, p8). App starts with empty state and populates exclusively from the API.
- **2026-06-22** — Frontend fixes: split `auctionType` into three fields (`auctionType` = Judicial/Extrajudicial, `praca` = 1ª/2ª praça, `modalidade` = Licitação aberta/Venda direta) fixing broken Feed filters. Unified "Dar lance" + "Edital PDF" into single "Acessar leilão" CTA. Removed non-functional buttons (Ver todas, Salvar busca, Abrir no tribunal, Payback). Renamed "IA jurídica" → "Assistente jurídico". Fixed renovation cost slider to use property-specific base from seed costs. Fixed Matrícula field to read from viability features. Implemented real pagination in Feed. Added user avatar dropdown menu. Disabled future-feature buttons (Exportar análise, Exportar CSV, Configurar alertas) with "Em breve" tooltip. Created `FUTURE_FEATURES.md` with specs.
- **2026-05-29** — Demo prep: replaced old mock entries (p1, p3, p5) with 3 real auctions (a1, a2, a3) scraped from Caixa and leilaoimovel.com.br. Added real property photos (`frontend/public/photos/`). Updated `Photo` component to support `photoUrl`. Merged `deploy/vercel-setup` branch (responsive PWA, watchlist, history, card UI overhaul). Enriched market data with real comparables from ImovelWeb, Santamérica, Arbo, Cruciol, Perfeito Imóveis etc. Updated `market` field to reflect real comparable sales (not just appraisal). Backend port is 8000. Added Vercel deployment (`vercel-backend/`). Properties: a1 (Curitiba, score 48, bad deal), a2 (Londrina Jd. Santa Cruz, score 76, decent), a3 (Londrina Farid Libos, score 71, good discount but occupied).
