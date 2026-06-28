# Argos Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the Arremate frontend to the Argos identity (Arctic / Violet) — tokens, fonts, glass, oklch cleanup — without changing any functionality.

**Architecture:** Pure visual reskin. Replace CSS custom property values in `:root`, swap Google Fonts, convert all hardcoded `oklch()` to `rgba()`/hex/tokens, apply glass effects to topbar/cards/chips, and add ambient background + scroll progress bar. No state, props, API calls, or component logic changes.

**Tech Stack:** CSS custom properties, Google Fonts (Bricolage Grotesque, Inter, JetBrains Mono), React inline styles, `backdrop-filter`.

**Spec:** `REDESIGN_ARGOS.md` (project root)

---

### Task 1: Replace CSS tokens in `:root`

**Files:**
- Modify: `frontend/src/styles.css:1-41`

- [ ] **Step 1: Replace the `:root` block and file header**

Replace lines 1–41 of `frontend/src/styles.css`:

```css
/* =========================================================
   Argos — Arctic / Violet identity
   Fonts: Bricolage Grotesque (display), Inter (body), JetBrains Mono (numbers)
   ========================================================= */

:root {
  /* Fundo Arctic */
  --bg-0: #FAFAFA;
  --bg-1: #FFFFFF;
  --bg-2: #F3F4F6;
  --bg-3: #ECEEF1;

  /* Linhas */
  --line-1: #E5E7EB;
  --line-2: #D1D5DB;
  --line-3: #9CA3AF;

  /* Texto */
  --fg-0: #111827;
  --fg-1: #374151;
  --fg-2: #6B7280;
  --fg-3: #9CA3AF;

  /* Acento — Argos Violet (UNICA cor de marca) */
  --accent: #7C3AED;
  --accent-strong: #6D28D9;
  --accent-soft: #EDE9FE;
  --accent-ink: #FFFFFF;

  /* Sinais (somente dados) — contraste alto */
  --good: #16A34A;
  --good-soft: #DCFCE7;
  --warn: #B45309;
  --warn-soft: #FEF3C7;
  --bad: #DC2626;
  --bad-soft: #FEE2E2;

  /* Fontes */
  --f-display: 'Bricolage Grotesque', system-ui, sans-serif;
  --f-sans: 'Inter', system-ui, sans-serif;
  --f-mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

- [ ] **Step 2: Verify the app still loads**

Run: `cd frontend && npm run dev`
Expected: App loads at localhost:5173 with new colors, no console errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles.css
git commit -m "feat(theme): tokens Arctic/violet em styles.css"
```

---

### Task 2: Swap fonts in `index.html` + display titles in `styles.css`

**Files:**
- Modify: `frontend/index.html:7,10,14-17`
- Modify: `frontend/src/styles.css:101-106,344-363`

- [ ] **Step 1: Replace font links and meta in `index.html`**

Replace line 7 (theme-color):
```html
    <meta name="theme-color" content="#FAFAFA" />
```

Replace line 10 (app title):
```html
    <meta name="apple-mobile-web-app-title" content="Argos" />
```

Replace lines 14-16 (font links):
```html
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">
```

Replace line 17 (title):
```html
    <title>Argos — inteligencia de leiloes imobiliarios</title>
```

- [ ] **Step 2: Update `.brand` in `styles.css`**

Replace lines 101-106:
```css
.brand {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: var(--f-display);
  font-weight: 800;
  font-size: 17px;
  letter-spacing: -0.03em;
}
```

- [ ] **Step 3: Update `.h1`, `.h2`, `.h3` in `styles.css`**

Replace lines 344-363:
```css
.h1 {
  font-family: var(--f-display);
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.035em;
  line-height: 1.1;
  margin: 0;
}
.h2 {
  font-family: var(--f-display);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
  margin: 0;
}
.h3 {
  font-family: var(--f-display);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin: 0;
}
```

- [ ] **Step 4: Verify fonts render**

