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

- **2026-08-15** — Added a persisted city/type median fallback when an exact neighborhood market reference is unavailable, while continuing to avoid live browsing and invented appraisal-based market estimates.
- **2026-08-15** — Made persisted-reference analysis self-contained in the Vercel function, removing cross-directory worker imports that crashed every production catalog request during module startup.
- **2026-08-15** — Fixed the Vercel serverless bundle to include the shared deterministic analyzer, preventing catalog startup failures after persisted-reference analysis was enabled.
- **2026-08-15** — Enabled on-demand Vercel analyses using only persisted regional price/m² references and their cached comparables; results are deterministically calculated and upserted without web navigation or LLM calls.

Every meaningful change to the project should be recorded here with a brief description.

- **2026-08-12** — Added scheduled analysis materialization after regional market refreshes. Eligible catalog properties are calculated from persisted comparables and stored once in the shared `enrichments` table, allowing the read-only Vercel detail API to serve analysis to every user without running work during page loads.
- **2026-08-12** — Removed the fictitious dashboard activity feed, which referenced out-of-catalog SP properties and a nonexistent active 2ª-praça case. The activity section now renders only when real activity data exists.
- **2026-08-12** — Made Feed facets context-aware: filters with no meaningful choice are hidden, Praça disappears for non-SFI modalities, changing modality clears stale praça state, and Cidade remains independently selectable without requiring Estado. A production audit confirmed no active 2ª-praça listings: all 210 active SFI rows precede their first auction; 89 older SFI rows are removed.
- **2026-08-12** — Repaired the remaining Feed filters: Caixa modalities now expose evidence-based Extrajudicial type and current SFI praça, property type/modality options come from live data, no-date auctions sort last, and the mixed estimated/official discount fallback is labeled accurately as “Desconto disponível”. Unknown future modalities remain unclassified rather than guessed.
- **2026-08-12** — Audited the Feed filters against all 604 production catalog rows. Added data-driven, normalized cascading Estado → Cidade filters that currently expose PR and its 91 cities and automatically support future UFs. Documented remaining contract mismatches in auction type, praça, modality, and no-date sorting for the next iteration.
- **2026-08-12** — Removed the cramped “Ver” action from history rows. The complete row is now the accessible click target, with hover/focus background and a violet edge indicator, freeing space and preventing clipping on smaller screens.
- **2026-08-12** — Improved history-table spacing for monetary data. Bid, appraisal, and estimated-market columns now have dedicated minimum widths, wider gutters, responsive numeric sizing, and a compact desktop/tablet layout that prevents large BRL values from colliding.
- **2026-08-12** — Removed pre-authentication user fiction from the product: personalized greeting, GD avatar, account menu, logout action, fake identity data, and possessive account wording. Watchlist remains explicitly local to the browser and continues to persist without login.
- **2026-08-12** — Changed initial navigation to always open the populated Dashboard instead of restoring a stale Feed screen. The app now waits for catalog and dashboard requests behind an explicit loading state before rendering the first page; explicit URL screen parameters remain supported.
- **2026-08-12** — Fixed guest Watchlist persistence across refreshes. Temporary empty/failed catalog responses no longer erase locally saved property IDs, and malformed local storage safely falls back to an empty list. This local-first behavior is ready for future account synchronization.
- **2026-08-12** — Fixed history analysis statuses and row responsiveness. History rows now load persisted enrichment before deciding whether analysis is pending, distinguish completed analyses without a market reference, and reserve a responsive column that keeps the “Ver” action inside the card.
- **2026-08-12** — Audited and repaired History: entries now hydrate from the live catalog, missing snapshot fields no longer render as undefined/NaN, obsolete ROI was replaced with appraisal and market status, stored data is validated, rows support keyboard navigation, and the mobile grid matches the actual row structure.
- **2026-08-12** — Fixed missing values in the dashboard's latest-property card. Historical entries are now hydrated from the current catalog and persisted enrichment, future history snapshots retain all pricing fields, and genuinely unavailable appraisal/market values render as dashes instead of zero or `undefined%`.
- **2026-08-12** — Marked CSV export consistently as an upcoming feature with a disabled action, inline “Em breve” status, and short availability tooltip.
- **2026-08-12** — Removed the unreliable estimated-average-discount summary from the feed results header. The header now reports only the official average discount derived from auction appraisal data.
- **2026-08-12** — Standardized every BRL amount in the frontend to two decimal places, including whole-number appraisals, market estimates, costs, totals, monthly expenses, and per-square-meter references.
- **2026-08-12** — Disabled automated comparable-market estimates for terrenos, lotes, and glebas. The pipeline no longer extrapolates neighborhood price/m² across land area, the reference worker skips those property types, and stale persisted land estimates are suppressed by the catalog API.
- **2026-08-12** — Made the financial-viability cost table resilient to large monetary values. Value columns now expand responsively, numeric typography scales within safe bounds, and long totals no longer clip at desktop, tablet, or mobile widths.
- **2026-08-12** — Consolidated the duplicate Costs and Financial Viability navigation. Tab 02 is now “Viabilidade financeira”; the old tab 03 was removed, and Edital/Jurídico were renumbered to 03/04.
- **2026-08-12** — Fixed auction dates disappearing after opening a catalog card. Detail enrichment can no longer overwrite valid catalog `endsAt`/auction dates with empty legacy values, keeping countdowns consistent between feed and detail.
- **2026-08-12** — Recalibrated renovation intensity presets to 0% without renovation, 15% light, 50% intermediate, and 100% complete. Percentages now represent only slider intensity; light renovation returned to the area-scaled R$ 8–12k estimate.
- **2026-08-12** — Changed the light-renovation preset to 15% of the property's estimated market value, falling back to official appraisal and then minimum bid when necessary. Land and the “Sem reforma” position remain at zero.
- **2026-08-12** — Corrected the renovation simulator scale: the far-left/default position now means “Sem reforma” and costs R$ 0. The R$ 8–12k light-renovation estimate moved to its own preset at 25%, followed by intermediate and complete scenarios.
- **2026-08-12** — Removed the unpopulated “Dados do leilão” section from property details, including its empty auctioneer, court, process, and registration fields.
- **2026-08-12** — Updated the disabled analysis-export action with a compact sparkle symbol, an inline “Em breve” status, and a short availability tooltip.
- **2026-08-12** — Removed the remaining financial-risk status badges and all user-facing “IA” chips/wording. Market values and discounts are now presented neutrally as estimates without changing their underlying calculations.
- **2026-08-12** — Restored the prominent “Acessar leilão” action on property details. Catalog responses now expose the official listing consistently as `auctionUrl`, with frontend compatibility for the legacy `detailUrl` field.
- **2026-08-12** — Removed legal-risk badges and the paid legal-assistant control from the current UI. Replaced the former premium legal card with a neutral “Em breve” state while keeping the Jurídico tab visible.
- **2026-08-12** — Revised renovation defaults: land now always has zero renovation cost, while houses and apartments start with a light R$ 8–12k allowance scaled by area. Market references now reject probable auction-publicity duplicates and materially mismatched areas. Added an embedded Google Maps location preview and direct link to the market tab.
- **2026-08-10** — Added production-safe analysis capability signaling: the full backend advertises on-demand analysis while the read-only Vercel backend disables the unavailable action. Unanalyzed catalog cards now show explicit pending states and use official discounts for feed ranking. Market-reference scheduled runs now fail visibly when selected work produces no persisted references.
- **2026-08-10** — Hardened comparable-source validation: fixed QuintoAndar listing URLs, rejected generic ImovelWeb links and incomplete/implausible cards before caching, and made Chaves na Mão navigation resilient to never-idle advertising requests. Live checks now distinguish valid sources from Cloudflare-blocked sources.
- **2026-08-10** — Removed Playwright and listing-site scraping from user-triggered analysis. The request path now reads only the persisted neighborhood price/m² reference; a separate daily/manual GitHub Actions worker refreshes up to 10 missing or 90-day-stale regional references.
- **2026-08-10** — Removed fixture seeds from both backends. Added `npm run dev:prod`, which runs the local frontend and full backend against the configured production database, including on-demand analysis and ingestion endpoints.
- **2026-08-09** — Removed the global URL analyzer and replaced catalog market LLM enrichment with a token-free calculator based on the median price/m² of scraped listings, backed by a persisted neighborhood reference. Removed liquidity, occupancy and price-trend features, stopped inventing payment/modality/registration values, made ITBI municipal and source-backed, and only includes commission when the official description states a percentage.

