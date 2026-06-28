# Remover ROI dos cards + explicitar desconto vs. IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover o campo "ROI projetado" de toda a UI (cards, tabela, filtros, ordenação, resumo do feed, Home, LiveCard) e explicitar que o desconto é calculado contra o valor de mercado encontrado pela IA, mostrando também separadamente a avaliação do leilão (do edital) e seu deságio oficial.

**Architecture:** O backend já tem `market_value_estimate` (avaliação do edital) e `auction_price` (lance) como campos separados, mas só expõe `market`, `discount`, `roi` no `AuctionPropertyResult`. Vamos (1) corrigir o bug em `output.py:439-447` onde `market` vira `market_value_estimate` em vez do valor IA, (2) adicionar dois campos ao contract: `appraisal` (avaliação do edital) e `auction_discount` (deságio oficial vs. avaliação), (3) atualizar `seed.json` (backend e vercel) com dados de avaliação, (4) reescrever os componentes de card/tabela para mostrar "Avaliação leilão" e "Mercado IA" lado a lado, (5) remover ROI de filtros/ordenação/resumo/Home/LiveCard. O ROI do backend (`scoring.py:compute_roi`) e o ROI do simulador do detail (`PropertyDetail.jsx`) ficam intactos — só some da UI de listagem.

**Tech Stack:** Python (FastAPI, Pydantic, LangGraph), React 19 (Vite), JSON seed files.

---

## File Structure

**Backend (Python):**
- `backend/graph/contracts.py` — adicionar campos `appraisal` e `auction_discount` ao `AuctionPropertyResult`.
- `backend/graph/output.py` — corrigir bug onde `market = market_value_estimate` (deve ser IA), popular `appraisal` e `auction_discount`.
- `backend/graph/scoring.py` — sem alteração (ROI continua calculado, só não exposto na UI).
- `backend/data/seed.json` — adicionar `appraisal` e `auctionDiscount` aos 3 imóveis.
- `backend/tests/test_output.py` — atualizar asserts para novos campos e para a correção do bug.
- `backend/tests/test_contracts.py` — atualizar asserts para novos campos.

**Vercel backend:**
- `vercel-backend/seed.json` — mesma atualização dos 3 imóveis.
- `vercel-backend/index.py` — trocar KPI "ROI médio · feed" por "Desconto IA médio · feed".

**Frontend (React):**
- `frontend/src/components/shared.jsx` — reescrever `PropertyCard` (header compacto + 2 blocos) e `PropertyRow` (8→8 cols, troca ROI por Mercado IA).
- `frontend/src/components/Feed.jsx` — remover filtro/ordenação/summary de ROI.
- `frontend/src/components/Home.jsx` — `topScored`->`topDiscounted` (ordena por discount), remove ROI do `CompactRow` e do `SearchCommand`.
- `frontend/src/components/LiveCard.jsx` — rewording do step "ROI e lance máximo" -> "Lance máximo e custos"; `LiveCardHero` ganha linha "Avaliação R$ X · Mercado IA R$ Y · +Z% desconto IA".
- `frontend/src/components/PropertyDetail.jsx` — já tem PricingGrid; only fix `Market` tab label "abaixo da avaliação" -> "abaixo do mercado IA" e adicionar chip "IA" no spread card. Detail mantém ROI do simulador (não é o ROI solto do card).
- `frontend/src/styles.css` — adicionar `.ia-chip` utility class para o chip "IA · mercado".

---

## Task 1: Adicionar campos `appraisal` e `auctionDiscount` ao contract

**Files:**
- Modify: `backend/graph/contracts.py:159-162`
- Test: `backend/tests/test_contracts.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_contracts.py` a test asserting the new fields exist and serialize to camelCase:

```python
def test_result_has_appraisal_and_auction_discount_fields():
    """AuctionPropertyResult must expose appraisal (edital) and auctionDiscount (official deságio)."""
    from graph.contracts import AuctionPropertyResult, RiskFlags
    r = AuctionPropertyResult(
        id="x", photo_label="", title="", address="", type="",
        neighborhood="", city="", auction_type="Judicial", auctioneer="—",
        court="—", discount=10.0, min_bid=100000.0, market=150000.0,
        roi=0.0, area=50.0, ends_at="", occupancy="desocupado",
        risk=RiskFlags(j="good", f="good", l="good", o="good"),
        appraisal=180000.0,
        auction_discount=44.4,
    )
    dumped = r.model_dump(by_alias=True)
    assert dumped["appraisal"] == 180000.0
    assert dumped["auctionDiscount"] == 44.4
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_contracts.py::test_result_has_appraisal_and_auction_discount_fields -v`
Expected: FAIL with "unexpected keyword argument 'appraisal'" (field not yet on model).

- [ ] **Step 3: Add fields to the contract**

In `backend/graph/contracts.py`, find the `AuctionPropertyResult` class (around line 159-162). After the `roi: float` line, add:

```python
    roi: float
    # Valor de avaliação do edital (separado do market que é IA via comparáveis).
    # Quando o edital não expõe avaliação própria, cai para min_bid.
    appraisal: float
    # Deságio oficial do leilão: (appraisal - min_bid) / appraisal * 100.
    # Em 1ª praça costuma ser 0% (lance = avaliação).
    auction_discount: float
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_contracts.py::test_result_has_appraisal_and_auction_discount_fields -v`
Expected: PASS.

- [ ] **Step 5: Run all contract tests to confirm no regression**

