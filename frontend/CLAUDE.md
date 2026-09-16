# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Argos** — helps people buying a home to live in navigate Caixa auction and direct-sale listings. Unified project with:
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
- Routed with `react-router-dom`: `/`, `/imovel/:id`, `/salvos`, `/vistos`; unknown paths
  redirect to `/`. The visible labels are Imóveis / Salvos / Vistos.
- Feed state (tab, search, filters, sort, view, page) lives in the query string, so back
  from a property restores the same search. Defaults are omitted from the URL.
- Property cards are real `<a>` elements (`usePropertyLink`): new tab on desktop, same tab
  on touch, decided by `matchMedia('(pointer: coarse)')`. Middle-click and cmd-click work
  for free — do not replace them with `onClick` handlers.
- `vercel.json` must list every app route explicitly. A catch-all rewrite would risk
  swallowing `/assets/*`, `/sw.js` and `/manifest.webmanifest`.
- Watchlist and history persist to `localStorage` (keys: `arremate_watched`,
  `arremate_history`). Those keys are deliberately unchanged despite the Argos rename:
  renaming them would silently erase saved properties for existing users.

### Data model

Properties come from `GET /api/properties` (backend). On load, App.jsx fetches them. Each property: `id`, auction metadata (`auctionType` = Judicial/Extrajudicial, `praca` = 1ª praça/2ª praça or null, `modalidade` = Licitação aberta/Venda direta, `auctioneer`, `court`), pricing (`minBid`, `market` as raw BRL numbers, `discount`, `roi`), specs (`area`, `beds`), `endsAt` (ISO 8601 string), `photoUrl`, `auctionUrl`. The `market` field reflects real comparable sales, not just the auction appraisal. `discount` can be negative (bid above market).

Fields the backend does NOT provide, despite older documentation: there is no top-level
`occupancy` (it exists only as free text inside `editalData`, on the detail endpoint), and
no `risk` flags — `l`/`o` never existed in the contract, and `j`/`f` are no longer published
because they were a constant, not a computed verdict. `baths`, `parking` and `floor` are
declared in the contract but never populated, so they cannot back a filter.

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