- **2026-08-06** — Added Caixa's official `Valor de avaliação` to the property-detail pricing panel, keeping it distinct from both the 1ª praça/minimum sale price and the AI comparable-market estimate.
- **2026-08-06** — Removed the default 50-page auction-date enrichment cap. Production ingestion now processes every eligible Leilão SFI detail page in the run while retaining one-request-per-second pacing, bounded concurrency, retries, and the consecutive-429 circuit breaker. `--date-limit` remains available for controlled smoke runs.
- **2026-08-06** — Added fresh-session recovery passes for Caixa detail pages that transiently return HTTP 200 without auction content. Only failed URLs are retried after a cooldown, and warnings are emitted only after all recovery passes are exhausted.
- **2026-08-06** — Added Caixa `Licitação Aberta` date ingestion. Its single scheduled date is parsed from the detail page into `first_auction_at`/`endsAt`; unlike Leilão SFI, it does not require separate praça prices to count as successfully refreshed.
- **2026-07-29** — Added a daily/manual GitHub Actions workflow for the Caixa ingestion worker, with isolated staging/production environments, configurable UFs, optional limits/geocoding, Xvfb-backed Chrome, concurrency protection, and failure summaries. Manual runs default to staging, scheduled runs target production, and the worker exits nonzero when any UF fails so scheduled runs cannot report false success.
- **2026-07-29** — Added Caixa auction-date and praça-price ingestion. Leilão SFI detail pages are fetched concurrently with Chrome TLS impersonation; both 1º/2º leilão dates and minimum prices are parsed and cached for 24 hours, independently from appraisal/current CSV price. Failures retry without aborting CSV ingestion, existing databases receive compatibility columns on startup, and catalog cards expose/render both praças plus the next auction as `endsAt`.
- **2026-07-29** — Connected the lightweight Vercel backend to Supabase for read-only `GET /catalog` and `GET /catalog/{id}` endpoints, keeping the heavy ingestion and AI pipeline outside serverless functions.
- **2026-07-29** — Rate-limited Caixa detail-date enrichment after the full PR staging run exposed HTTP 429 responses under burst concurrency. Detail requests now start at most once per second with two in flight and conservative retry backoff; catalog/photo persistence remains independent of date enrichment.
- **2026-08-06** — Capped auction-date enrichment at 50 detail pages per UF/run and added a circuit breaker after three consecutive HTTP 429 responses. Excess work remains retryable on later runs. Temporarily disabled the ingestion cron for controlled production smoke/full imports.
- **2026-08-06** — Completed the controlled production rollout: 10-property smoke run succeeded, followed by a full PR import (711 new, 10 existing, 50 dates enriched, 0 date failures, 248 dates deferred). Enabled daily production ingestion at 08:17 UTC / 05:17 Brasília time.
- **2026-08-06** — Prioritized never-enriched auction dates ahead of TTL refreshes so the 50-page daily cap progresses through the complete catalog fairly.