Run: `cd backend && python -m pytest tests/test_contracts.py -v`
Expected: all PASS (other tests may need updates if they construct `AuctionPropertyResult` — fix only if they break).

- [ ] **Step 6: Commit**

```bash
git add backend/graph/contracts.py backend/tests/test_contracts.py
git commit -m "feat(contracts): expose appraisal + auctionDiscount on AuctionPropertyResult"
```

---

## Task 2: Popular `appraisal` e `auctionDiscount` no output e corrigir bug de `market`

**Files:**
- Modify: `backend/graph/output.py:439-504` (função `build_result`)
- Test: `backend/tests/test_output.py`

**Context:** Hoje `output.py:439-447` faz `market_value = metadata.market_value_estimate`, ou seja, o campo `market` exposto no frontend é a **avaliação do edital**, não a IA. Só cai pra `price_per_m2_neighborhood * area` se o LLM confundir com `auction_price`. Isso contraria a regra do usuário. A correção: `market` vira sempre IA (comparables), `appraisal` leva a avaliação do edital.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_output.py`:

```python
def test_build_result_market_is_ia_not_appraisal():
    """market field must be IA (comparables), not the edital appraisal."""
    from graph.contracts import PropertyMetadata, MarketResult
    from graph.output import build_result
    from graph.state import AuctionState, LegalResult, ScoringResult

    state = AuctionState(
        auction_url="http://x",
        pdf_texts="",
        property_metadata=PropertyMetadata(
            address="Rua X, 100",
            property_type="Apartamento",
            area_m2=50.0,
            auction_price=100000.0,        # lance mínimo
            market_value_estimate=180000.0,  # avaliação do edital
            city="Curitiba", state="PR",
            neighborhood="Centro",
        ),
        market_result=MarketResult(
            price_per_m2_neighborhood=3000.0,  # IA: 3000 * 50 = 150000
            liquidity_days=60,
        ),
        legal_result=LegalResult(occupation_status="desocupado"),
        scoring_result=ScoringResult(
            risk=RiskFlags(j="good", f="good", l="good", o="good"),
            roi=10.0,
        ),
    )

    result = build_result(state)
    # market must come from IA (price_per_m2 * area), not appraisal
    assert result.market == 150000.0
    # appraisal carries the edital value
    assert result.appraisal == 180000.0
    # auction_discount: (180000 - 100000) / 180000 * 100 = 44.44
    assert result.auction_discount == pytest.approx(44.44, abs=0.1)
```

Add `import pytest` at the top of the file if not already present.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_output.py::test_build_result_market_is_ia_not_appraisal -v`
Expected: FAIL — `result.market` will equal 180000.0 (the bug), not 150000.0.

- [ ] **Step 3: Fix `build_result` and populate new fields**

In `backend/graph/output.py`, find the `build_result` function. Locate the block at lines 439-450 that reads:

```python
    market_value = metadata.market_value_estimate
    # If the LLM set market_value_estimate to the auction price, it likely
    # confused the two — treat as missing and use market research instead
    if market_value and metadata.auction_price and abs(market_value - metadata.auction_price) < 1:
        market_value = None
    if not market_value and market_result:
        market_value = (market_result.price_per_m2_neighborhood or 0.0) * (metadata.area_m2 or 0.0)
    if not market_value:
        market_value = 0.0
```

Replace with (market sempre IA; appraisal leva o edital):

```python
    # appraisal = valor de avaliação do edital (se houver), senão cai para lance mínimo
    appraisal_value = metadata.market_value_estimate or (metadata.auction_price or 0.0)

    # market = valor de mercado pela IA (comparáveis da região).
    # Sempre derivado do price_per_m2_neighborhood; NUNCA do appraisal do edital.
    market_value = 0.0
    if market_result and market_result.price_per_m2_neighborhood and metadata.area_m2:
        market_value = (market_result.price_per_m2_neighborhood or 0.0) * (metadata.area_m2 or 0.0)
    # Fallback: se a IA não trouxer comparáveis, usar o appraisal do edital como referência
    if not market_value:
        market_value = appraisal_value
```

Then find the `return AuctionPropertyResult(...)` block. After `roi=roi,` add the two new fields:

```python
        roi=roi,
        appraisal=appraisal_value,
        auction_discount=round(
            ((appraisal_value - (metadata.auction_price or 0)) / appraisal_value * 100) if appraisal_value > 0 else 0.0,
            2,
        ),
        area=metadata.area_m2 or 0,
```

Also update the early-return "unknown" path (lines 421-433) to include `appraisal=0.0, auction_discount=0.0,`:

```python
        return AuctionPropertyResult(
            id="unknown", photo_label="", title="Propriedade desconhecida",
            address="", type="", neighborhood="", city="", auction_type="",
            auctioneer="—", court="—", discount=0.0, min_bid=0.0, market=0.0,
            roi=0.0, appraisal=0.0, auction_discount=0.0,
            area=0.0, ends_at="", occupancy="ocupado",
            risk=RiskFlags(j="bad", f="bad", l="bad", o="bad"),
            viability=None,
            market_detail=None,
            costs=None,
            edital=None,
            auction_url=None,
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_output.py::test_build_result_market_is_ia_not_appraisal -v`
Expected: PASS.

- [ ] **Step 5: Run all output tests to check regression**

Run: `cd backend && python -m pytest tests/test_output.py -v`
Expected: all PASS. If other tests break because they asserted `market == market_value_estimate`, update them: those tests were asserting the buggy behavior — switch the assert to `result.appraisal == ...` and `result.market` to the IA-derived value.

