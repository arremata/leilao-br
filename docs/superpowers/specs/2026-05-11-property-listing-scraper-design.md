# Property Listing Scraper Design

## Problem

The market analysis agent relies on Tavily web search to find comparable property listings. Tavily returns shallow snippets, not structured data, so the LLM must interpret vague text — leading to imprecise comps and unreliable price/m² estimates.

## Solution

Add Playwright-based scrapers for the four major Brazilian listing sites (ZAP Imóveis, Viva Real, QuintoAndar, Chaves na Mão) that extract structured comparable property data directly from listing pages. Scrapers run first; Tavily is the fallback when scrapers fail or return insufficient data.

## Architecture

```
market.py
  └── _run_market_searches()
        ├── scrape_comparables(metadata)      ← NEW
        │     ├── scrape_zap(page, metadata)
        │     ├── scrape_vivareal(page, metadata)
        │     ├── scrape_quintoandar(page, metadata)
        │     └── scrape_chavesnamao(page, metadata)
        │
        └── web_search_multiple(queries)      ← EXISTING (fallback)
```

### New file: `tools/property_scraper.py`

One async function per site, plus a dispatcher:

- `scrape_comparables(metadata) -> list[ComparableProperty]` — dispatcher that manages the browser lifecycle and calls site-specific scrapers sequentially.
- `scrape_zap(page, metadata) -> list[ComparableProperty]`
- `scrape_vivareal(page, metadata) -> list[ComparableProperty]`
- `scrape_quintoandar(page, metadata) -> list[ComparableProperty]`
- `scrape_chavesnamao(page, metadata) -> list[ComparableProperty]`

### Key design decisions

- **Sequential, not parallel** — avoids triggering anti-bot rate limits across sites.
- **Single browser instance** — launched once per `scrape_comparables` call, shared across all site scrapers, closed after.
- **Early return** — dispatcher stops after any scraper returns ≥3 comparable properties.
- **Silent failures** — each scraper returns an empty list on any error (blocked, timeout, no results). No exceptions propagated.
- **Existing dataclass** — scrapers return `ComparableProperty` objects (already defined in `graph/state.py`).

## Per-site scraper behavior

Each scraper follows the same pattern:

1. Build search URL from `metadata.neighborhood`, `metadata.city`, `metadata.state`
2. Navigate with Playwright, wait for listing cards (timeout: 10s)
3. Extract: price, area, address, price/m², source URL
4. Return up to 5 comparable properties
5. On failure: return empty list

### URL patterns

| Site | URL template |
|---|---|
| ZAP Imóveis | `zapimoveis.com.br/venda/imoveis/{state}+{city}+{neighborhood}/` |
| Viva Real | `vivareal.com.br/venda/imoveis/{state}+{city}+{neighborhood}/` |
| QuintoAndar | `quintoandar.com.br/comprar/imovel/{state}/{city}/{neighborhood}/` |
| Chaves na Mão | `chavesnamao.com.br/imoveis/{state}/{city}/{neighborhood}/venda/` |

### Selector strategy

- Prioritize `data-cy` and `data-testid` attributes (more stable across deploys).
- Fall back to class-name patterns.
- Each site's selectors defined as a dict constant at the top of `property_scraper.py` for easy maintenance.
- Selectors will be validated by running the scrapers against live pages during development; the initial set is based on public scraping references.

### Anti-bot measures

- Playwright stealth patches (hiding `navigator.webdriver`, patching fingerprinting)
- Realistic user-agent header
- Chromium new headless mode (`headless=True` uses the newer, harder-to-detect mode)
- Random 1-3 second delay between each site scraper

**Acceptance:** ZAP and Viva Real will sometimes block us. This is expected and handled by the Tavily fallback.

## Integration with market agent

Changes to `graph/market.py`:

1. Import `scrape_comparables` from `tools.property_scraper`
2. In `_run_market_searches`, call `scrape_comparables(metadata)` first
3. If ≥3 comps returned, skip Tavily searches for comparable queries (keep appreciation/reform Tavily searches)
4. If <3 comps, fall back to full Tavily searches as before
5. The LLM call (`_call_market_llm`) remains unchanged — it receives the same type of input and produces the same `MarketResult`

The `scrape_comparables` results are converted to search-result-like text (one line per comp: address, price, area, price/m², source, URL) and prepended to the search text sent to the LLM.

## New dependency

- `playwright-stealth` (or equivalent manual stealth patches) — Playwright is already in `requirements.txt`

## Error handling

- Scraper blocked/timeout → return empty list, log warning
- Scraper returns 0 results → same as blocked
- All scrapers fail → Tavily runs as before (no behavior change from current system)
- Partial success (1-2 comps from scrapers) → merge with Tavily results