Run: `cd frontend && npm run dev`
Expected: Titles show Bricolage Grotesque (tighter, bolder), body shows Inter, numbers show JetBrains Mono. No FOUT or console errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/index.html frontend/src/styles.css
git commit -m "feat(theme): fontes Bricolage/Inter/JetBrains + display nos titulos"
```

---

### Task 3: Convert hardcoded `oklch()` in `styles.css`

**Files:**
- Modify: `frontend/src/styles.css` (lines 97, 199, 227-245, 262, 320, 328)

- [ ] **Step 1: Topbar background — line 97**

Replace:
```css
  background: color-mix(in oklab, var(--bg-0) 92%, transparent);
```
With:
```css
  background: rgba(255,255,255,0.72);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
```

- [ ] **Step 2: Card hover shadow — line 199**

Replace:
```css
  box-shadow: 0 4px 14px oklch(0 0 0 / 0.05);
```
With:
```css
  box-shadow: 0 4px 14px rgba(17,24,39,0.05);
```

- [ ] **Step 3: Photo placeholder `.ph` — lines 227-245**

Replace:
```css
.ph {
  position: relative;
  background:
    repeating-linear-gradient(135deg,
      oklch(0.92 0.005 75) 0 1px,
      transparent 1px 16px),
    linear-gradient(180deg,
      oklch(0.95 0.005 75),
      oklch(0.9 0.005 75));
  color: var(--fg-2);
  overflow: hidden;
}
.ph .ph-label {
  position: absolute; left: 12px; bottom: 12px;
  font-family: var(--f-mono); font-size: 10px;
  color: var(--fg-2); letter-spacing: 0.1em; text-transform: uppercase;
  padding: 4px 8px;
  background: oklch(1 0 0 / 0.8);
  border-radius: 4px;
}
```
With:
```css
.ph {
  position: relative;
  background:
    repeating-linear-gradient(135deg,
      #ECEEF1 0 1px,
      transparent 1px 16px),
    linear-gradient(180deg,
      #F3F4F6,
      #E5E7EB);
  color: var(--fg-2);
  overflow: hidden;
}
.ph .ph-label {
  position: absolute; left: 12px; bottom: 12px;
  font-family: var(--f-mono); font-size: 10px;
  color: var(--fg-2); letter-spacing: 0.1em; text-transform: uppercase;
  padding: 4px 8px;
  background: rgba(255,255,255,0.8);
  border-radius: 4px;
}
```

- [ ] **Step 4: `.tag.warn` hardcoded color — line 262**

Replace:
```css
.tag.warn { background: var(--warn-soft); color: oklch(0.45 0.16 75); border-color: transparent; }
```
With:
```css
.tag.warn { background: var(--warn-soft); color: var(--warn); border-color: transparent; }
```

- [ ] **Step 5: Slider thumb shadows — lines 320, 328**

Replace both occurrences:
```css
  box-shadow: 0 1px 4px oklch(0 0 0 / 0.15);
```
With:
```css
  box-shadow: 0 1px 4px rgba(17,24,39,0.15);
```

- [ ] **Step 6: Verify no `oklch` remains in styles.css**

Run: `grep -n oklch frontend/src/styles.css`
Expected: No output (zero matches).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/styles.css
git commit -m "feat(theme): converter oklch hardcoded para rgba em styles.css"
```

---

### Task 4: Convert hardcoded `oklch()` in JSX components

**Files:**
- Modify: `frontend/src/App.jsx:178,196`
- Modify: `frontend/src/components/Feed.jsx:289`
- Modify: `frontend/src/components/shared.jsx:234,247,345-346`
- Modify: `frontend/src/components/PropertyDetail.jsx:95,117-118,124,623,926-927`

- [ ] **Step 1: `App.jsx` — avatar background (line 178)**

Replace:
```jsx
            background: 'oklch(0.75 0.06 60)',
```
With:
```jsx
            background: 'var(--bg-3)',
```

- [ ] **Step 2: `App.jsx` — user menu shadow (line 196)**

Replace:
```jsx
              boxShadow: '0 10px 28px oklch(0 0 0 / 0.1)',
```
With:
```jsx
              boxShadow: '0 10px 28px rgba(17,24,39,0.1)',
```

- [ ] **Step 3: `Feed.jsx` — filter dropdown shadow (line 289)**

Replace:
```jsx
            boxShadow: '0 10px 28px oklch(0 0 0 / 0.08)',
```
With:
```jsx
            boxShadow: '0 10px 28px rgba(17,24,39,0.08)',
```

- [ ] **Step 4: `shared.jsx` — countdown overlay (line 234)**

Replace:
```jsx
          background: 'oklch(1 0 0 / 0.9)',
```
With:
```jsx
          background: 'rgba(255,255,255,0.78)',
```

- [ ] **Step 5: `shared.jsx` — watch button (line 247)**

Replace:
```jsx
            background: 'oklch(1 0 0 / 0.9)',
```
With:
```jsx
            background: 'rgba(255,255,255,0.78)',
```

- [ ] **Step 6: `shared.jsx` — PropertyRow thumbnail (lines 345-346)**

Replace:
```jsx
        background: 'oklch(0.92 0.005 75)',
        backgroundImage: p.photoUrl ? 'none' : 'repeating-linear-gradient(135deg, oklch(0.88 0.005 75) 0 1px, transparent 1px 8px)',
```
With:
```jsx
        background: '#ECEEF1',
        backgroundImage: p.photoUrl ? 'none' : 'repeating-linear-gradient(135deg, #E5E7EB 0 1px, transparent 1px 8px)',
```

- [ ] **Step 7: `PropertyDetail.jsx` — gallery label overlay (line 95)**

Replace:
```jsx
              background: 'oklch(1 0 0 / 0.92)', padding: '6px 10px',
```
With:
```jsx
              background: 'rgba(255,255,255,0.92)', padding: '6px 10px',
```

- [ ] **Step 8: `PropertyDetail.jsx` — thumbnail placeholder (lines 117-118)**

Replace:
```jsx
                  background: 'oklch(0.92 0.005 75)',
                  backgroundImage: 'repeating-linear-gradient(135deg, oklch(0.88 0.005 75) 0 1px, transparent 1px 8px)',
```
With:
```jsx
                  background: '#ECEEF1',
                  backgroundImage: 'repeating-linear-gradient(135deg, #E5E7EB 0 1px, transparent 1px 8px)',
```

- [ ] **Step 9: `PropertyDetail.jsx` — thumbnail mini label (line 124)**

Replace:
```jsx
                background: 'oklch(1 0 0 / 0.8)',
```
With:
```jsx
                background: 'rgba(255,255,255,0.8)',
```

- [ ] **Step 10: `PropertyDetail.jsx` — toggle switch shadow (line 623)**

Replace:
```jsx
              boxShadow: '0 1px 3px oklch(0 0 0 / 0.15)',
```
With:
```jsx
              boxShadow: '0 1px 3px rgba(17,24,39,0.15)',
```

- [ ] **Step 11: `PropertyDetail.jsx` — legal locked card (lines 926-927)**

Replace:
```jsx
          background: 'oklch(1 0 0 / 0.92)', backdropFilter: 'blur(12px)',
          boxShadow: '0 20px 50px oklch(0 0 0 / 0.08)',
```
With:
```jsx
          background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
          boxShadow: '0 20px 50px rgba(17,24,39,0.08)',
```

- [ ] **Step 12: Verify no `oklch` remains in any source file**

Run: `grep -rn oklch frontend/src/`
Expected: No output (zero matches in all files).

- [ ] **Step 13: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/Feed.jsx frontend/src/components/shared.jsx frontend/src/components/PropertyDetail.jsx
git commit -m "feat(theme): converter oklch hardcoded para rgba nos componentes JSX"
```

---

### Task 5: Glass effects on topbar, cards, chips, and CTA buttons

**Files:**
- Modify: `frontend/src/styles.css` (topbar, card, btn.primary rules)
- Modify: `frontend/src/components/shared.jsx:232-237,243-252`
- Modify: `frontend/src/components/Feed.jsx:100-107`

- [ ] **Step 1: Topbar border + transition in `styles.css`**

The topbar `background` was already changed to glass in Task 3. Now update the remaining properties. Replace the `.topbar` rule (lines ~90-100 after prior edits) so the complete block reads:

```css
.topbar {
  position: sticky; top: 0; z-index: 50;
  display: grid;
  grid-template-columns: auto minmax(180px, 420px) auto;
  align-items: center;
  gap: 20px;
  padding: 12px 20px;
  background: rgba(255,255,255,0.72);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border-bottom: 1px solid rgba(229,231,235,0.7);
  transition: background .25s ease, box-shadow .25s ease;
}
```

- [ ] **Step 2: Add `.app-shell.scrolled .topbar` rule after the `.topbar` block**

Add immediately after the `.topbar { ... }` block:

```css
.app-shell.scrolled .topbar {
  background: rgba(255,255,255,0.88);
  box-shadow: 0 6px 24px rgba(17,24,39,0.06);
}
```

- [ ] **Step 3: Update `.card` border-radius in `styles.css`**

Replace in the `.card` rule:
```css
  border-radius: 10px;
```
With:
```css
  border-radius: 12px;
```

- [ ] **Step 4: Update `.card.hov:hover` in `styles.css`**

Replace:
```css
.card.hov:hover {
  border-color: var(--line-2);
  box-shadow: 0 4px 14px rgba(17,24,39,0.05);
}
```
With:
```css
.card.hov:hover {
  border-color: var(--line-2);
  box-shadow: 0 8px 28px rgba(17,24,39,0.06);
  transform: translateY(-2px);
}
```

- [ ] **Step 5: Add CTA button shadow after `.btn.primary:hover` rule**

Replace:
```css
.btn.primary:hover { background: var(--accent-strong); border-color: var(--accent-strong); }
```
With:
```css
.btn.primary {
  background: var(--accent);
  color: var(--accent-ink);
  border-color: var(--accent);
  box-shadow: 0 4px 16px rgba(124,58,237,0.22);
}
.btn.primary:hover {
  background: var(--accent-strong);
  border-color: var(--accent-strong);
  box-shadow: 0 6px 20px rgba(124,58,237,0.30);
  transform: translateY(-1px);
}
```

Note: this replaces the existing `.btn.primary` and `.btn.primary:hover` rules (lines 171-176).

- [ ] **Step 6: Add glass to chips in `shared.jsx` — countdown overlay**

Replace the countdown overlay `<div>` style (around line 232-237):
```jsx
        <div style={{
          position: 'absolute', top: 14, right: 12,
          background: 'rgba(255,255,255,0.78)',
          padding: '5px 10px', borderRadius: 6,
          backdropFilter: 'blur(4px)',
          border: '1px solid var(--line-1)',
        }}>
```
With:
```jsx
        <div style={{
          position: 'absolute', top: 14, right: 12,
          background: 'rgba(255,255,255,0.78)',
          padding: '5px 10px', borderRadius: 6,
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.6)',
        }}>