- [ ] **Step 6: Run full backend test suite**

Run: `cd backend && python -m pytest -x`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/graph/output.py backend/tests/test_output.py
git commit -m "fix(output): market=IA comparables, add appraisal + auctionDiscount"
```

---

## Task 3: Atualizar `backend/data/seed.json` com `appraisal` e `auctionDiscount`

**Files:**
- Modify: `backend/data/seed.json` (3 imóveis)

**Context:** Os 3 imóveis do seed today têm `market`, `minBid`, `discount`, mas não `appraisal`. Vamos inferir a avaliação do edital de cada um:

- **a1 (Curitiba, 2ª praça, minBid=253.345):** usuário disse que em 1ª praça avaliação = lance. Mas é 2ª praça. Edital Caixa 2ª praça geralmente 60-90% da avaliação. Vamos usar `appraisal=253345` (lance = avaliação; caso comum quando o leilão explicita "avaliação R$ X" e o lance da 2ª praça acabou igual). `auctionDiscount=0%`. Está alinhado com o que o usuário citou ("às vezes o valor de avaliação é o mesmo do lance").

  *Correction based on user's exact example:* o usuário disse "dependendo da etapa do leilao o valor da avaliacao de mercado é o mesmo do valor de lance". Vamos usar `appraisal=253345` para a1 → `auctionDiscount=0`.

- **a2 (Londrina, 2ª praça, minBid=122.687, discount=21%, market=155.000):** o viability.alerts diz "30% abaixo do valor de avaliação". Logo `appraisal ≈ 122687 / 0.70 = 175.267`. Vamos usar `appraisal=175267` → `auctionDiscount = (175267 - 122687) / 175267 * 100 = 30.0%`. Confere com o alerta.

- **a3 (Londrina, Venda direta Caixa, minBid=119.069, discount=43%, market=210.000):** o costs detail line 476 diz "Valor mínimo do 2º leilão (70% da avaliação)". Logo `appraisal = 119069 / 0.70 = 170.099`. Vamos usar `appraisal=170099` → `auctionDiscount = (170099 - 119069) / 170099 * 100 = 30.0%`. Confere com a hint do seed.

- [ ] **Step 1: Add fields to a1**

In `backend/data/seed.json`, find the a1 object (id "a1"). After `"roi": -14,` add:

```json
    "roi": -14,
    "appraisal": 253345,
    "auctionDiscount": 0,
```

- [ ] **Step 2: Add fields to a2**

Find the a2 object (id "a2"). After `"roi": 10,` add:

```json
    "roi": 10,
    "appraisal": 175267,
    "auctionDiscount": 30,
```

- [ ] **Step 3: Add fields to a3**

Find the a3 object (id "a3"). After `"roi": 17,` add:

```json
    "roi": 17,
    "appraisal": 170099,
    "auctionDiscount": 30,
```

- [ ] **Step 4: Verify JSON is valid**

Run: `cd backend && python -c "import json; json.load(open('data/seed.json'))"`
Expected: no output (valid JSON).

- [ ] **Step 5: Commit**

```bash
git add backend/data/seed.json
git commit -m "feat(seed): add appraisal + auctionDiscount to 3 demo properties"
```

---

## Task 4: Sync `vercel-backend/seed.json` com os mesmos dados

**Files:**
- Modify: `vercel-backend/seed.json` (3 imóveis)

- [ ] **Step 1: Add fields to a1 in vercel seed**

Find a1 object in `vercel-backend/seed.json`. After `"roi": -14,` add:

```json
    "roi": -14,
    "appraisal": 253345,
    "auctionDiscount": 0,
```

- [ ] **Step 2: Add fields to a2 in vercel seed**

Find a2. After `"roi": 10,` add:

```json
    "roi": 10,
    "appraisal": 175267,
    "auctionDiscount": 30,
```

- [ ] **Step 3: Add fields to a3 in vercel seed**

Find a3. After `"roi": 17,` add:

```json
    "roi": 17,
    "appraisal": 170099,
    "auctionDiscount": 30,
