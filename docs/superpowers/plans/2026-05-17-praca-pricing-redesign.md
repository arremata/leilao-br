# Simplified Praça Pricing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace praça toggle buttons with a stacked layout showing both praças simultaneously, remove avaliação/desconto from the pricing element, and fix the market tab to always use the best available bid vs. market price.

**Architecture:** Frontend-only changes for the PricingGrid and Market components, plus one backend fix to remove the 80% fallback for 2ª praça. The 2ª praça discount % is computed on the frontend from the two prices.

**Tech Stack:** React (JSX inline styles), Python/Pytest for backend

---

### Task 1: Remove 80% fallback in backend `_build_edital`

**Files:**
- Modify: `backend/graph/output.py:371-373`
- Modify: `backend/tests/test_output.py`

- [ ] **Step 1: Write the failing test**

Add a test to `backend/tests/test_output.py` that verifies `second_bid_price` is `0` when `auction_price_2nd` is not provided (instead of the current 80% fallback):

```python
def test_edital_no_2nd_price_fallback_is_zero(self):
    state = _make_full_state()
    state.property_metadata.auction_price_2nd = 0
    result = build_result(state)
    assert result.edital.second_bid_price == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao/backend && python -m pytest tests/test_output.py::TestBuildResultDetails::test_edital_no_2nd_price_fallback_is_zero -v`
Expected: FAIL — `second_bid_price` will be ~249600 (80% of 312000)

- [ ] **Step 3: Fix the fallback logic**

In `backend/graph/output.py:371-373`, replace:

```python
    second_bid_price = metadata.auction_price_2nd
    if not second_bid_price and metadata.auction_price:
        second_bid_price = round(metadata.auction_price * 0.80)
```

with:

```python
    second_bid_price = metadata.auction_price_2nd or 0
```

- [ ] **Step 4: Run all output tests to verify**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao/backend && python -m pytest tests/test_output.py -v`
Expected: All PASS (note: existing test `test_edital_populated_from_state` has `auction_price_2nd=270000.0` so it still passes)

- [ ] **Step 5: Commit**

```bash
git add backend/graph/output.py backend/tests/test_output.py
git commit -m "fix: remove 80% fallback for 2nd bid price in edital"
```

---

### Task 2: Rewrite `PricingGrid` component — stacked layout

**Files:**
- Modify: `frontend/src/components/PropertyDetail.jsx:243-299`

- [ ] **Step 1: Replace the PricingGrid component**

Replace the entire `PricingGrid` function (lines 243–299) with the new stacked layout:

```jsx
function PricingGrid({ p }) {
  const has2nd = p.edital?.secondBidPrice && p.edital.secondBidPrice > 0;
  const secondDiscount = has2nd
    ? ((p.minBid - p.edital.secondBidPrice) / p.minBid * 100)
    : 0;

  return (
    <div>
      <div>
        <span className="uppy" style={{ color: 'var(--fg-3)' }}>1ª praça</span>
        <div className="num-md" style={{ marginTop: 4 }}>R$ {fmtBRL(p.minBid)}</div>
      </div>
      {has2nd && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line-1)' }}>
          <div className="row gap-2" style={{ alignItems: 'baseline' }}>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>2ª praça</span>
            <span style={{ fontSize: 11, color: 'var(--good)', fontWeight: 500 }}>
              −{secondDiscount.toFixed(0)}%
            </span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg-2)', marginTop: 2 }}>
            R$ {fmtBRL(p.edital.secondBidPrice)}
          </div>
        </div>
      )}
    </div>
  );
}
```

Key changes:
- Removed `useState` for `praca` toggle
- Removed toggle buttons
- Removed avaliação and desconto fields (those live in market tab)
- 1ª praça shown as primary price
- 2ª praça shown below with divider, computed discount % from 1ª praça

- [ ] **Step 2: Verify in browser**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao/frontend && npm run dev`
Open http://localhost:5173, navigate to a property detail, verify:
- 1ª praça shows as primary price
- 2ª praça shows below with discount % (for properties with `secondBidPrice > 0`)
- No toggle buttons
- No avaliação or desconto fields

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PropertyDetail.jsx
git commit -m "feat: replace praça toggle with stacked pricing layout"
```

---

### Task 3: Rewrite `Market` component — remove toggle, use best bid

**Files:**
- Modify: `frontend/src/components/PropertyDetail.jsx:544-593`

- [ ] **Step 1: Update the Market component**

In the `Market` function (line 544), replace the praça toggle logic. Make these changes:

1. Remove `const [praca, setPraca] = useState(1);` (line 546)
2. Change the bid calculation (lines 556-557) from:

```jsx
  const has2nd = p.edital?.secondBidPrice && p.edital.secondBidPrice > 0;
  const bid = praca === 2 && has2nd ? p.edital.secondBidPrice : p.minBid;
```

to:

```jsx
  const has2nd = p.edital?.secondBidPrice && p.edital.secondBidPrice > 0;
  const bid = has2nd ? p.edital.secondBidPrice : p.minBid;
```

3. Remove the toggle buttons block (lines 571-588) — the entire `{has2nd && ( <div className="row gap-2"> ... </div> )}` section inside the spread card header. The header div becomes just:

```jsx
          <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 18 }}>
            <div>
              <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 01.01 · spread</span>
              <h3 className="h2" style={{ marginTop: 4 }}>Valor de mercado vs. lance mínimo</h3>
            </div>
          </div>
```

- [ ] **Step 2: Verify in browser**

Navigate to the Market tab on a property with 2ª praça data. Verify:
- Spread chart uses 2ª praça price (if available) vs. market price
- No toggle buttons in the header
- The "Lance mínimo" label still shows the bid value (now 2ª praça if available)
- The gap and discount % update accordingly

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PropertyDetail.jsx
git commit -m "feat: market tab uses best available bid, removes praça toggle"
```

---

### Task 4: Update seed data — remove invented 2ª praça prices

**Files:**
- Modify: `backend/data/seed.json`

- [ ] **Step 1: Update seed data**

In `backend/data/seed.json`, the p3 (Comercial) property has `secondBidPrice: 591600` which is exactly 80% of `minBid: 680000` — this was likely the fallback. Since the backend no longer invents this, check if this came from the LLM or the fallback. Set it to `0` since it's an extrajudicial auction with no explicit 2ª praça:

For p3 (line ~181), change:
```json
      "secondBidPrice": 591600,
```
to:
```json
      "secondBidPrice": 0,
```

For p5 (line ~265), `secondBidPrice: 1078000` is also ~87% of `minBid: 1240000` — same pattern. Set to `0`:

```json
      "secondBidPrice": 0,
```

Keep p1's `secondBidPrice: 270000` as-is since it has an explicit `secondBidDate` too.

- [ ] **Step 2: Verify backend still starts correctly**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao/backend && python -c "import json; data=json.load(open('data/seed.json')); print(len(data), 'properties loaded')"`

- [ ] **Step 3: Commit**

```bash
git add backend/data/seed.json
git commit -m "fix: remove invented 2nd bid prices from seed data"
```