```

- [ ] **Step 7: Add glass to watch button in `shared.jsx`**

Replace the watch button style (around line 243-252):
```jsx
            background: 'rgba(255,255,255,0.78)',
            border: '1px solid var(--line-1)',
```
With:
```jsx
            background: 'rgba(255,255,255,0.78)',
            border: '1px solid rgba(255,255,255,0.6)',
            backdropFilter: 'blur(8px)',
```

- [ ] **Step 8: Filter bar glass in `Feed.jsx`**

Replace the filter-bar inline style (lines 100-107):
```jsx
      <div className="filter-bar" style={{
        position: 'sticky', top: 60, zIndex: 20,
        background: 'color-mix(in oklab, var(--bg-0) 94%, transparent)',
        backdropFilter: 'blur(12px)',
        padding: '14px 0',
        borderBottom: '1px solid var(--line-1)',
        marginBottom: 20,
      }}>
```
With:
```jsx
      <div className="filter-bar" style={{
        position: 'sticky', top: 60, zIndex: 20,
        background: 'rgba(255,255,255,0.6)',
        backdropFilter: 'blur(16px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
        padding: '14px 0',
        borderBottom: '1px solid var(--line-1)',
        marginBottom: 20,
      }}>
```

- [ ] **Step 9: Verify glass effects render**

Run: `cd frontend && npm run dev`
Expected: Topbar has frosted glass look, filter bar has frosted look, card chips have blur behind them, CTA buttons have violet glow shadow.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/styles.css frontend/src/components/shared.jsx frontend/src/components/Feed.jsx
git commit -m "feat(theme): vidro em topbar/filtros/cards/chips + CTA violet"
```