```

- [ ] **Step 4: Verify JSON is valid**

Run: `cd vercel-backend && python -c "import json; json.load(open('seed.json'))"`
Expected: no output (valid JSON).

- [ ] **Step 5: Commit**

```bash
git add vercel-backend/seed.json
git commit -m "feat(vercel-seed): sync appraisal + auctionDiscount fields"
```

---

## Task 5: Trocar KPI "ROI médio" por "Desconto IA médio" no dashboard Vercel

**Files:**
- Modify: `vercel-backend/index.py:84-95`

- [ ] **Step 1: Replace the KPI**

In `vercel-backend/index.py`, find the `get_dashboard` function. Replace lines 84-95:

```python
    avg_roi = round(sum(p.get("roi", 0) for p in properties) / max(len(properties), 1))

    return {
        "greeting": {
            "name": "Felipe",
            "subtitle": f"{len(properties)} imóveis analisados no seu portfólio.",
        },
        "kpis": [
            {"lbl": "Leilões ativos", "val": str(active_count), "delta": "seu portfólio", "pos": True},
            {"lbl": "Encerrando em 24h", "val": str(closing_soon) if closing_soon > 0 else "—", "delta": "em breve"},
            {"lbl": "Análises restantes", "val": "3", "delta": "plano grátis"},
            {"lbl": "ROI médio · feed", "val": f"{avg_roi}%", "delta": "do portfólio", "pos": avg_roi >= 10},
        ],
```

with:

```python
    avg_discount = round(sum(p.get("discount", 0) for p in properties) / max(len(properties), 1))
    avg_auction_discount = round(sum(p.get("auctionDiscount", 0) for p in properties) / max(len(properties), 1))

    return {
        "greeting": {
            "name": "Felipe",
            "subtitle": f"{len(properties)} imóveis analisados no seu portfólio.",
        },
        "kpis": [
            {"lbl": "Leilões ativos", "val": str(active_count), "delta": "seu portfólio", "pos": True},
            {"lbl": "Encerrando em 24h", "val": str(closing_soon) if closing_soon > 0 else "—", "delta": "em breve"},
            {"lbl": "Desconto IA médio", "val": f"{avg_discount}%", "delta": "vs. mercado IA", "pos": avg_discount >= 15},
            {"lbl": "Deságio oficial médio", "val": f"{avg_auction_discount}%", "delta": "vs. avaliação do edital", "pos": False},
        ],
```

- [ ] **Step 2: Commit**

```bash
git add vercel-backend/index.py
git commit -m "feat(dashboard): replace ROI médio with desconto IA médio + deságio oficial"
```

---

## Task 6: Adicionar utility class `.ia-chip` no CSS

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Append the utility class**

At the end of `frontend/src/styles.css`, add:

```css
/* IA chip — labels the market value as IA-derived */
.ia-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 16px;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-family: var(--f-mono);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/styles.css
git commit -m "style: add .ia-chip utility for market value labeling"
```

---

## Task 7: Reescrever `PropertyCard` (sem ROI, com Avaliação leilão + Mercado IA)

**Files:**
- Modify: `frontend/src/components/shared.jsx:184-285` (function `PropertyCard`)

**Layout novo (aprovado na Seção 2):**
```
lance mínimo · R$ 253.345   ← header compacto (label + valor na mesma linha)

┌ Avaliação leilão ┐   ┌ [IA] Mercado IA ┐
│ R$ 253.345        │   │ R$ 210.000       │
│ 0% deságio oficial│   │ +21% desconto IA │
└──────────────────┘   └─────────────────┘
[divider]
[risk summary]   [auctioneer]
```

- [ ] **Step 1: Replace the metrics block of PropertyCard**

In `frontend/src/components/shared.jsx`, find the `PropertyCard` function. Replace lines 246-271 (the `divider` + `property-card-metrics` block) with:

```jsx
        <div className="divider" style={{ margin: '16px 0' }}></div>

        {/* Lance mínimo — compact header */}
        <div className="row between baseline" style={{ marginBottom: 16 }}>
          <span className="uppy" style={{ color: 'var(--fg-2)' }}>lance mínimo</span>
          <span className="num-md" style={{ color: 'var(--fg-0)' }}>
            R$ {fmtBRL(p.minBid)}
          </span>
        </div>

        {/* Avaliação leilão + Mercado IA — 2 colunas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>Avaliação leilão</span>
            <div className="num-md" style={{ marginTop: 3, color: 'var(--fg-0)' }}>
              R$ {fmtBRL(p.appraisal)}
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--fg-1)', marginTop: 4 }}>
              {(p.auctionDiscount ?? 0) >= 0
                ? `${p.auctionDiscount ?? 0}% deságio oficial`
                : `+${Math.abs(p.auctionDiscount ?? 0).toFixed(1)}% ágio`}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>
              <span className="ia-chip" style={{ marginRight: 6 }}>IA</span>
              Mercado IA
            </span>
            <div className="num-md" style={{ marginTop: 3, color: 'var(--fg-0)' }}>
              R$ {fmtBRL(p.market)}
            </div>
            <div className="mono" style={{
              fontSize: 11, marginTop: 4,
              color: (p.discount ?? 0) > 0 ? 'var(--good)' : (p.discount ?? 0) < 0 ? 'var(--bad)' : 'var(--fg-2)',
              fontWeight: 500,
            }}>
              {(p.discount ?? 0) >= 0
                ? `+${p.discount}% desconto IA`
                : `${p.discount}% acima IA`}
            </div>
          </div>
        </div>
```

Then remove the second `<div className="divider" style={{ margin: '16px 0' }}></div>` that follows at line 273 (only one divider between metrics and risk summary is needed now). The block should now look like:

```jsx
        {/* ... metrics block above ... */}

        <div className="divider" style={{ margin: '16px 0' }}></div>

        {/* Bottom row: risk summary + leiloeiro */}
        <div className="row between" style={{ alignItems: 'center' }}>
          <RiskSummary flags={p.risk} />
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-2)' }}>
            {p.auctioneer}
          </span>
        </div>
```

- [ ] **Step 2: Verify visually**

Run: `cd frontend && npm run dev`
Open http://localhost:5173/feed — confirm cards show "lance mínimo" header, two-column "Avaliação leilão / Mercado IA" block, no "ROI projetado".

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/shared.jsx
git commit -m "feat(card): replace ROI with Avaliação leilão + Mercado IA blocks"
```

---

## Task 8: Reescrever `PropertyRow` (8 cols, sem ROI, com Mercado IA)

**Files:**
- Modify: `frontend/src/components/shared.jsx:290-351` (function `PropertyRow`)
- Modify: `frontend/src/components/Feed.jsx:215-235` (table head)
- Modify: `frontend/src/components/Home.jsx:106-126` (watchlist table head)

**Tabela nova:**
```
foto · imóvel · lance · avaliação · mercado IA · risco · encerra · ★
gridTemplateColumns: 60px 1.6fr 1fr 1fr 1fr 0.7fr 1fr 32px
```

- [ ] **Step 1: Replace PropertyRow**

In `frontend/src/components/shared.jsx`, replace the entire `PropertyRow` function (lines 290-351) with:

```jsx
export function PropertyRow({ p, onClick, watched, onToggleWatch }) {
  return (
    <div
      className="property-row"
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '60px 1.6fr 1fr 1fr 1fr 0.7fr 1fr 32px',
        gap: 14,
        padding: '16px 20px',
        alignItems: 'center',
        borderTop: '1px solid var(--line-1)',
        cursor: 'pointer',
        transition: 'background .15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
      onMouseLeave={e => e.currentTarget.style.background = ''}
    >
      <div style={{
        width: 56, height: 42, borderRadius: 8, overflow: 'hidden',
        background: '#ECEEF1',
        backgroundImage: p.photoUrl ? 'none' : 'repeating-linear-gradient(135deg, #E5E7EB 0 1px, transparent 1px 8px)',
      }}>
        {p.photoUrl && <img src={p.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-0)', lineHeight: 1.25 }}>
          {p.title}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-2)', marginTop: 2 }}>
          {p.neighborhood}, {p.city} · {p.area} m² · {p.beds} dorm · {p.praca || p.modalidade || p.auctionType}
        </div>
      </div>
      <div>
        <div className="num-sm" style={{ color: 'var(--fg-0)' }}>R$ {fmtBRL(p.minBid)}</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>lance mínimo</div>
      </div>
      <div>
        <div className="num-sm" style={{ color: 'var(--fg-1)' }}>R$ {fmtBRL(p.appraisal)}</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
          {(p.auctionDiscount ?? 0) >= 0 ? `−${p.auctionDiscount ?? 0}% oficial` : `+${Math.abs(p.auctionDiscount ?? 0).toFixed(1)}% ágio`}
        </div>
      </div>
      <div>
        <div className="num-sm" style={{ color: 'var(--fg-0)' }}>
          R$ {fmtBRL(p.market)}
        </div>
        <div className="mono" style={{
          fontSize: 11,
          color: (p.discount ?? 0) > 0 ? 'var(--good)' : (p.discount ?? 0) < 0 ? 'var(--bad)' : 'var(--fg-2)',
          fontWeight: 500,
        }}>
          {(p.discount ?? 0) >= 0 ? `+${p.discount}% IA` : `${p.discount}% acima IA`}
        </div>
      </div>
      <RiskDots flags={p.risk} />
      <Countdown until={p.endsAt} compact />
      <button
        onClick={(e) => { e.stopPropagation(); onToggleWatch?.(p.id); }}
        style={{
          width: 28, height: 28, borderRadius: 6,
          color: watched ? 'var(--accent)' : 'var(--fg-3)',
          fontSize: 14,
        }}
      >
        {watched ? '★' : '☆'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Update Feed.jsx table head**

In `frontend/src/components/Feed.jsx`, find the table head block (around lines 215-235). Replace `gridTemplateColumns: '60px 1.6fr 1fr 0.9fr 0.9fr 0.7fr 1fr 32px'` with `gridTemplateColumns: '60px 1.6fr 1fr 1fr 1fr 0.7fr 1fr 32px'`. Replace the column labels:

```jsx
            <span>foto</span>
            <span>imóvel</span>
            <span>lance</span>
            <span>avaliação</span>
            <span>mercado IA</span>
            <span>risco</span>
            <span>encerra em</span>
            <span></span>
```

- [ ] **Step 3: Update Home.jsx watchlist table head**

In `frontend/src/components/Home.jsx`, find the watchlist table head (around lines 106-126). Same grid + label changes as Step 2:

```jsx
              gridTemplateColumns: '60px 1.6fr 1fr 1fr 1fr 0.7fr 1fr 32px',
              ...
              <span>foto</span>
              <span>imóvel</span>
              <span>lance</span>
              <span>avaliação</span>
              <span>mercado IA</span>
              <span>risco</span>
              <span>encerra</span>
              <span></span>
```

- [ ] **Step 4: Verify visually**

Run: `cd frontend && npm run dev`
Open http://localhost:5173/feed — toggle to "lista" view; confirm 8 columns: foto · imóvel · lance · avaliação · mercado IA · risco · encerra · ★. No ROI column.

Open http://localhost:5173/ — if watchlist has items, confirm same columns.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/shared.jsx frontend/src/components/Feed.jsx frontend/src/components/Home.jsx
git commit -m "feat(table): replace ROI col with avaliação + mercado IA cols"
```

---

## Task 9: Remover ROI dos filtros, ordenação e resumo do Feed

**Files:**
- Modify: `frontend/src/components/Feed.jsx`

- [ ] **Step 1: Remove ROI filter state**

In `frontend/src/components/Feed.jsx`, find the `useState` for `filters` (lines 7-16). Remove `roiMin`:

```jsx
  const [filters, setFilters] = useState({
    judicial: initialFilters?.judicial || 'Todos',
    praca: initialFilters?.praca || 'Todos',
    modalidade: initialFilters?.modalidade || 'Todos',
    occupancy: initialFilters?.occupancy || 'Todos',
    propertyType: 'Todos',
    discountMin: initialFilters?.discountMin || 0,
    city: 'Todas',
  });
```

- [ ] **Step 2: Remove ROI filter logic**

Find the `filtered` useMemo (lines 22-49). Remove the line `if (filters.roiMin > 0) list = list.filter(p => p.roi >= filters.roiMin);`. Change default sort from `'roi'` to `'discount'`:

```jsx
  const [sort, setSort] = useState('discount');
```

In the sort block, remove `else if (sort === 'roi') list.sort((a, b) => b.roi - a.roi);`. Keep `if (sort === 'discount') list.sort((a, b) => b.discount - a.discount);` as primary.

- [ ] **Step 3: Remove ROI from activeFilterCount and clearAll**

Find `activeFilterCount` (lines 55-64). Remove `(filters.roiMin > 0 ? 1 : 0) +`:

```jsx
  const activeFilterCount =
    (addressQuery.trim() ? 1 : 0) +
    (filters.occupancy !== 'Todos' ? 1 : 0) +
    (filters.propertyType !== 'Todos' ? 1 : 0) +
    (filters.discountMin > 0 ? 1 : 0) +
    (filters.city !== 'Todas' ? 1 : 0) +
    (filters.judicial !== 'Todos' ? 1 : 0) +
    (filters.praca !== 'Todos' ? 1 : 0) +
    (filters.modalidade !== 'Todos' ? 1 : 0);
```

Find `clearAll` (lines 66-73). Remove `roiMin: 0,`:

```jsx
  const clearAll = () => {
    setAddressQuery('');
    setFilters({
      judicial: 'Todos', praca: 'Todos', modalidade: 'Todos',
      occupancy: 'Todos', propertyType: 'Todos',
      discountMin: 0, city: 'Todas',
    });
  };
```

- [ ] **Step 4: Update the summary row**

Find the result-count block (lines 180-191). Replace `"ROI médio X% · desconto médio X%"` with the two-discount summary:

```jsx
      <div className="row between" style={{ marginBottom: 16, alignItems: 'baseline' }}>
        <span className="mono" style={{ fontSize: 12, color: 'var(--fg-2)' }}>
          <b style={{ color: 'var(--fg-0)' }}>{filtered.length.toString().padStart(3, '0')}</b> resultados
          <span style={{ margin: '0 8px' }}>·</span>
          desconto IA médio {Math.round(filtered.reduce((a, b) => a + b.discount, 0) / Math.max(filtered.length, 1))}%
          <span style={{ margin: '0 8px' }}>·</span>
          deságio oficial médio {Math.round(filtered.reduce((a, b) => a + (b.auctionDiscount || 0), 0) / Math.max(filtered.length, 1))}%
        </span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
          1–{paginated.length} de {filtered.length}
        </span>
      </div>
```

- [ ] **Step 5: Remove RangeChip "ROI" from filter bar**

Find the filter bar (around lines 157-160). Remove the ROI RangeChip:

```jsx
          <RangeChip label="Desconto IA" suffix="%" max={60} value={filters.discountMin}
            onChange={(v) => setFilters({ ...filters, discountMin: v })} />
```

(Remove the `<RangeChip label="ROI" ... />` line above it.)

- [ ] **Step 6: Update Sort dropdown options**

Find the `Sort` component (lines 347-378). Replace the `<select>` options — remove ROI, deduplicate:

```jsx
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: 32, padding: '0 28px 0 12px',
          borderRadius: 8,
          border: '1px solid var(--line-1)',
          background: 'var(--bg-1)',
          fontSize: 12.5,
          fontFamily: 'var(--f-sans)',
          cursor: 'pointer',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23999'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
        }}
      >
        <option value="discount">maior desconto IA</option>
        <option value="soonest">encerra antes</option>
        <option value="price-asc">menor preço</option>
        <option value="price-desc">maior preço</option>
      </select>
```

- [ ] **Step 7: Verify visually**

Run: `cd frontend && npm run dev`
Open http://localhost:5173/feed — confirm: no "ROI ≥ X%" filter chip, no "ROI" in sort dropdown, summary shows "desconto IA médio / deságio oficial médio".

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/Feed.jsx
git commit -m "feat(feed): remove ROI filter/sort/summary, add dual-discount summary"
```

---

## Task 10: Remover ROI da Home (`topScored`, `CompactRow`, `SearchCommand`)

**Files:**
- Modify: `frontend/src/components/Home.jsx`

- [ ] **Step 1: Rename topScored → topDiscounted (sort by discount)**

In `frontend/src/components/Home.jsx`, find the `topScored` useMemo (lines 7-9). Replace:

```jsx
  const topDiscounted = useMemo(() =>
    [...properties].sort((a, b) => b.discount - a.discount).slice(0, 3),
    [properties]);
  const watchedItems = useMemo(() =>
    properties.filter(p => watched.includes(p.id)),
    [watched, properties]);
```

Update the section sub-text (around line 70). Replace `sub="Maior ROI projetado no portfólio, atualizados às 06:00."` with:

```jsx
          sub="Maior desconto IA no portfólio, atualizados às 06:00."
```

Update the `.map` reference: change `topScored.map` to `topDiscounted.map` (around line 74).

- [ ] **Step 2: Remove ROI span from CompactRow**

Find `CompactRow` (lines 398-441). Remove the ROI span (around lines 427-429). The remaining block:

```jsx
        <div className="row gap-3" style={{ marginTop: 6 }}>
          <span className="mono" style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--fg-2)' }}>lance </span>
            <span style={{ color: 'var(--fg-0)', fontWeight: 500 }}>R$ {fmtBRL(p.minBid)}</span>
          </span>
          <span className="mono" style={{ fontSize: 12, color: p.discount > 0 ? 'var(--good)' : 'var(--bad)' }}>
            {p.discount >= 0 ? `−${p.discount}%` : `+${Math.abs(p.discount).toFixed(1)}%`} desconto IA
          </span>
        </div>
