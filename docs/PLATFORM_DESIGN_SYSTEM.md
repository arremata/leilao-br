# Padrão visual da plataforma

**Estado:** os parâmetros herdados da LP são obrigatórios para novas interfaces e alterações, por solicitação do usuário. A interface existente ainda está parcialmente alinhada; adaptações específicas de layout permanecem propostas para validação.

Este documento traduz o padrão Client First da home da LP para a plataforma. A escolha de usar a mesma linguagem visual foi solicitada pelo usuário; as medidas específicas de adaptação abaixo são uma proposta operacional e devem ser conferidas na preview.

Valores atuais e diagnóstico específico do painel do imóvel: [PARAMETROS_VISUAIS_E_PAINEL_IMOVEL.md](PARAMETROS_VISUAIS_E_PAINEL_IMOVEL.md).

## Medidas em REM e tamanhos nomeados

**Implementado na primeira etapa:** `frontend/src/design-system.css` contém os
tokens compartilhados; o painel da página do imóvel, sua foto e ações usam esse
contrato. Os valores em px nas tabelas antigas deste documento são equivalências
para leitura com fonte-base de 16 px, não unidades para novas declarações.
Não fixar o tamanho da fonte raiz: REM deve respeitar a preferência do navegador.

| Família | 2xs | xs | sm | md | lg | xl | 2xl |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `--ui-space-*` | .25rem | .5rem | .75rem | 1rem | 1.5rem | 2rem | 3rem |
| `--ui-text-*` | — | .8125rem | .875rem | .9375rem | 1rem | 1.125rem | 1.5rem |
| `--ui-control-*` | — | — | 2.5rem | 3rem | 3.25rem | — | — |

Título maior: `--ui-text-3xl: 1.75rem`. Raios: `md: .75rem`,
`lg: 1.25rem`, `pill: 999rem`. Bordas: `sm: .0625rem`, `md: .125rem`
(a segunda é usada no foco). Usar nomes por função: `ui-button is-sm`,
`is-lg`, `is-secondary`, `is-inverse` e `is-text`.

Na barra de ações do imóvel, as ações usam `sm` no desktop e altura `lg` no
mobile para acomodar duas linhas. Todas têm a mesma altura em cada tamanho de
tela. Abaixo de 22rem, ficam em uma coluna. SVG, proporções, porcentagens,
pesos tipográficos e tempos de animação não são medidas em px a converter.

Novas dimensões de interface devem usar REM e preferir os tokens. Não reaproveitar
medidas inline numéricas de React, que geram px. `npm run lint:design` verifica
REM, tokens obrigatórios e movimento em `design-system.css`; não certifica os
arquivos legados, que continuam pendentes de migração.

## Fonte de referência

LP: `C:/Projetos/GL2/landing-page/DESIGN-SYSTEM.md`, `lp/client-first.css` e `lp/styles.css`. Não usar o blog ou páginas para investidores como uma segunda referência conflitante.

## Papéis compartilhados

| Papel | Regra |
| --- | --- |
| Famílias | Plus Jakarta Sans nos títulos; Inter no corpo; JetBrains Mono em números/código quando ajuda a leitura |
| Corpo | 16 px; explicações secundárias podem usar 15 px |
| Auxiliares | Mínimo 13 px; não diminuir texto para fazê-lo caber |
| Título de tela | Proposta de 28–32 px desktop e 24–28 px mobile |
| Título de seção | Proposta de 22–28 px, conforme hierarquia |
| Título de item | 18 px; papéis maiores precisam de justificativa clara |
| Preço das rodadas | Preservar destaque e alinhamento aprovado; 22 px atual, com adaptação de 18 px em telas de até 360 px |
| Botão padrão | 48 px, fonte 15 px/600, formato arredondado |
| Botão pequeno / grande | 40 px e 14 px / 52 px e papel tipográfico do padrão |
| Borda de botão | 1 px em todas as variantes; transparente onde o desenho não exige contorno |
| Ícone em ação | SVG de 16 px; área acionável pertence ao botão |
| Campo | Raio 12 px, fundo suave; fonte 15 px desktop e 16 px mobile |
| Card, painel e modal | Raio 20 px e borda leve |
| Selos e tags | Arredondados; fonte mínima 13 px |

Seleções em cartões, controles segmentados e controles de tabelas devem manter sua função e estados acessíveis. Documentar a adaptação desses componentes; não substituir sua semântica por um botão genérico.

