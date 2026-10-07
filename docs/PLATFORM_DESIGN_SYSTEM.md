# Padrão visual da plataforma (Client First)

Toda interface nova ou alterada segue este padrão, herdado da LP
(`C:/Projetos/GL2/landing-page/DESIGN-SYSTEM.md`). A fonte de verdade é
`frontend/src/design-system.css`: tokens `--ui-*`, classes de componente e
variantes `is-*`. `npm run lint:design` confere REM, tokens obrigatórios e
movimento.

## Regras

- Medidas em REM com os tokens; nada de px novo nem tamanhos numéricos inline
  no React. Não fixar a fonte raiz do navegador.
- Nomes por componente (`property_summary-price`) e variantes `is-*`
  (`is-current`, `is-secondary`, `is-selected`).
- Um componente tem os mesmos estados em todas as telas; antes de criar um
  novo, reaproveite `ui-button`, `ui-tag` e os selos existentes.

## Tokens

| Família | xs | sm | md | lg | xl |
| --- | --- | --- | --- | --- | --- |
| Espaço `--ui-space-*` | .5rem | .75rem | 1rem | 1.5rem | 2rem |
| Texto `--ui-text-*` | .8125rem | .875rem | .9375rem | 1rem | 1.125rem |
| Controle `--ui-control-*` | — | 2.5rem | 3rem | 3.25rem | — |

Raios: `--ui-radius-md` .75rem (blocos internos), `--ui-radius-card` 1rem
(cards e painéis), `--ui-radius-pill` (botões, selos). Borda .0625rem.

## Botões

- `ui-button`: principal, roxo. Um por bloco.
- `is-secondary`: branco com borda neutra. `is-text`: link de ação.
- Na mesma tela, todos os botões usam a mesma altura. Na página do imóvel o
  padrão é `is-sm` (2.5rem, texto .875rem): ações do topo, documentos e abas.
- Ícone SVG de 1rem dentro do botão.

## Cores e estados

- Marca `#7C3AED`, hover `#6D28D9`, superfície `#F3EFFE`; texto `#1D1D1F`,
  secundário `#494952`/`#5E5E65`; borda `#E8E8ED`; fundo suave `#F5F5F7`;
  positivo `#15803D`; erro `#D70015`.
- Hover só com mouse (`hover: hover` e `pointer: fine`): borda roxa fina, sem
  mudar o fundo. Selecionado tem fundo roxo; seu hover usa
  `--ui-selected-hover-ring` (traço branco interno).
- Foco: contorno de .125rem a .1875rem de distância. Desabilitado: opacidade .5.
- Sem animação infinita; respeitar movimento reduzido.

## Tipografia

Plus Jakarta Sans em títulos e preços; Inter no corpo. Nenhum texto de
interface abaixo de .8125rem (13px). Preços com `tabular-nums`.

## Layout

Página do imóvel com largura máxima de 80rem; margem lateral 1.5rem no desktop
e 1rem no celular. Sem rolagem horizontal de 320px para cima.
