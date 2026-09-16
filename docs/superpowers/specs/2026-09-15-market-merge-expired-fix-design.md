# Market tab merge + expired direct-sale fix + confidence hatch

> Three coupled refinements to the Market tab and the Feed:
> 1. **Fix:** the "Mostrar leilões encerrados" toggle only filtered past
>    auctions, missing past direct-sale cards that show "Encerrado" badge.
>    Make the predicate uniform and rename the toggle "Mostrar imóveis
>    encerrados".
> 2. **Merge:** "Como este preço se compara" + "Referência de preço" cards
>    into a single 60/40 column card.
> 3. **Hatch:** when `md.confidenceLevel === 'low'`, the comparables bar
>    renders with diagonal stripes to communicate "soft data".

**Status:** approved by Gustavo on 2026-09-15.

## 1. Fix: expired direct-sale leak

### Bug

The "Disponibilidade" toggle (added in `filter redesign round 2`) hides past
auctions only. Direct-sale properties pass through unconditionally because we
assumed `modalidade === 'VENDA DIRETA'` means "no `endsAt`". Caixa direct-sale
properties *do* carry `endsAt` (an "available until" date); once past, the
card's `Countdown` hits zero and renders "Encerrado".

### Fix

Predicate now applies to every property:

```ts
list = list.filter(p => {
  if (filters.showExpired) return true;
  const endsAt = getEndsAtMs(p.endsAt);
  if (!Number.isFinite(endsAt) || endsAt <= 0) return true;
  return endsAt > sortNow;
});
```

Direct-sale properties with no `endsAt` still always show. The mental model
shifts from "leilões encerrados" to "imóveis encerrados":
- Section header: still "Disponibilidade".
- Switch label: `Mostrar imóveis encerrados` (was "Mostrar leilões encerrados").
- Helper text: `Incluir imóveis cuja janela de compra já fechou`.

URL param `encerrados` keeps the same name (no migration).

## 2. Merge comparison + region cards

### Layout

A single `.card` replaces the two existing cards in the Market tab. Inside,
a 60/40 split:

```
┌─ Card ─────────────────────────────────────────────────────────────┐
│                                                                    │
│  Headline (whole width)                                            │
│  "Valor inicial cerca de R$ X abaixo de imóveis parecidos"        │
│                                                                    │
│  ┌─────────── 60% ────────────┬────────── 40% ───────────────┐    │
│  │                            │                              │    │
│  │  3 vertical bars           │  "REFERÊNCIA DE PREÇO"       │    │
│  │  (bid / comparables /      │  UBERABA + confidence chip   │    │
│  │   appraisal)               │                              │    │
│  │                            │  confidence note             │    │
│  │  subcaptions               │                              │    │
│  │                            │  R$/m² grid                  │    │
│  │                            │  (anúncios vs imóvel)        │    │
│  │                            │                              │    │
│  │                            │  disclaimer                  │    │
│  └────────────────────────────┴──────────────────────────────┘    │
│                                                                    │
│  Footnote (spans whole width)                                      │
│  "ⓘ Preço dos parecidos estimado pelo Argos com base em N anúncios."│
└────────────────────────────────────────────────────────────────────┘
```

### Right column composition

Order (top→bottom):
1. Eyebrow "REFERÊNCIA DE PREÇO"
2. City/region big title (e.g., `UBERABA`) with confidence chip at right
3. Confidence note (gray info card, current `.market-confidence-note`)
4. Side-by-side two metric cards (the `RegionMetric` pair) — they get a grid
   of 2 columns squeezed into the right 40%
5. Disclaimer line ("Estimativa calculada com anúncios; não é um valor oficial.")

### Mobile (<768px)

Columns collapse vertically:
- Top: full-width headline + bar chart (chart scales down proportionally).
- Below: full-width reference content, in the same order.

Implementation: `.market-compare-grid { display: grid; grid-template-columns: 3fr 2fr; gap: 24px }` on desktop and `1fr` at ≤768px.

## 3. Confidence hatch on comparables bar

The middle bar ("Imóveis parecidos na região") reflects the reliability of
the estimate:

| Confidence | Visual |
|---|---|
| `low` | Bar gets **diagonal hatched stripes** (`repeating-linear-gradient(45deg, var(--line-3) 0 1px, transparent 1px 8px)` over the same solid `--line-3` bar fill). |
| `medium` | Solid gray (current). |
| `high` | Solid gray plus a 1px outer border of `--line-2` (subtle emphasis). |
| `none` (`comparableCount === 0`) | No bar — column shows the value "—" and the subcaption "estimativa não disponível". |

The stripes pattern borrows from finance uncertainty charts (NYT-style).
It's CSS-only — no JS re-computation.

## What stays the same

- All existing data flow: `gapVsMarket`, `gapVsAppraisal`, `comparableCount`,
  `filteredIndicators`, `confidence` map. None of them change shape.
- All filter state in URL; no new params.
- Sort logic unchanged.
- The other Market subsections (comparables list table, maps, market metrics)
  are untouched — only the top "compare" + "region" cards merge.

## Acceptance criteria

**Expired-filter fix**
1. `Compra direta` tab with toggle OFF: no cards show "Encerrado" badge.
2. Toggle ON: expired direct-sale cards appear (with their "Encerrado" badge).
3. Switch label reads "Mostrar imóveis encerrados"; helper explains the broader scope.
4. URL: `?encerrados=1` still toggles state; existing bookmarks with the old label work.

**Merge**
5. Market tab contains ONE card where previously there were two.
6. The right column holds the "REFERÊNCIA DE PREÇO" block with confidence chip, note, 2 metric cards, disclaimer.
7. The footnote spans the full width under both columns.
8. At ≤768px the columns stack (chart above, region below).

**Hatch**
9. When `md.confidenceLevel === 'low'`, the comparables bar appears striped.
10. For `'medium'` and `'high'`, the bar stays solid gray.
11. For `comparableCount === 0`, the middle column shows no bar at all.

## Files

- `frontend/src/components/Feed.jsx` — extend expired predicate, update
  switch label/helper.
- `frontend/src/components/PropertyDetail.jsx` — replace two `.card` blocks
  with a unified `.card` containing `.market-compare-grid`; restructure the
  inner right column; preserve `RegionMetric` and `confidence` map.
- `frontend/src/styles.css` — add `.market-compare-grid`, `.market-bar-hatch`
  (repeating-gradient), `.market-bar-empty` (placeholder glyph), mobile breakpoint.

## Out of scope

- No redesign of the confidence note (it stays a pill). Only what shows on
  the bar changes.
- No new confidence states; we keep low/medium/high/none.
- No refactor of the `Market` tab's other sections (comparables table, map,
  region metrics list).