```

(Replaces the previous block which had additional `+X% ROI` span.)

- [ ] **Step 3: Remove ROI from SearchCommand filter state**

Find `SearchCommand` (lines 182-316). In the `useState` for `sf` (around lines 185-192), remove `roiMin: 0,`:

```jsx
  const [sf, setSf] = useState({
    occupancy: 'Todos',
    discountMin: 0,
    judicial: 'Todos',
    praca: 'Todos',
    modalidade: 'Todos',
  });

  const activeCount =
    (sf.occupancy !== 'Todos' ? 1 : 0) +
    (sf.discountMin > 0 ? 1 : 0) +
    (sf.judicial !== 'Todos' ? 1 : 0) +
    (sf.praca !== 'Todos' ? 1 : 0) +
    (sf.modalidade !== 'Todos' ? 1 : 0);

  const clearFilters = () => setSf({
    occupancy: 'Todos', discountMin: 0,
    judicial: 'Todos', praca: 'Todos', modalidade: 'Todos',
  });
```

- [ ] **Step 4: Remove the "ROI mínimo" FilterGroup**

Find the `FilterGroup` block for ROI (around lines 264-269) and remove it entirely:

```jsx
          <FilterGroup
            label="Desconto mínimo"
            options={[['Todos', 0], ['≥ 20%', 20], ['≥ 30%', 30], ['≥ 40%', 40], ['≥ 50%', 50]]}
            value={sf.discountMin}
            onChange={(v) => setSf(s => ({ ...s, discountMin: v }))}
          />