- **2026-05-14** — Extended `AuctionPropertyResult` with detail objects (`viability`, `marketDetail`, `costs`, `edital`). Created seed data (`backend/data/seed.json`) with 3 demo properties. Frontend now reads all detail tab data from the property object instead of hardcoded values. Removed non-seeded fixture properties (p2, p4, p6, p7, p8). App starts with empty state and populates exclusively from the API.
- **2026-06-22** — Frontend fixes: split `auctionType` into three fields (`auctionType` = Judicial/Extrajudicial, `praca` = 1ª/2ª praça, `modalidade` = Licitação aberta/Venda direta) fixing broken Feed filters. Unified "Dar lance" + "Edital PDF" into single "Acessar leilão" CTA. Removed non-functional buttons (Ver todas, Salvar busca, Abrir no tribunal, Payback). Renamed "IA jurídica" → "Assistente jurídico". Fixed renovation cost slider to use property-specific base from seed costs. Fixed Matrícula field to read from viability features. Implemented real pagination in Feed. Added user avatar dropdown menu. Disabled future-feature buttons (Exportar análise, Exportar CSV, Configurar alertas) with "Em breve" tooltip. Created `FUTURE_FEATURES.md` with specs.
- **2026-05-29** — Demo prep: replaced old mock entries (p1, p3, p5) with 3 real auctions (a1, a2, a3) scraped from Caixa and leilaoimovel.com.br. Added real property photos (`frontend/public/photos/`). Updated `Photo` component to support `photoUrl`. Merged `deploy/vercel-setup` branch (responsive PWA, watchlist, history, card UI overhaul). Enriched market data with real comparables from ImovelWeb, Santamérica, Arbo, Cruciol, Perfeito Imóveis etc. Updated `market` field to reflect real comparable sales (not just appraisal). Backend port is 8000. Added Vercel deployment (`vercel-backend/`). Properties: a1 (Curitiba, score 48, bad deal), a2 (Londrina Jd. Santa Cruz, score 76, decent), a3 (Londrina Farid Libos, score 71, good discount but occupied).
