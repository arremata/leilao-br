# Feed: collapsible rail + "mostrar encerrados" toggle

> Two related feed refinements:
> 1. Make the 280px left rail collapsible (full hide/show) at desktop.
> 2. New filter "Mostrar leilões encerrados" (default OFF) — i.e. include or
>    exclude auctions whose `endsAt` has already passed. Acts on auctions
>    only; direct-sale properties have no `endsAt` and are always visible.

**Status:** approved by Gustavo on 2026-09-15.

## Why

The left rail is heavy. When the user has narrowed their search enough, they
deserve the result grid's full width. And there's a subtle correctness bug
today: expired auctions are shown unless the user picks the `soonest` sort —
mixing past inventory with upcoming ones makes the list feel stale. A toggle
lets the user decide.

## What stays the same

- All existing filters (`cidade`, `tipo`, `rodada`, `modalidade`, `estado`,
  `desconto`, `q`). None renamed or removed.
- All sort options (`relevance`, `discount`, `soonest`, `price-asc`,
  `price-desc`).
- Sort logic still uses `sortNow`; `soonest` continues to filter expired
  items internally regardless of the new toggle (a composable behavior,
  not a conflict).
- URL params are the source of truth for filters; history and shared links
  still work.
- Mobile breakpoint behavior: rail hides below ≤1100px and the `⚙ Filtros`
  toolbar button opens it. This commit does not change mobile UX.

## A. Collapsible rail

### Trigger

Two complementary affordances — they always show the *other* state:

| State | Rail visible | Toolbar ⚙ visible |
|---|---|---|
| Open | Yes, with a `«` collapse button at its top-right | No (rail is the ⚙ replacement) |
| Collapsed | No | Yes, with active-filter chip |

### State

- `const [railOpen, setRailOpen] = useState(true)` inside `Feed`.
- Local React state, not URL — collapse is a viewport accommodation, not a shareable filter.
- On mobile (<1101px) `railOpen` is irrelevant; media query controls visibility, toggle button doesn't render.

### Layout

`.feed-layout` becomes a conditional 2-column grid:

```css
.feed-layout:not(.rail-collapsed) {
  grid-template-columns: 280px minmax(0, 1fr);
  transition: grid-template-columns 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
.feed-layout.rail-collapsed        { grid-template-columns: 1fr; }
```

The grid transition is GPU-accelerated on modern browsers because both states
resolve to a grid-template-rows length of 1. Doesn't trigger a JS animation.

### Accessibility

- Rail container: `aria-label="Filtros de busca"`, `aria-hidden={!railOpen}`.
- `«` button inside rail: `aria-label="Esconder filtros"`, focusable.
- ⚙ button in toolbar: `aria-expanded={railOpen}`, `aria-controls="feed-rail"`.

### Behavior notes

- Collapse never reflows the toolbar — search/sort/view stay in place.
- Active-filter count chip on ⚙ continues to show even when rail is open
  (as a parity signal, not the primary closure mechanism).

## B. "Mostrar encerrados" toggle

### Location

Inside the rail — its own "Disponibilidade" section between "Localização"
and "Tipo de imóvel". A filter section is the correct semantic home; it does
not deserve a toolbar slot.

### Control

A **switch**, not a checkbox. The switch communicates binary on/off state
clearly and matches the Argos design language.

### State

- `encerrados` URL param: `1` (show past) or absent (hide past — DEFAULT OFF).
- Default OFF means: only auctions with `endsAt > sortNow` are shown (i.e.,
  future/upcoming ones — most users' intent).
- The `sortNow` clock continues to tick at 60s so the "what's past" boundary
  moves with time.
- Direct-sale properties have no `endsAt`; they pass through the predicate
  unconditionally (i.e., this toggle does not affect the `Compra direta` tab).

### Filtering logic

In `filtered` useMemo, add a predicate:

```js
const hidePastAuctions = filters.encerrados !== '1';
const listFiltered = list.filter(p => {
  if (!hidePastAuctions) return true; // toggle ON — show everything
  if (isDirectSaleModality(p.modalidade)) return true; // direct sale = always visible
  const endsAt = getEndsAtMs(p.endsAt);
  if (!Number.isFinite(endsAt) || endsAt <= 0) return true; // unknown date = visible
  return endsAt > sortNow;
});
```

### Wording

- Section header: `Disponibilidade`
- Switch label: `Mostrar leilões encerrados`
- Helper below switch: `Incluir imóveis cujo leilão já terminou`
- Result-count badge does not change — the filtering is implicit.

### Active-filter chip math

`activeFilterCount` adds `(filters.encerrados === '1' ? 1 : 0)` — when the
user knows they're showing expired items, the chip stays honest. Default OFF
never inflates the chip.

## Composition

```
<Rail>
  <RailHeader>
    <KindTabs />
    <CollapseButton>  « Esconder filtros </CollapseButton>
  </RailHeader>

  <RailSection header="Localização">
    <Filter Estado />
    <Filter Cidade />
  </RailSection>

  <RailSection header="Disponibilidade">        ← NEW
    <Switch
      label="Mostrar leilões encerrados"
      helper="Incluir imóveis cujo leilão já terminou"
      checked={filters.encerrados === '1'}
      onChange={...}
    />
  </RailSection>

  <RailSection header="Tipo de imóvel">
    <Filter Tipo />
    <Filter Rodada />
    <Filter Modalidade />
  </RailSection>

  <RailSection header="Abaixo da avaliação">
    <Slider />
  </RailSection>

  <ClearAllButton />
</Rail>

<Main>
  <Toolbar>
    <FilterToggleButon>            ← appears when rail is collapsed
      ⚙ Filtros (N)
    </FilterToggleButon>
    <SearchInput />
    <SortSelect />
    <ViewToggle />
  </Toolbar>
  <Results />
</Main>
```

## Out of scope

- No "expired" ribbon on cards — separate polish.
- No per-user cookie/localStorage persistence — URL still canonical.
- No change to direct-sale visibility logic — already always shown.
- No redesign of kind-tabs — they're still the same vertical stack in the
  rail.

## Acceptance criteria

1. Feed loads with rail open and `encerrados=0` (default OFF); only
   upcoming auctions appear.
2. Click `«` in the rail → rail collapses; grid reflows to full width; ⚙
   button appears in the toolbar.
3. Click ⚙ → rail expands; ⚙ disappears.
4. Toggle "Mostrar leilões encerrados" ON → expired auctions appear, URL
   gains `?encerrados=1`. Toggle OFF → expired hidden; param removed.
5. Active-filter chip on ⚙ reflects the toggle when ON (count +1).
6. At 900px viewport: rail hidden by default; ⚙ in toolbar opens it; the
   toggle inside still applies instantly when toggled.
7. `soonest` sort still works; combining it with the toggle OFF yields
   mostly the same list as before (still a valid test case).
8. Direct-sale tab: type changes alone — expired toggle has no effect on
   direct-sale cards (none of them carry `endsAt`).

## Files

- `frontend/src/components/Feed.jsx` — railOpen state, conditional grid class,
  encerrados filter predicate, Switch component (small inline), chip math.
- `frontend/src/styles.css` — `.feed-layout` grid-template-columns transition,
  `.feed-toggle-switch` styles (iOS-style pill+knob), `.feed-toggle-switch`
  focus ring, `@media (prefers-reduced-motion: reduce)` disables the grid
  transition.
