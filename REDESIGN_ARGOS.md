# Plano de Redesign: Arremate → Argos

> Reskin visual do frontend `arremata/leilao-br` para a identidade **Argos** (Arctic / Violet).
> Troca de tokens, tipografia e vidro — **sem tocar em funcionalidade**.

**Regra de ouro:** NÃO alterar nenhuma funcionalidade. Nada de mudar estado, props, fluxo de telas, chamadas de API ou lógica de filtros/ordenação/watchlist/histórico/análise. É troca de design apenas.

---

## 00 — Estratégia de branch

A `main` permanece como backup intacto. Todo o trabalho vai numa branch nova.

```bash
git checkout main
git pull
git checkout -b redesign/argos
# ... aplicar as mudanças deste plano, commitando por etapa ...
git push -u origin redesign/argos
# abrir PR redesign/argos -> main (revisão visual, sem merge automático)
```

**Não tocar** em `backend/`, `api.js`, `utils.js`, nem na lógica de nenhum componente.

---

## 01 — Princípios da identidade

- **Acento único** = violet `#7C3AED`. Única cor de marca. Todo o resto é neutro (escala Arctic).
- **Verde / âmbar / vermelho** = apenas dados (score, risco, variação). Nunca decoração ou fundo de seção. Tons mais fortes/contrastados que o tema atual.
- **Vidro funcional e sutil** — topbar, filtros, dropdowns, modais e chips sobre a foto. Sem vidro em tabelas densas, inputs e texto longo.
- **Tipografia com personalidade:** display Bricolage Grotesque, corpo Inter, números JetBrains Mono (tabular).
- **Cantos quadrados-ish**, sombras frias e leves (máx. opacidade ~0.08).

> Fonte da verdade visual: o protótipo aprovado `Argos Feed.dc.html`.

---

## 02 — Tokens em `styles.css`

O maior alavancador. Substituir somente os valores dos custom properties no bloco `:root`; os nomes permanecem iguais, então a maior parte do app reskina sozinha. Adicionar `--f-display`.

```css
:root {
  /* Fundo Arctic */
  --bg-0: #FAFAFA; --bg-1: #FFFFFF; --bg-2: #F3F4F6; --bg-3: #ECEEF1;

  /* Linhas */
  --line-1: #E5E7EB; --line-2: #D1D5DB; --line-3: #9CA3AF;

  /* Texto */
  --fg-0: #111827; --fg-1: #374151; --fg-2: #6B7280; --fg-3: #9CA3AF;

  /* Acento — Argos Violet (ÚNICA cor de marca) */
  --accent: #7C3AED; --accent-strong: #6D28D9;
  --accent-soft: #EDE9FE; --accent-ink: #FFFFFF;

  /* Sinais (somente dados) — contraste alto */
  --good: #16A34A; --good-soft: #DCFCE7;
  --warn: #B45309; --warn-soft: #FEF3C7;
  --bad: #DC2626;  --bad-soft: #FEE2E2;

  /* Fontes */
  --f-display: 'Bricolage Grotesque', system-ui, sans-serif;
  --f-sans: 'Inter', system-ui, sans-serif;
  --f-mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

O projeto usava `oklch(...)`; hex funciona igual. `color-mix(...)` na topbar/filtros continua válido.

### Tabela de referência

| Token              | Valor Argos | Uso                  |
| ------------------ | ----------- | -------------------- |
| `--bg-0` / `--bg-1`| `#FAFAFA` / `#FFFFFF` | Página / card |
| `--accent`         | `#7C3AED`   | CTA, links, ativos   |
| `--good`           | `#16A34A`   | Score alto, ↑         |
| `--warn`           | `#B45309`   | Atenção              |
| `--bad`            | `#DC2626`   | Risco, ↓              |

---

## 03 — Tipografia