```

(Remove the `<FilterGroup label="ROI mínimo" ... />` above it.)

- [ ] **Step 5: Verify visually**

Run: `cd frontend && npm run dev`
Open http://localhost:5173/ — confirm: "Top oportunidades" section shows 3 imóveis ordered by discount, no "+X% ROI" in compact rows. Search bar "Filtros" panel has no "ROI mínimo".

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Home.jsx
git commit -m "feat(home): order by discount, remove ROI from CompactRow and SearchCommand"
```

---

## Task 11: Rewording do LiveCard step + enriquecer LiveCardHero

**Files:**
- Modify: `frontend/src/components/LiveCard.jsx`

- [ ] **Step 1: Rename STEPS item**

In `frontend/src/components/LiveCard.jsx`, find the `STEPS` array (lines 4-10). Change the 4th step:

```jsx
const STEPS = [
  'Edital e documentação',
  'Preço de mercado da região',
  'Ônus e riscos na matrícula',
  'Lance máximo e custos',
  'Parecer de viabilidade',
];
```

- [ ] **Step 2: Add Avaliação/Mercado IA line to LiveCardHero**

Find `LiveCardHero` (lines 15-74). In the Body section (after the "Lance mínimo" block at lines 63-70), replace the single-value block with a dual-value layout:

