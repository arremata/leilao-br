# Frontend — Arremate React SPA

## Overview

React 19 SPA (Vite) for browsing and analyzing Brazilian real estate auctions. Currently displays mock data; integrating with the FastAPI backend.

## Commands

```bash
npm run dev        # dev server with HMR (localhost:5173)
npm run build      # production build to dist/
npm run lint       # eslint
npm run preview    # preview production build
```

## Architecture

### Three-Screen SPA

| Screen | Component | Route Key | Description |
|--------|-----------|-----------|-------------|
| Dashboard | `Home.jsx` | `home` | Hero + stats + top picks + recent activity |
| Feed | `Feed.jsx` | `feed` | Property grid/list with filters |
| Detail | `PropertyDetail.jsx` | `detail` | Full analysis modal with tabs |

Navigation via `go(screen, prop)` in `App.jsx`. Screen and watchlist persist to `localStorage`.

### Files

| File | Purpose |
|------|---------|
| `src/App.jsx` | Root: screen state, API calls, `TopBar` with URL analyzer input |
| `src/main.jsx` | Entry point (React 19 + StrictMode) |
| `src/api.js` | `fetchProperties()` and `analyzeUrl()` — calls proxied via `/api` |
| `src/components/shared.jsx` | Reusable components (`ScoreBadge`, `Countdown`, `Photo`, `Sparkline`, `RiskDots`, `Specs`, `PropertyCard`, `PropertyRow`) + fixtures + helpers (`fmtBRL`, `getEndsAtMs`) |
| `src/components/Home.jsx` | Dashboard screen |
| `src/components/Feed.jsx` | Feed screen with grid/list toggle, filters |
| `src/components/PropertyDetail.jsx` | Property detail with tabs (Viabilidade, Mercado, Encargos, Juridico) |
| `src/styles.css` | Layout primitives, typography, CSS custom properties |

### API Integration

- `GET /api/properties` → array of `AuctionPropertyResult` (proxied to `:8000/properties`)
- `POST /api/analyze` → run pipeline on URL, return `AuctionPropertyResult` (proxied to `:8000/analyze`)
- Vite proxy config in `vite.config.js`: `/api/*` → `http://localhost:8000/*` (strips `/api` prefix)
- App loads properties from API on mount; falls back to fixture data if API is empty/unavailable

## Data Model

Each property matches the `AuctionPropertyResult` shape from the backend (`backend/graph/contracts.py`):

```js
{
  id, score,           // 0-100
  photoLabel, title, address, type, neighborhood, city,
  auctionType, auctioneer, court,
  discount,            // percentage
  minBid, market,      // raw BRL numbers — format with fmtBRL()
  roi,                 // projected ROI %
  area, beds, baths, parking, floor,
  endsAt,              // ISO 8601 string — convert with getEndsAtMs()
  occupancy,           // "desocupado" | "ocupado" | "disputado"
  risk: { j, f, l, o } // "good" | "warn" | "bad"
}
```

## Key Conventions

- **ES module imports/exports** — no `window` globals
- **Named exports** for all components
- **Monetary values**: raw BRL numbers from backend; `fmtBRL()` formats at render time
- **Dates**: `getEndsAtMs()` converts `endsAt` (ISO string or epoch ms) to epoch ms for `Countdown`
- **Colors**: oklch with CSS custom properties — `--good`/`--warn`/`--bad` for risk, `--accent` for primary actions
- **Styling**: mostly inline `style` objects; `styles.css` handles layout primitives, typography, reusable patterns
- **Language**: Brazilian Portuguese (pt-BR) throughout the UI
- **No router**: screen state managed in `App.jsx`, persisted to `localStorage` (`arremate_screen`)