### 3.1 Carregar as fontes — `index.html`

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">
```

Remover o carregamento de IBM Plex. `--f-sans` / `--f-mono` já apontam para Inter / JetBrains.

### 3.2 Display nos títulos — `styles.css`

```css
.brand { font-family: var(--f-display); font-weight: 800; letter-spacing: -0.03em; }
.h1    { font-family: var(--f-display); font-weight: 800; letter-spacing: -0.035em; }
.h2    { font-family: var(--f-display); font-weight: 700; letter-spacing: -0.02em; }
.h3    { font-family: var(--f-display); font-weight: 700; letter-spacing: -0.01em; }
```

`.num-*` seguem em `--f-mono`; corpo segue Inter via `body`.

---

## 04 — Vidro e superfícies

### 4.1 Topbar (glass + solidifica no scroll)

```css
.topbar {
  background: rgba(255,255,255,0.72);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border-bottom: 1px solid rgba(229,231,235,0.7);
  transition: background .25s ease, box-shadow .25s ease;
}
.app-shell.scrolled .topbar {
  background: rgba(255,255,255,0.88);
  box-shadow: 0 6px 24px rgba(17,24,39,0.06);
}
```

> **Nota:** `.app-shell.scrolled` requer o `useEffect` da seção 06.2 (funcionalidade nova — scroll handler + classe CSS).

### 4.2 Barra de filtros (`.filter-bar`)

Manter o blur existente; harmonizar: `rgba(255,255,255,0.6)` + `blur(16px) saturate(1.3)`. Só trocar valores no estilo inline já presente — sem mexer em lógica.

### 4.3 Card — opção A (default) e B opcional só no grid

```css
/* A. Sólido com sombra fria (recomendado p/ dados densos) */
.card {
  background: var(--bg-1);
  border: 1px solid var(--line-1);
  border-radius: 12px;
}
.card.hov:hover {
  border-color: var(--line-2);
  box-shadow: 0 8px 28px rgba(17,24,39,0.06);
  transform: translateY(-2px);
}

/* B. Vidro leve — APENAS .property-card do grid (opcional) */
.property-card {
  background: rgba(255,255,255,0.65);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,0.6);
  box-shadow: 0 4px 20px rgba(17,24,39,0.05);
}
```

> Nunca aplicar vidro nas linhas da Lista (`.property-row`) nem em inputs.

### 4.4 Chips sobre a foto — `shared.jsx`

Trocar `oklch(1 0 0 / 0.9)` por `rgba(255,255,255,0.78)` + `backdropFilter:'blur(8px)'` + `border:'1px solid rgba(255,255,255,0.6)'`. Sem mudar a estrutura.

### 4.5 Botões (CTA compacto + sombra violet)

```css
.btn.primary {
  box-shadow: 0 4px 16px rgba(124,58,237,0.22);
}
.btn.primary:hover {
  box-shadow: 0 6px 20px rgba(124,58,237,0.30);
  transform: translateY(-1px);
}
```

---

## 05 — Score & sinais — `shared.jsx`

A lógica já é por token, então recolore sozinha. Ajustes visuais mínimos:

- **ScoreBadge:** anel mais forte — `strokeWidth="3"`. Manter thresholds 75/50 (ou alinhar ao protótipo 70/50 — decisão de produto). Opcional: fundo do badge em vidro.
- **RiskSummary / RiskDots /** `.tag.dot`**:** nada além dos tokens — já usam `--good`/`--warn`/`--bad`, agora os sinais Argos de alto contraste.

Chips de exemplo:

| Chip              | Cor usada   |
| ----------------- | ----------- |
| Desocupado        | `--good`    |
| Ocupado           | `--warn`    |
| Risco jurídico    | `--bad`     |
| Novo              | `--accent`  |

---

## 06 — Fundo ambiente + scroll (sutil)

Sem efeito seguindo o mouse (fica artificial). Apenas fundo ambiente discreto + topbar solidificando + barra de progresso fina.

> **ATENÇÃO — funcionalidade nova:** As seções 06.1 e 06.2 adicionam comportamento visual que NÃO existe hoje (pseudo-elemento `::before`, scroll handler, progress bar). São adições puramente visuais, mas envolvem novo JS e novo DOM. Nenhuma funcionalidade existente é alterada ou removida.

### 6.1 Fundo ambiente (CSS) — ADIÇÃO

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
.topbar, .page { position: relative; z-index: 1; }
```