```jsx
      {/* Body */}
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <span className="tag">
            {entry.auctionType || 'Leilão Judicial'}
          </span>
          <span className="tag">{entry.type || 'Imóvel'}</span>
        </div>

        <h3 className="h3" style={{ marginBottom: 2 }}>{entry.title}</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--fg-2)' }}>
          {entry.neighborhood ? `${entry.neighborhood}, ` : ''}{entry.city}
        </p>

        {/* Pricing — 3 valores: lance, avaliação, mercado IA */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--fg-3)', marginBottom: 2 }}>Lance mínimo</span>
            <span className="mono" style={{ fontSize: 17, fontWeight: 600, color: 'var(--fg-0)' }}>
              R$ {fmtBRL(entry.minBid)}
            </span>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--fg-3)', marginBottom: 2 }}>Avaliação leilão</span>
            <span className="mono" style={{ fontSize: 17, fontWeight: 500, color: 'var(--fg-1)' }}>
              R$ {fmtBRL(entry.appraisal)}
            </span>
            <div className="mono" style={{ fontSize: 10, color: 'var(--fg-2)', marginTop: 2 }}>
              {(entry.auctionDiscount ?? 0) >= 0
                ? `${entry.auctionDiscount ?? 0}% deságio`
                : `+${Math.abs(entry.auctionDiscount ?? 0).toFixed(1)}% ágio`}
            </div>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--fg-3)', marginBottom: 2 }}>
              <span className="ia-chip" style={{ marginRight: 5 }}>IA</span>
              Mercado IA
            </span>
            <span className="mono" style={{ fontSize: 17, fontWeight: 600, color: 'var(--fg-0)' }}>
              R$ {fmtBRL(entry.market)}
            </span>
            <div className="mono" style={{
              fontSize: 10, marginTop: 2, fontWeight: 500,
              color: (entry.discount ?? 0) > 0 ? 'var(--good)' : (entry.discount ?? 0) < 0 ? 'var(--bad)' : 'var(--fg-2)',
            }}>
              {(entry.discount ?? 0) >= 0 ? `+${entry.discount}% desconto IA` : `${entry.discount}% acima IA`}
            </div>
          </div>
        </div>
      </div>
```

- [ ] **Step 3: Verify visually**

