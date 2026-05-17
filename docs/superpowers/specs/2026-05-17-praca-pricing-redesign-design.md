# Simplified Praça Pricing — Design

**Date:** 2026-05-17

## Problem

The current PricingGrid component uses toggle buttons (1ª praça / 2ª praça) that switch between prices, hiding one at a time. The avaliação and desconto fields in the pricing section belong in the market tab, not in the pricing element. The market tab also has the same toggle buttons, adding unnecessary complexity.

## Design

### 1. PricingGrid component (detail panel)

**Stacked layout:**
- **1ª praça**: label + price, primary visual weight (large bold number)
- **2ª praça**: shown only when `edital.secondBidPrice > 0`, with computed discount % from 1ª praça (e.g. "−13%"). Rendered below with a divider, smaller text, secondary color.
- **Removed**: toggle buttons, avaliação field, overall desconto field
- When no 2ª praça exists, only the 1ª praça row is shown

**Example rendering:**
```
1ª PRAÇA
R$ 680.000

──────────────

2ª PRAÇA  −13%
R$ 591.600
```

### 2. Market tab spread chart

- **Lance mínimo** = 2ª praça price if available, otherwise 1ª praça
- **Mercado estimado** = market-researched price from the market agent
- **Removed**: praça toggle buttons — always shows the best available bid vs. market price
- If no market price is available, fall back to 1ª praça price as the reference

### 3. Backend changes

- **No new fields** — `auction_price`, `auction_price_2nd` already exist in `PropertyMetadata`
- **2ª praça discount %** is computed on the frontend: `((1st - 2nd) / 1st * 100)`
- **Remove the 80% fallback** in `_build_edital()` (`output.py:371-373`) — if the auction page doesn't provide a 2ª praça price, don't invent one. Set `second_bid_price = 0` instead.

### 4. Data flow

- `minBid` on the top-level `AuctionPropertyResult` remains = 1ª praça (`metadata.auction_price`)
- `edital.secondBidPrice` carries the 2ª praça price when available, `0` when not
- The frontend computes the discount % between praças, and decides which price to use in the market spread

### 5. Frontend files affected

- `PropertyDetail.jsx` — `PricingGrid` component: replace toggle + 3-column grid with stacked layout
- `PropertyDetail.jsx` — `Market` component: remove toggle buttons, always use best available bid
- `seed.json` — keep existing data shape, no changes needed

### 6. Backend files affected

- `graph/output.py` — remove 80% fallback in `_build_edital()` (lines 371-373)

### 7. What stays the same

- Top-level `minBid` field = 1ª praça price (backward compat)
- Market tab indicators, trend chart, comparables — unchanged
- Viability tab, costs tab, edital tab, legal tab — unchanged
- Discovery agent LLM prompt — already asks for `auction_price_2nd`