### 6.2 Scroll: classe + progresso — `App.jsx` — ADIÇÃO

```jsx
// dentro de App(), junto aos outros hooks — só visual, sem tocar lógica
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

```jsx
// barra de progresso: primeiro filho dentro da .topbar (TopBar)
<div id="argos-progress" style={{
  position: 'absolute', left: 0, bottom: 0, height: 2,
  width: 0, background: 'var(--accent)', transition: 'width .1s linear'
}} />
```

---

## 07 — Valores `oklch()` hardcoded (não cobertos por tokens)

Além dos tokens no `:root`, existem ~25 valores `oklch()` escritos diretamente em inline styles e CSS que **não recoloram automaticamente** com a troca de tokens. Todos precisam ser convertidos para `rgba()` equivalente ou para tokens existentes.

### 7.1 `styles.css`

| Linha | Valor atual | Substituir por | Contexto |
|-------|-------------|----------------|----------|
| `.card.hov:hover` | `oklch(0 0 0 / 0.05)` | `rgba(17,24,39,0.05)` | card hover shadow |
| `.ph` | `oklch(0.92 0.005 75)` | `var(--bg-3)` ou `#ECEEF1` | placeholder bg |
| `.ph` gradient | `oklch(0.95 0.005 75)` / `oklch(0.9 0.005 75)` | `#F3F4F6` / `#E5E7EB` | placeholder gradient |
| `.ph-label` | `oklch(1 0 0 / 0.8)` | `rgba(255,255,255,0.8)` | label overlay |
| `.slider` thumb | `oklch(0 0 0 / 0.15)` | `rgba(17,24,39,0.15)` | thumb shadow |
| **`.tag.warn`** | `oklch(0.45 0.16 75)` | `var(--warn)` | **cor hardcoded, deveria ser token!** |

### 7.2 `App.jsx`

| Linha | Valor atual | Substituir por | Contexto |
|-------|-------------|----------------|----------|
| 178 | `oklch(0.75 0.06 60)` | `#A8A29E` ou `var(--fg-3)` | avatar bg |
| 196 | `oklch(0 0 0 / 0.1)` | `rgba(17,24,39,0.1)` | user menu shadow |

### 7.3 `Feed.jsx`

| Linha | Valor atual | Substituir por | Contexto |
|-------|-------------|----------------|----------|
| 289 | `oklch(0 0 0 / 0.08)` | `rgba(17,24,39,0.08)` | filter dropdown shadow |

### 7.4 `shared.jsx`

| Linha | Valor atual | Substituir por | Contexto |
|-------|-------------|----------------|----------|
| 234 | `oklch(1 0 0 / 0.9)` | `rgba(255,255,255,0.78)` + blur | countdown overlay (ver 4.4) |
| 247 | `oklch(1 0 0 / 0.9)` | `rgba(255,255,255,0.78)` + blur | watch button bg |
| 345–346 | `oklch(0.92 0.005 75)` + gradient | `#ECEEF1` + `rgba(...)` gradient | PropertyRow thumbnail |

### 7.5 `PropertyDetail.jsx`