---

### Task 6: Score badge and signal chip adjustments

**Files:**
- Modify: `frontend/src/components/shared.jsx:23,25`

- [ ] **Step 1: Increase ScoreBadge stroke width**

In `shared.jsx`, replace the two `strokeWidth` values in `ScoreBadge`:

Replace:
```jsx
          stroke="var(--bg-1)" strokeWidth="2.5" fill="none" />
```
With:
```jsx
          stroke="var(--bg-1)" strokeWidth="3" fill="none" />
```

Replace:
```jsx
          stroke={color} strokeWidth="2.5" fill="none"
```
With:
```jsx
          stroke={color} strokeWidth="3" fill="none"
```

- [ ] **Step 2: Verify score badge ring is thicker**

Run: `cd frontend && npm run dev`
Expected: Score badges show a slightly thicker ring (3px vs 2.5px). Colors use new tokens (green/amber/red). No console errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/shared.jsx
git commit -m "feat(theme): ajustes de score e chips de sinal"
```

---

### Task 7: Ambient background + scroll handler + progress bar

**Files:**
- Modify: `frontend/src/styles.css` (add rules after `.app-shell`)
- Modify: `frontend/src/App.jsx:1,33-41,113-114,133-134`

- [ ] **Step 1: Add ambient background CSS after `.app-shell` rule**

In `styles.css`, after the `.app-shell { ... }` block (around line 417), add:

```css
.app-shell::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(560px circle at 8% -5%, rgba(124,58,237,0.06), transparent 70%),
    radial-gradient(520px circle at 100% 30%, rgba(99,102,241,0.045), transparent 70%);
}
```

Also add after the `.app-shell.scrolled .topbar` rule (from Task 5):

```css
.topbar, .page { position: relative; z-index: 1; }
```

- [ ] **Step 2: Add scroll `useEffect` to `App.jsx`**

After the existing `useEffect` blocks (after line 54), add:

```jsx
  // Scroll: topbar solidify + progress bar (visual only)
  useEffect(() => {
    const el = document.querySelector('.app-shell');
    const bar = document.getElementById('argos-progress');
    const onScroll = () => {
      const y = window.scrollY || 0;
      if (el) el.classList.toggle('scrolled', y > 36);
      if (bar) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = (max > 0 ? Math.min(100, (y / max) * 100) : 0) + '%';
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
```

- [ ] **Step 3: Add progress bar `<div>` to TopBar**

In the `TopBar` function, right after the opening `<header className="topbar">` tag (line 134), add:

```jsx
      <div id="argos-progress" style={{
        position: 'absolute', left: 0, bottom: 0, height: 2,
        width: 0, background: 'var(--accent)', transition: 'width .1s linear',
      }} />
```

- [ ] **Step 4: Update brand name from "Arremate" to "Argos"**

In `App.jsx`, replace the brand text (line 138):
```jsx
          Arremate
```
With:
```jsx
          Argos
```

- [ ] **Step 5: Verify ambient + scroll effects**

Run: `cd frontend && npm run dev`
Expected:
- Faint violet gradient visible in top-left and right areas of the page
- Scrolling past ~36px: topbar background becomes more opaque, shadow appears
- Thin violet progress bar fills at bottom of topbar as you scroll
- All existing navigation and features still work

- [ ] **Step 6: Commit**

```bash
git add frontend/src/styles.css frontend/src/App.jsx
git commit -m "feat(theme): fundo ambiente + scroll (nav solidify + progress)"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run grep to confirm zero oklch remaining**

Run: `grep -rn oklch frontend/src/`
Expected: No output.

- [ ] **Step 2: Run the build**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Visual checklist**

Run: `cd frontend && npm run dev`

Walk through each screen and verify:
- Home dashboard loads, KPIs display, sparklines render
- Feed: filters work, grid/list toggle works, pagination works
- Watchlist: star toggle works, items appear/disappear
- History: entries display, clear works
- Detail: all tabs render, simulators work, legal locked card displays
- Responsive: resize to 860px and 560px, no layout breaks
- Colors: violet accent only on CTAs/links/active states, green/amber/red only on data
- Typography: Bricolage on titles, Inter on body, JetBrains Mono on numbers
- Glass: topbar, filter bar, photo chips have blur; no glass on inputs or list rows