## Cores e interação

- Marca `#7C3AED`; hover `#6D28D9`; superfície de marca `#F3EFFE`.
- Texto principal `#1D1D1F`; auxiliares da LP `#494952`, `#5E5E65` e `#6C6C71`, conforme papel e contraste no fundo real.
- Borda `#E8E8ED`; fundo suave `#F5F5F7`; positivo de texto `#15803D`.
- Declarar cores no conjunto de tokens. Manter compatibilidade dos nomes antigos durante a migração para evitar mudanças parciais difíceis de verificar.
- Hover em ações somente com `hover: hover` e `pointer: fine`: borda fina roxa,
  preservando fundo e texto normais. Não preencher uma ação secundária ao passar
  o mouse. Essa atualização foi solicitada para a plataforma e prevalece sobre
  o hover preenchido da LP. Estado selecionado usa sinal persistente próprio.
- Pressionamento com `scale(.97)` e duração de 160 ms. Não levantar botões ou cards.
- Foco visível e coerente; campos com borda roxa e anel de 3 px. Não remover indicação de teclado.
- Sem animações infinitas. Movimento reduzido elimina deslocamentos; transições devem indicar propriedades explícitas.
- Botão Google mantém o desenho e as exigências do provedor.

### Variantes de ação

- **Principal:** fundo roxo, texto branco; um principal por bloco.
- **Secundária:** fundo branco, texto principal e borda neutra de 1 px.
- **Inversa:** fundo branco, texto roxo e borda branca de 1 px, para fundos escuros.
- **Link de ação:** texto roxo e fundo/borda transparentes; sem caixa de altura fixa no CSS da LP. Hover escurece e revela sublinhado.
- Principal, secundária e inversa compartilham feedback de borda no hover,
  mantendo a aparência normal. Controles selecionados usam fundo roxo e texto
  branco. No hover de uma ação roxa ou selecionada, um traço fino branco fica
  **por dentro** do preenchimento, mantendo a borda externa roxa. Usar o token
  `--ui-selected-hover-ring` com sombra interna, sem outline externo;
  em controles brancos não selecionados, fica roxa. Hover não altera seleção.
- Foco em ações: contorno de 2 px e afastamento de 3 px; desabilitado: opacidade 0,5 e sem transformação. O contorno de foco é diferente da borda normal de 1 px.

## Espaçamento e estrutura

Aplicar uma escala comum de 4, 8, 12, 16, 24, 32 e 48 px. A plataforma tem maior densidade de informação que uma página de marketing: preservar a largura útil de até 1480 px do catálogo durante a migração, em vez de limitar todas as telas ao contêiner de 1120 px da LP.

Proposta de margem lateral: 24 px no desktop e 16 px no mobile. Conferir filtros, tabelas e rodadas em 320 px. Manter o alinhamento compartilhado dos cards e permitir quebra de texto, sem truncar informações essenciais ou criar preços sobrepostos.

## Organização e manutenção

Separar tokens e estilos globais dos componentes; usar prefixos de componente e variantes `is-*` com funções claras. Migrar estilos inline de aparência fixa para classes. Valores derivados dos dados, como progresso e largura de barras, podem permanecer dinâmicos.

Consolidar botões, campos, selos, cartões e estados vazios antes de refazer cada página. O mesmo componente deve oferecer os mesmos estados nas diferentes telas.

## Critérios de conclusão da migração

- Nenhum texto de interface abaixo de 13 px, salvo desenho/ícone ou regra do provedor documentada.
- Botões e campos seguem os papéis definidos; controles auxiliares têm área de toque adequada.
- Sem rolagem horizontal nos tamanhos verificados; preços e conteúdo dos cards alinhados.
- Contraste conferido nos fundos reais; foco, teclado, hover e movimento reduzido verificados.
- Catálogo, quatro abas do imóvel, Salvos/Vistos, erros/vazios, conta e questionário conferidos.
- Lint, build e testes pertinentes passam; preview validada antes do PR de produção.
- Autenticação, filtros, fórmulas financeiras e persistência mantêm seus contratos.

O diagnóstico e as evidências anteriores à migração estão em [AUDITORIA_CLIENT_FIRST_PLATAFORMA.md](AUDITORIA_CLIENT_FIRST_PLATAFORMA.md).