| Linha | Valor atual | Substituir por | Contexto |
|-------|-------------|----------------|----------|
| 95 | `oklch(1 0 0 / 0.92)` | `rgba(255,255,255,0.92)` | gallery label overlay |
| 117–118 | `oklch(0.92 0.005 75)` + gradient | `#ECEEF1` + `rgba(...)` gradient | thumbnail placeholder |
| 124 | `oklch(1 0 0 / 0.8)` | `rgba(255,255,255,0.8)` | thumbnail mini label |
| 623 | `oklch(0 0 0 / 0.15)` | `rgba(17,24,39,0.15)` | toggle switch shadow |
| 926–927 | `oklch(1 0 0 / 0.92)` / `oklch(0 0 0 / 0.08)` | `rgba(255,255,255,0.92)` / `rgba(17,24,39,0.08)` | legal locked card |

---

## 08 — O que NÃO tocar

- **`App.jsx`** — somente acrescentar o `useEffect` de scroll e o `<div id="argos-progress">`. Não mexer em `screen`, `go`, `watched`, `history`, `handleAnalyze`, `handleSearch`, rotas, `localStorage`.
- **`Feed.jsx`** — manter `filtered`, `sort`, `view`, `page`, `clearAll` e todos os `Filter`/`RangeChip`/`Sort`/`ViewToggle`/`Empty`. Só ajustar valores de estilo.
- **`PropertyDetail` / `Home` / `Watchlist` / `History`** — reskin herda dos tokens. Nenhuma mudança de lógica/estado/props.
- **`api.js`, `utils.js`, `backend/`** — não tocar.

---

## 09 — Ordem de execução (commits pequenos)

1. `feat(theme): tokens Arctic/violet em styles.css`
2. `feat(theme): fontes Bricolage/Inter/JetBrains + display nos títulos`
3. `feat(theme): converter oklch hardcoded para rgba em styles.css`
4. `feat(theme): converter oklch hardcoded para rgba nos componentes JSX`
5. `feat(theme): vidro em topbar/filtros/cards/chips + CTA violet`
6. `feat(theme): ajustes de score e chips de sinal`
7. `feat(theme): fundo ambiente + scroll (nav solidify + progress)`

---

## 10 — Checklist de aceite (QA visual)

- [ ] App abre sem erros de console; todas as telas navegam igual à `main`.
- [ ] Filtros, ordenação, grid/lista, watchlist, historico e "Analisar URL" funcionam identicos.
- [ ] Pagina em `#FAFAFA`; cards brancos/vidro; acento violet so em CTAs/links/ativos.
- [ ] Verde/ambar/vermelho aparecem apenas em score, risco e variacao — nunca como decoracao.
- [ ] Titulos em Bricolage; corpo em Inter; numeros em JetBrains Mono (tabular).
- [ ] Topbar solidifica ao rolar; barra de progresso violet preenche; sem efeito de mouse.
- [ ] Vidro ausente em inputs e nas linhas da Lista.
- [ ] Responsivo (<=860px e <=560px) mantem o comportamento atual.
- [ ] Contraste AA mantido; sinais acompanhados de icone/rotulo, nao so cor.
- [ ] Nenhum valor `oklch()` restante no codebase (todos convertidos para `rgba()` ou tokens).

---

## 11 — Cola rapida de valores

```
Pagina #FAFAFA · Card #FFFFFF · Linha #E5E7EB
Texto #111827 / #374151 / #6B7280 / #9CA3AF
Acento #7C3AED (hover #6D28D9, soft #EDE9FE)
Sinais verde #16A34A/#DCFCE7 · ambar #B45309/#FEF3C7 · vermelho #DC2626/#FEE2E2

Glass topbar  rgba(255,255,255,0.72) blur(20px) saturate(1.4)
Glass card    rgba(255,255,255,0.65) blur(16px)
Glass chip    rgba(255,255,255,0.78) blur(8px)

Display  Bricolage Grotesque 700-800
Corpo    Inter 400-600
Numeros  JetBrains Mono 500-700

Radius 8 (botao) / 12 (card)
Sombra fria max .08
Sombra CTA rgba(124,58,237,.22)
```

---

> **Arremate → Argos** · branch `redesign/argos` · `main` = backup
