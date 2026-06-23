# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Arremate** — a Brazilian real estate auction intelligence platform. Unified project with:
- **Backend** (`../backend/`): Python LangGraph AI agents + FastAPI API on port 8000
- **Frontend** (`./`): React 19 SPA (Vite) on port 5173, responsive PWA
- **Vercel** (`../vercel-backend/`): Serverless deployment with synced seed.json

## Commands

### Backend (from project root)
```bash
./run-backend.sh       # start FastAPI on :8000
.venv/bin/python api.py  # same, directly
```

### Frontend (from this folder)
```bash
npm run dev          # dev server with HMR (localhost:5173)
npm run build        # production build to dist/
npm run lint         # eslint
npm run preview      # preview production build
```

### Both at once (from project root)
```bash
./dev.sh             # starts backend + frontend together
```

## Architecture

- **ES module imports/exports** — no `window` globals
- Components in `src/components/` with named exports
- Entry point: `src/main.jsx` → `src/App.jsx`
- React 19 + StrictMode
- Five-screen SPA: `home`/`feed`/`detail`/`watchlist`/`history`, driven by `go(screen, prop)` in `App.jsx`
- Screen and watchlist persist to `localStorage` (keys: `arremate_screen`, `arremate_watched`)

### Data model

Properties come from `GET /api/properties` (backend). On load, App.jsx fetches them. Each property: `id`, `score` (0-100), auction metadata (`auctionType` = Judicial/Extrajudicial, `praca` = 1ª praça/2ª praça or null, `modalidade` = Licitação aberta/Venda direta, `auctioneer`, `court`), pricing (`minBid`, `market` as raw BRL numbers, `discount`, `roi`), specs (`area`, `beds`, `baths`, `parking`, `floor`), `endsAt` (ISO 8601 string), `occupancy`, `risk` flags (`j`/`f`/`l`/`o`), `photoUrl`, `auctionUrl`. The `market` field reflects real comparable sales, not just the auction appraisal. `discount` can be negative (bid above market).

### API integration

- `GET /properties` → list of saved `AuctionPropertyResult` objects (proxied via Vite `/api`)
- `POST /analyze` → run full pipeline, returns `AuctionPropertyResult` JSON
- Vite proxy: `/api/*` → `http://localhost:8000/*` (strips `/api` prefix)

## Key conventions

- All monetary values are raw BRL numbers from backend; `fmtBRL()` formats at render time
- `getEndsAtMs()` converts `endsAt` (ISO string or number) to epoch ms for `Countdown`
- Color system uses oklch with CSS custom properties: `--good`/`--warn`/`--bad` for risk, `--accent` for primary actions
- Styling is mostly inline `style` objects; `src/styles.css` handles layout primitives, typography, and reusable patterns
- Language is Brazilian Portuguese (pt-BR) throughout the UI
