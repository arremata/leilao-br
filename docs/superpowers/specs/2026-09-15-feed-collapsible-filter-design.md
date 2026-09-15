# Feed collapsible filter panel — redesign

> Replaces the single-row sticky filter-bar with a compact toolbar + inline
> collapsible panel. Less chrome, less clutter, and a single axis of state for
> "are filters visible right now?".

**Status:** approved by Gustavo on 2026-09-15 (this document) —
implementation pending.

## Why

Today's filter bar carries eight controls in one row (search, cidade, tipo, rodada,
modalidade, abaixo-avaliação slider, ordenar, view toggle) under a separate
kind-tabs strip. Result:

- eight affordances compete for the same horizontal scan;
- tertiary controls (slider) take as much width as primary actions;
- filter chrome persists even after the user has chosen, stealing space from
  results;
- two unrelated controls (sort + view) sit together at the far right and read
  as a single function.

The fix is information architecture, not new filters: separate **always-needed**
controls (kind, search, sort, view) from **sometimes-needed** filters (dropdowns,
slider). The always-needed live in a thin sticky toolbar. The sometimes-needed
live in an inline panel that opens on demand.

## What stays the same

- All seven filters (`q`, `estado`, `cidade`, `tipo`, `rodada`, `modalidade`,
  `desconto`). No filter is added, removed, or renamed.
- All state, sort, search semantics. URL is still the source of truth; params
  are unchanged; existing links continue to work.
- Sort, view toggle, result count, and grid/list rendering.
- The 60-second `setSortNow` interval that bumps `relevance`/`soonest` ranking.
- Mobile behaviour: filters still wrap, dropdowns still snap to dropdown
  components, results still flow into the same grid.

## New anatomy

| Slot | Content | When visible |
|---|---|---|
| Header | "Imóveis" + subtitle | always |
| Toolbar (sticky) | kind tabs (segmented) · search · Filtros ⚙ (N) · ordenar · ⊞/≡ | always |
| Filter panel | dropdowns (cidade/tipo/rodada/modalidade) · full-width slider · Limpar | when ⚙ clicked; closes on ⚙, Esc, click-out |
| Result count + grid | unchanged | always |

Kind tabs move from a big full-width strip into a compact segmented control at
the left of the toolbar. Direct-sale count still drives the "nenhum disponível"
disable.

## Interaction contract

- **Panel open state** lives in React `useState` only — not in URL, not in
  history. Closing never pushes an entry.
- **Filter values** still write to URL via `setParams`. Changing a filter with
  the panel open keeps the panel open. Changing the search query (top-level
  toolbar) does not affect panel state.
- **Filter-count chip** on the ⚙ button counts only non-search, non-default
  filters (`estado/cidade/tipo/rodada/modalidade/desconto`). Search typing does
  not bump the chip.
- **Disabled state**: ⚙ button is never disabled; it always opens the panel
  (even with zero active filters).
- **A11y**: ✕ Esc closes the panel; focus stays inside it while open;
  click-outside closes; aria-expanded reflects open state.

## Composition

```
<Feed>
  <PageHeader />
  <Toolbar>                          ← new compound element
    <KindTabsSegmented />            ← replaces big .kind-tabs buttons
    <SearchInput />                  ← refactored from existing
    <FilterToggleButton count />     ← new
    <SortSelect />                   ← unchanged
    <ViewToggle />                   ← unchanged
  </Toolbar>
  <FilterPanel open={open}>          ← new
    <FilterRow>  cidade · tipo · rodada · modalidade  </FilterRow>
    <SliderRow>  abaixo da avaliação ≥ ___ %           </SliderRow>
    <ClearRow>   [Limpar N]                            </ClearRow>
  </FilterPanel>
  <ResultCount /> · <PropertyGrid /> · <PaginationLoadMore />
</Feed>
```

Existing primitives (`Filter`, `RangeChip`, `Sort`, `ViewToggle`) stay; only
their layout containers and a couple of class names change.

## Style

- `.feed-toolbar` — sticky, same blur and border-bottom as the existing
  `.filter-bar` (visual continuity).
- `.filter-panel` — slides open via `grid-template-rows: 0fr → 1fr` so the
  open/close animation is CSS-only. Avoids jump from `display: none` toggle.
- `.kind-tabs--compact` — segmented pill (32px high) so it sits at toolbar
  baseline; the existing full-height kind-tabs styles stay but are unused
  under the new layout (kept for any legacy callers).

No new CSS tokens.

## Acceptance criteria

1. Page loads with panel **closed**. Toolbar shows kind tabs, search,
   ⚙ Filtros (0), ordenar, ⊞/≡.
2. Click ⚙ → panel slides open above the grid; grid shifts down naturally.
3. Click ⚙ again, press Esc, or click outside → panel closes; ⚙ chip
   preserves its count.
4. Pick "Cidade = Curitiba" → panel stays open; chip shows 1; results filter.
5. Click Limpar → all six filters reset; chip goes to 0; panel stays open.
6. Switch Leilões ↔ Compra direta → panel unaffected; results re-render.
7. At 375px viewport, dropdowns wrap inside the panel; slider spans full width.
8. Reload with `?q=&cidade=Curitiba` in URL → page opens with filters
   applied AND panel **closed** (chip shows 1); user can still see at a glance
   that 1 filter is active without opening the panel.

## Out of scope

- Left rail / drawer patterns.
- Adding new filters (price range, area, etc.).
- Changing the existing 60-second relevance interval.
- Re-designing kind-tabs visuals (compact segment inside toolbar is a minimal
  port, not a redesign).

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| User expects filters always visible; hides them behind ⚙ | Chip count communicates "N filters active" at all times; ⚙ is in the same always-visible horizontal line as search; pain mitigated by discoverability. |
| Panel animation stutters on low-end mobile | `grid-template-rows: 0fr → 1fr` is GPU-accelerated; no JS animation; safe. |
| Someone links to a filtered URL, panel is closed — user can't see what's set | Chip on the ⚙ button + the URL itself communicate state; opening panel reveals values. Acceptable. |
| Estado filter disappears when `stateOptions.length <= 2` (only one state present) | Preserved behaviour — same conditional as today. |

## Files

- `frontend/src/components/Feed.jsx` — decompose current filter-bar into
  `<Toolbar>` + `<FilterPanel>`; replace `.kind-tabs` markup with compact
  segmented variant; reuse `Filter`, `RangeChip`, `Sort`, `ViewToggle`.
- `frontend/src/styles.css` — add `.feed-toolbar`, `.filter-panel`,
  `.kind-tabs--compact`; keep existing `.filter-bar`, `.kind-tabs` styles as
  legacy fallback for any other consumer.

## After this PR

Possible follow-ups (separate PRs, not blocking):

- Move search into a command-palette (kmenu-style) with quick jumps to
  neighbourhoods saved by the user.
- Promote frequently-filtered "Cidade" to a chip next to "Filtros" (when set)
  so the user can clear it without re-opening the panel.
- Surface "Abaixo da avaliação ≥ x%" as a chip beside the active filter list,
  clickable to remove.