Run: `cd frontend && npm run dev`
Open http://localhost:5173/ — if there's history, the LiveCardHero at top shows 3 columns: Lance / Avaliação / Mercado IA. No ROI anywhere.

(If no history yet, run the analyze flow once to populate, or skip visual check.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/LiveCard.jsx
git commit -m "feat(livecard): rename step, add avaliação + mercado IA to hero"
```

---

## Task 12: Fix label "abaixo da avaliação" no Market tab + chip IA no spread card

**Files:**
- Modify: `frontend/src/components/PropertyDetail.jsx:495-510`

**Context:** No `Market` tab do detail, o texto do spread card diz "abaixo da avaliação" referindo-se a `p.market`. Hoje `p.market` é IA, não avaliação. Vamos corrigir o texto e adicionar chip "IA" no header do card.

- [ ] **Step 1: Fix the spread card label**

In `frontend/src/components/PropertyDetail.jsx`, find the Market tab spread card (lines 505-510). Replace:

```jsx
            <div style={{ marginTop: 18, padding: '12px 14px', background: gapValue >= 0 ? 'var(--good-soft)' : 'var(--bad-soft)', borderRadius: 6, fontSize: 13, color: 'var(--fg-0)' }}>
              <b style={{ color: gapValue >= 0 ? 'var(--good)' : 'var(--bad)', fontFamily: 'var(--f-mono)' }}>R$ {fmtBRL(Math.abs(gapValue))}</b>
              <span style={{ color: 'var(--fg-1)' }}> de gap bruto · </span>
              <b>{discountPct >= 0 ? `−${discountPct.toFixed(0)}%` : `+${Math.abs(discountPct).toFixed(1)}%`}</b>
              <span style={{ color: 'var(--fg-1)' }}> {discountPct >= 0 ? 'abaixo' : 'acima'} do mercado IA</span>
            </div>
```

(Substitui "abaixo da avaliação" por "abaixo do mercado IA".)

- [ ] **Step 2: Add IA chip next to "Mercado estimado" label**

Find the right column of the spread bar (around lines 500-504). Replace:

```jsx
              <div style={{ textAlign: 'right' }}>
                <span className="uppy" style={{ color: 'var(--fg-3)' }}>
                  <span className="ia-chip" style={{ marginRight: 6 }}>IA</span>
                  Mercado estimado
                </span>
                <div className="num-md" style={{ marginTop: 4 }}>R$ {fmtBRL(p.market)}</div>
              </div>
```

- [ ] **Step 3: Verify visually**

Run: `cd frontend && npm run dev`
Open any property detail → Mercado tab. Confirm: chip "IA" ao lado de "Mercado estimado", texto "abaixo do mercado IA".

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PropertyDetail.jsx
git commit -m "fix(detail-market): label 'mercado IA', add IA chip to spread card"
```

---

## Task 13: Smoke test final + lint

- [ ] **Step 1: Run backend tests**

Run: `cd backend && python -m pytest -x`
Expected: all PASS.

- [ ] **Step 2: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: no errors. (Warnings OK, errors not.)

- [ ] **Step 3: Build frontend**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke test**

Run: `cd frontend && npm run dev` (backend via `./run-backend.sh`)
Walk through:
- `/` (Home): Top oportunidades ordenado por desconto IA, sem "+X% ROI".
- `/feed` (grid): cada card mostra "lance mínimo", "Avaliação leilão", "[IA] Mercado IA". Sem "ROI projetado".
- `/feed` (lista): 8 colunas, sem coluna ROI.
- Filtros: sem "ROI ≥ X%". Ordenação: sem "melhor ROI".
- `LiveCardHero` (se houver histórico): 3 colunas (lance / avaliação / mercado IA).
- `/detail/<id>` tab Mercado: chip IA, texto "abaixo do mercado IA".
- `/detail/<id>` tab Custos: simulador ainda mostra "ROI líquido projetado" — esse fica, é diferente (calculado no frontend com base no simulador, não é o ROI solto do card).

- [ ] **Step 5: Final commit if any pending changes**

```bash
git status
# if anything pending:
git add -A
git commit -m "chore: smoke-test pass"
```

---

## Self-Review (autor, depois de escrever)

**Spec coverage:**
- Seção 1 (card) → Task 7 ✓
- Seção 2 (tabela) → Task 8 ✓
- Seção 3 (filtros/ordenação/resumo) → Task 9 ✓
- Seção 4 (Home + LiveCard) → Tasks 10 + 11 ✓
- Seção 5 (detail Market tab label consistency) → Task 12 ✓
- Modelo de dados (backend appraisal + auctionDiscount) → Tasks 1 + 2 ✓
- seed.json (backend + vercel) → Tasks 3 + 4 ✓
- Dashboard Vercel KPI → Task 5 ✓
- CSS utility → Task 6 ✓
- Smoke test → Task 13 ✓

**Placeholder scan:** Não há TBD/TODO. Todos os passos têm código completo.

**Type consistency:** `appraisal` (float) + `auction_discount` (float) em snake no backend, `appraisal` + `auctionDiscount` em camel no frontend (via `_to_camel` alias generator). `PropertyCard`/`PropertyRow` leem `p.appraisal` e `p.auctionDiscount`. `LiveCardHero` lê `entry.appraisal` e `entry.auctionDiscount`. Seed.json usa camelCase (`appraisal`, `auctionDiscount`).

**Bug known issue:** `output.py:439-447` é corrigido em Task 2 —就将 `market` vira IA (correctly), `appraisal` leva avaliação do edital. Tests updated accordingly.

---
