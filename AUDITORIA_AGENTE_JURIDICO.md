# Agente Jurídico — inventário completo e plano de precisão

**Repositório:** `arremata/leilao-br` · **Branch analisado:** `feat/juridico-agente` (2 commits à frente do fork, 2 commits atrás de `main`)
**Data:** 29/07/2026

---

## Sumário executivo

O agente jurídico existe em **duas realidades desconectadas**:

| | Onde | Tamanho | Estado |
|---|---|---|---|
| **Backend real** | `backend/graph/legal.py` | 131 linhas · 1 nó · 1 chamada LLM | Produz 14 campos de texto solto, **sem nenhuma citação de fonte** |
| **Frontend "promessa"** | `frontend/src/data/legalDemo.js` + `LegalDetail` | 263 + ~280 linhas | Estrutura rica, ramificada por modalidade, com estados de verificação — **mas é mock hardcoded para 3 ids** |

**O buraco central:** o contrato de saída `AuctionPropertyResult` (`backend/graph/contracts.py:137-187`) **não tem campo `legal`**. Portanto `p.legal` nunca existe e o frontend sempre cai no mock (`PropertyDetail.jsx:40`). O backend produz o `LegalResult` e joga ~80% dele no lixo — sobrevivem apenas IPTU, condomínio e ocupação, transformados em alertas e custos.

**A boa notícia:** o design do frontend já entendeu o problema certo (proveniência, estados de verificação, ramificação por modalidade). Ele está *à frente* do backend. O trabalho é fazer o backend produzir aquilo de verdade — e ir além, com citação por documento/página/movimento.

---

## Parte 1 — O que existe hoje, exatamente

### 1.1 Backend: `backend/graph/legal.py`

Um único nó LangGraph, uma única chamada LLM.

```
discovery → planner → [market, legal] ← paralelo → scoring → output
```
(`backend/graph/workflow.py:24-51`)

**Modelo:** `openai/claude-sonnet-4.6` via LiteLLM, `max_tokens=4096` (`legal.py:76-90`)

**Entradas:**

| Entrada | Origem | Observação |
|---|---|---|
| `PropertyMetadata` | discovery/planner | 22 campos — address, matrícula, process_number, creditor, debtor… (`state.py:9-33`) |
| `pdf_texts[:8000]` | `pdf_parser.parse_pdf()` | **Truncado em 8.000 caracteres** — ver §2.2 |
| 5 buscas Tavily | `_run_legal_searches()` | **Só no branch.** `main` removeu (commit `fd01485`, "drop Tavily") |

As 5 queries removidas eram (`legal.py:45-51`):
```
certidao onus matricula {matricula} {city}
acoes judiciais {address} {city}
divida ativa {address} {city} {state}
IPTU debito {address} {city}
zoneamento {neighborhood} {city} {state}
```

**Prompt:** 27 linhas, em inglês, pede JSON estrito (`legal.py:11-37`). Contém apenas uma orientação de método: *"Pay special attention to the PDF text - editais often contain critical legal information"*.

**Saída — `LegalResult`, 14 campos planos** (`state.py:63-78`):

| Campo | Tipo | Para onde vai hoje | Veredito |
|---|---|---|---|
| `registration_status` | str | **nenhum lugar** | descartado |
| `liens` | list[str] | `edital.liens` (`output.py:384-385`) | texto livre, sem fonte |
| `judicial_disputes` | list[str] | **nenhum lugar** | descartado |
| `tax_debts_iptu` | str | alerta + custo + lien (`output.py:180, 340, 386`) | usado, mas parseado por regex de BRL |
| `tax_debts_itbi` | str | **nenhum lugar** | conceitualmente errado — ITBI é imposto do comprador, não dívida do imóvel |
| `condominium_debts` | str | alerta + custo + lien (`output.py:182, 350, 388`) | usado |
| `federal_state_debts` | str | só flag de risco (`scoring.py:115`) | genérico, sem fonte |
| `zoning_compliance` | str | **nenhum lugar** | quase nunca está no edital → LLM inventa ou diz "N/A" |
| `construction_permits` | str | **nenhum lugar** | idem |
| `occupation_status` | str | ocupação + custo (`output.py:184, 455`) | usado |
| `usufruct_rights` | str | **nenhum lugar** | descartado — e é um dos ônus que *sobrevive* à arrematação |
| `risk_level` | str | flag de risco (`scoring.py:110`) | 4 níveis, sem justificação rastreável |
| `risk_details` | str | **nenhum lugar** | descartado |
| `raw_findings` | str | **nenhum lugar** | descartado |

**Placar: 5 dos 14 campos são consumidos. 9 são gerados, pagos em tokens, e descartados.**

### 1.2 Frontend: o que o produto promete

`frontend/src/data/legalDemo.js` — 3 imóveis (`a1`, `a2`, `a3`), um por modalidade:

| id | Cidade | Modalidade | Base legal declarada |
|---|---|---|---|
| `a1` | Curitiba · Caixa | `extrajudicial` | Lei 9.514/97, art. 27 |
| `a2` | Londrina | `judicial` | CPC arts. 879-903 |
| `a3` | Londrina · Caixa | `venda-direta` | Compra e venda — sem nulidade processual |

**Blocos da estrutura** (renderizados em `PropertyDetail.jsx:1236-1516`):

| Bloco | § na UI | Conteúdo |
|---|---|---|
| `modalidade` + `baseLegal` | 05 | Cabeçalho — qual regime jurídico se aplica |
| `conclusao` | 05 | `recomendacao` (participar/cautela/nao) + `principalRisco` + `providencia` |
| `riscos[]` | 05.01 | `{tipo, nivel, verificacao, fonte}` — grid de cards |
| `processo` + `partes` | 05.02 | tipo, número, foro, fase, link, credor, devedor |
| `divida` | 05.02 | valor, dataAtualizacao, memoriaCalculo, impugnacao |
| `matricula` + `onus[]` | 05.03 | número, cartório, proprietário, titularidade, `{tipo, descricao, gravidade}` |
| `editalAnalise` | 05.04 | publicação, antecedência, avaliação, lance mínimo, débitos, desocupação, `divergencias[]` |
| `avaliacao` | 05.04 | valor, data, avaliador, vistoria, atualidade, impugnação |
| `verificacoes[]` | 05.05 | `{item, estado, fonte, nota}` — proveniência |
| `documentos[]` | 05.06 | `{tipo, nome, origem, url, data, status, baseou}` — **"o que a IA leu e o que extraiu de cada um"** |

**Estados anti-alucinação já definidos** (`legalDemo.js:11-14`, `PropertyDetail.jsx:1128-1133`):
- `verificado` → ✓ verde
- `nao-localizado` → — âmbar
- `requer-humano` / `requer-autos` → ⚑ vermelho

**Status de documento** (`PropertyDetail.jsx:1147-1152`): `baixado` · `parcial` · `nao-disponivel` · `upload-pendente`

**Glossário lateral:** `legalGlossary.js` — 26 verbetes (9 artigos do CPC, 3 leis, 12 conceitos, ONR e DataJud), em linguagem de investidor. Drawer com busca (`PropertyDetail.jsx:1164-1234`).

**Feature flag:** `LEGAL_PREMIUM_UNLOCKED = true` (`PropertyDetail.jsx:10`) — a aba está destravada para desenvolvimento. Existe o `LegalLocked()` (blur premium) em `PropertyDetail.jsx:1521+`.

### 1.3 O que já é bom e deve ser preservado

1. **Ramificação por modalidade.** Judicial ≠ extrajudicial ≠ venda direta é a distinção mais importante do produto, e o frontend acertou. Em venda direta não existe art. 889 nem preço vil; falar disso é ruído que destrói credibilidade.
2. **Estados de verificação.** O tripé verificado / não-localizado / requer-autos é exatamente o mecanismo anti-alucinação certo.
3. **Bloco `documentos[]` com campo `baseou`.** Isso já é a semente da citação. Falta descer ao nível de página e trecho.
4. **Conclusão em 3 linhas** (recomendação + principal risco + providência antes do lance). É o formato que um investidor lê.
5. **Honestidade sobre lacunas.** `'Matrícula 92.385 — status: nao-disponivel — cadeia dominial e averbações não obtidas'`. Isso vende mais confiança do que um parecer completo inventado.

---

## Parte 2 — O que precisa melhorar

Ordenado por impacto sobre a promessa de precisão.

### 2.1 🔴 Nenhuma afirmação tem fonte rastreável — o diferencial não está implementado

Hoje o agente devolve:
```json
"liens": ["Penhora judicial R$ 200.000", "Hipoteca bancaria"]
```

De qual documento? Qual página? Qual trecho? Foi lido ou inferido? **Não há resposta.** É indistinguível de alucinação.

**O que precisa ser a unidade atômica da resposta:**

```json
{
  "id": "onus.penhora.1",
  "afirmacao": "Penhora averbada em favor do exequente",
  "valor": 200000.00,
  "status": "verificado",
  "fonte": {
    "doc_id": "edital_0022_0226",
    "doc_tipo": "edital",
    "arquivo": "edital-0022-0226-cpa-re.pdf",
    "pagina": 4,
    "trecho": "…averbada a penhora sob o Av-7 da matrícula 92.385, em 14/03/2025…",
    "char_range": [18422, 18501]
  },
  "base_legal": [{"norma": "CPC", "artigo": "844"}],
  "sobrevive_arrematacao": false,
  "confianca": 0.94,
  "verificado_em": "2026-07-29"
}
```

**A regra que muda tudo:** *sem trecho literal, não há afirmação.* Se o modelo não consegue apontar o texto que sustenta o campo, o campo vai para `nao_localizado` — **nunca é preenchido por inferência**. Isso transforma o disclaimer genérico ("não substitui parecer de advogado") em uma demonstração concreta de rigor: o cliente vê o que foi lido, onde, e o que não foi.

### 2.2 🔴 Truncagem silenciosa em 8.000 caracteres

`legal.py:86` — `f"Document Text:\n{pdf_texts[:8000]}"`

Ordem de grandeza real:
- Edital Caixa: ~15-40 mil caracteres
- Edital judicial com descrição do imóvel e ônus: ~20-80 mil
- Matrícula com cadeia dominial: 30 mil+

E `pdf_texts` é a **concatenação de todos os PDFs** (`pdf_parser.py:79`). Ou seja: quando há 2+ documentos, do segundo em diante o agente **não lê nada** — e não avisa. Uma matrícula anexada é integralmente descartada em silêncio, e o campo `registration_status` é preenchido de qualquer forma.

Isso não é uma otimização de custo. Sonnet aceita janelas muito maiores. É um limite arbitrário que corrói exatamente a precisão que vocês querem vender.

### 2.3 🔴 Impossível citar página: o parser destrói a paginação

`pdf_parser.py:11-13`:
```python
for page in doc:
    text += page.get_text()
```

As páginas são concatenadas sem marcador. Depois disso, **não existe informação para dizer "página 4"** — mesmo que o LLM queira citar. Toda a §2.1 depende de consertar isto primeiro.

Precisa virar estrutura, não string:
```python
{"doc_id": ..., "arquivo": ..., "sha256": ..., "n_paginas": 12,
 "paginas": [{"n": 1, "texto": "...", "char_offset": 0, "ocr": false}, ...]}
```
Com `sha256` por documento — assim a análise fica versionada e é possível detectar quando o edital foi republicado.

### 2.4 🟠 Uma chamada de LLM para 14 temas heterogêneos

Um único prompt pergunta, de uma vez, sobre matrícula + IPTU + zoneamento + habite-se + ocupação + ações judiciais + usufruto + dívida ativa. Cada um desses tem **fonte diferente e método de verificação diferente**. O resultado é a média de todos: nada é verificado a fundo.

Estrutura mais adequada — extração por documento, depois raciocínio por tema:

```
para cada documento (edital, matrícula, laudo, certidão, ata):
    extrator específico → fatos citados (com página/trecho)

consolidação determinística (Python):
    cruzar fatos, detectar divergências, calcular aritmética

para cada tema decisivo da modalidade:
    analista → conclusão ancorada nos fatos citados
```

Isso também permite algo hoje impossível: **detectar divergência entre documentos**. O `legalDemo` já traz o exemplo certo — *"Área total (45,74 m²) x área privativa (38,40 m²) — conferir qual base foi usada na avaliação"* — mas está escrito à mão. Divergência entre edital e matrícula é um dos sinais mais valiosos que uma IA pode dar, e é puro cruzamento de dados.

### 2.5 🟠 O backend não ramifica por modalidade

O prompt é o mesmo para leilão judicial, extrajudicial e venda direta. Consequências:

**Pergunta o que não importa:** `zoning_compliance` e `construction_permits` para um apartamento em condomínio; art. 889 numa venda direta da Caixa.

**Não pergunta o que decide a compra:**

| Tema decisivo | Modalidade | Norma | Está no backend? |
|---|---|---|---|
| Intimações obrigatórias — por pessoa (executado, cônjuge, coproprietário, credor hipotecário, usufrutuário) | judicial | CPC 889 | ❌ |
| Averbação da penhora + data | judicial | CPC 844 | ❌ |
| Preço vil — cálculo lance/avaliação | judicial | CPC 891 | ❌ |
| Conteúdo e publicação do edital + antecedência | judicial | CPC 886/887 | ❌ |
| Bem de família | judicial | Lei 8.009/90 | ❌ |
| Prazo de invalidação (10 dias) | judicial | CPC 903 | ❌ |
| Coproprietário / fração ideal / preferência | judicial | CPC 843 | ❌ |
| Notificação e purgação da mora | extrajudicial | Lei 9.514, art. 26 | ❌ |
| Consolidação averbada na matrícula | extrajudicial | Lei 9.514, art. 27 | ❌ |
| Imissão na posse — prazo e custo | extra/direta | Lei 9.514, art. 30 | parcial (`occupantRemovalCost`, sem origem) |
| Sub-rogação de tributos no preço | todas | CTN 130 § único + STJ 2024 | ❌ |
| Débito condominial *propter rem* + teto contratual (Caixa: 10%) | todas | — | parcial (valor sem fonte) |

O `legalGlossary.js` **já documenta todos esses artigos** para o usuário final. O agente que deveria aplicá-los não os conhece. É a inversão exata do que deveria ser.

### 2.6 🟠 "Quais ônus sobrevivem à arrematação" — a pergunta que define o preço, e não é feita

Um ônus que se extingue com a carta de arrematação é irrelevante para o preço. Um que acompanha o imóvel é desconto direto no lance. Hoje tudo entra na mesma lista `liens[]`.

Cada ônus precisa de uma classificação binária explícita e justificada:

| Ônus | Sobrevive? | Efeito no lance |
|---|---|---|
| Penhora do próprio processo | não | nenhum |
| Hipoteca / AF de terceiro | depende de intimação (889) | risco de nulidade |
| IPTU | não — sub-roga no preço (CTN 130) | nenhum, mesmo se o edital disser o contrário |
| Condomínio | **sim** — *propter rem* | desconto integral (ou até o teto) |
| Usufruto / direito real de habitação | **sim, se não extinto** | pode inviabilizar |
| Locação com cláusula de vigência averbada | **sim** | atrasa a posse |

Este quadro é a peça que traduz análise jurídica em número. Hoje não existe em lugar nenhum do código.

### 2.7 🟠 Aritmética e prazos sendo decididos por LLM

Coisas que **nunca** devem sair de um modelo de linguagem:

| Cálculo | Regra | Hoje |
|---|---|---|
| Preço vil | `lance / avaliação` vs. mínimo do edital, ou 50% (CPC 891) | string escrita à mão no mock |
| Antecedência do edital | `data_leilão − data_publicação ≥ 5 dias` (CPC 887) | `antecedencia: 'Adequada'` — literal |
| Antecedência das intimações | `≥ 5 dias` (CPC 889) | inexistente |
| Deságio oficial | `(avaliação − lance) / avaliação` | já é determinístico em `contracts.py:168` ✅ |
| Custo total do arrematante | lance + ITBI + comissão + emolumentos + desocupação + débitos que sobrevivem | parcial em `output.py` |

O LLM deve **extrair as entradas com citação** (datas, valores, percentuais). O Python calcula e classifica. Isso é auditável, testável e nunca alucina.

### 2.8 🟡 Fontes: a busca genérica não funcionava, e nada a substituiu

As 5 queries Tavily (`certidao onus matricula 92.385 curitiba`) retornam blog e agregador — não existe fonte pública que responda a isso. `main` removeu, e acertou. Mas **nada entrou no lugar**, então hoje o agente só tem o edital.

Fontes que realmente respondem, com custo e viabilidade honestos:

| Fonte | O que dá | Custo/latência | Viabilidade |
|---|---|---|---|
| **Edital (PDF)** | valores, datas, ônus mencionados, condições, desocupação | grátis, já implementado | ✅ única fonte hoje |
| **DataJud (CNJ)** | capa + **movimentações com código TPU e data** | grátis, API pública | ✅ **prioridade 1** |
| **PROJUDI / e-SAJ / PJe** consulta pública | partes, andamento, algumas peças | grátis, scraping frágil, captcha | 🟡 por tribunal |
| **Matrícula via ONR** | cadeia dominial, **todas** as averbações | pago por imóvel | 🟡 sob demanda / premium |
| **Certidão de IPTU municipal** | débito real com valor | grátis, um portal por cidade | 🟡 top-5 cidades primeiro |
| **Certidão de débitos condominiais** | débito real | **não existe fonte pública** | ❌ sempre humano |
| **Laudo de avaliação (autos)** | data, metodologia, vistoria | quando anexado | 🟡 upload do usuário |

**DataJud é o caminho mais curto para o que você pediu — "mencionando o movimento".** A API do CNJ devolve movimentações com código da Tabela Processual Unificada, nome e data. Isso permite afirmações desta natureza:

> **Leilão designado** — `verificado`
> Movimento 12265 · *Ato ordinatório praticado* · 14/03/2026
> Proc. 4001883-07.2025.8.26.0011 · DataJud/CNJ · consultado em 29/07/2026

Isso é precisão demonstrável, com custo zero e sem alucinação possível. É o item de maior retorno da lista inteira.

E o limite tem que ser dito com a mesma clareza: DataJud traz **metadados, não o inteiro teor**. Se a certidão de intimação do art. 889 está dentro de uma petição, ela não aparece — e o item permanece `requer-autos`. O `legalGlossary.js:45` já explica isso corretamente ao usuário. O produto precisa manter essa honestidade no backend.

### 2.9 🟡 Campos a cortar ou rebaixar

Você disse: não é "quanto mais informação, melhor". Aplicando isso:

| Cortar | Por quê |
|---|---|
| `zoning_compliance` | Nunca vem no edital. Para apartamento em condomínio é irrelevante. O LLM preenche com "N/A" ou inventa. |
| `construction_permits` | Idem. Só importa em terreno/obra irregular — deveria ser condicional ao tipo de imóvel. |
| `tax_debts_itbi` | Erro conceitual: ITBI é imposto que o **comprador** paga na transmissão, não dívida do imóvel. Já está calculado corretamente em `costs`. |
| `raw_findings` | Texto solto que não vai para nenhuma UI. Substituído pelo bloco `documentos[]` com citações. |
| `federal_state_debts` (genérico) | Só é relevante se houver **execução fiscal averbada na matrícula**. Vira um item de `onus[]` com fonte, não um campo de texto. |
| `risk_details` (texto corrido) | Substituído por `riscos[]` estruturado, cada um com nível, norma e fonte. |

Saldo: de 14 campos vagos para ~8 blocos citados. Menos superfície, muito mais densidade.

### 2.10 🟡 Contrato e persistência

1. **`AuctionPropertyResult` não tem campo `legal`** (`contracts.py:137-187`). Precisa de `legal: LegalDetail | None`, e o `output.py` precisa montá-lo. Sem isso, tudo acima é invisível.
2. **`legalDemo` é indexado por `id`** (`PropertyDetail.jsx:40`): `p.legal || legalDemo[p.id]`. Se um imóvel real receber id `a1`, ele exibe silenciosamente a análise jurídica de outro imóvel. Deveria ser `import.meta.env.DEV` ou um flag explícito de demo.
3. **Sem versionamento da análise.** Não há `analisado_em`, `hash dos documentos`, nem revalidação quando o edital é republicado. Para conteúdo jurídico com data de validade, isso é obrigatório.
4. **`RiskFlags.j` — "Jurídico dropped per product decision (Sep 2026)"** (`contracts.py:17-28`) e a dimensão Jurídico removida de `ViabilityDetail` (`contracts.py:61-71`). Está se construindo uma aba jurídica completa enquanto a dimensão jurídica foi retirada da viabilidade. Se o jurídico é o diferencial, ele tem que voltar ao score — agora com justificação citada, que é justamente o que faltava antes.

### 2.11 🔴 Bug confirmado: os testes de `legal` estão quebrados em `main`

`main` removeu `_run_legal_searches` de `legal.py` (commit `fd01485`), mas `backend/tests/test_legal.py` **continua fazendo `patch("graph.legal._run_legal_searches")` em 8 pontos**. `unittest.mock.patch` sobre atributo inexistente levanta `AttributeError` — não é falha de asserção, é erro de coleta.

Confirmado: `main:backend/graph/legal.py` não tem essa função; `main:backend/tests/test_legal.py` tem 8 referências a ela.

Consequência: **hoje não há nenhum teste efetivo do agente jurídico.** E ao rebasear `feat/juridico-agente` sobre `main` os mesmos 8 pontos precisam de correção.

### 2.12 🟡 Os testes que existem não testam nada de jurídico

`test_legal.py` — 8 testes, todos com `_call_legal_llm` mockado. Verificam encanamento de JSON: parse, filtragem de chaves, fallback de erro. Nenhum verifica **correção jurídica**.

Falta:
- **Golden set:** 10-20 editais reais (judicial, Caixa, extrajudicial) com extração esperada anotada à mão. Métrica de precisão por campo.
- **Teste anti-alucinação:** dado um edital que *não* menciona penhora, o agente **não pode** produzir item em `onus[]`. Hoje nada impede.
- **Teste de citação:** todo item com `status: verificado` tem que ter `fonte.trecho` **presente no texto do documento**. Isso é verificável programaticamente — `assert trecho in doc.paginas[n].texto`. É o teste mais valioso do conjunto inteiro.
- **Teste de ramificação:** modalidade `venda-direta` não pode produzir risco de art. 889.
- **Teste de aritmética:** preço vil, antecedências e deságio conferidos contra valores calculados à mão.

### 2.13 🟡 Dívidas menores

- `LEGAL_PREMIUM_UNLOCKED = true` hardcoded (`PropertyDetail.jsx:10`) — precisa virar entitlement do usuário antes de produção.
- `api.py:145` — atividade fake no dashboard: *"Pesquisa jurídica completa entregue — 0 ressalvas"*. Inofensivo em demo, péssimo se vazar para produção: promete exatamente a precisão que ainda não existe.
- Prompt do agente em inglês analisando documento em português com terminologia registral brasileira. Vale medir: `penhora`, `averbação`, `sub-rogação`, `fiduciante`, `imissão` não têm equivalente limpo em inglês, e o prompt em inglês empurra o modelo para vocabulário genérico.
- `branch` está 2 commits atrás de `main` e altera `vite.config.js` (porta 5180, `strictPort`) — provável resíduo de ambiente local; conferir antes do merge.

---

## Parte 3 — Ordem de execução sugerida

Sequenciada por dependência técnica, não por facilidade.

### Fase 0 — Destravar (nada funciona sem isto)

1. Corrigir `test_legal.py` (remover os 8 patches de `_run_legal_searches`) — a suíte está vermelha.
2. `pdf_parser.py`: devolver estrutura por página com `doc_id`, `sha256`, `char_offset`, flag de OCR. **Pré-requisito de toda citação.**
3. Remover a truncagem de 8.000 caracteres; passar documentos inteiros, um por vez.
4. Adicionar `legal: LegalDetail | None` a `AuctionPropertyResult` e montá-lo em `output.py`. Sem isto a aba continua mock.

### Fase 1 — Precisão citada (o diferencial)

5. Redefinir o contrato: toda afirmação vira objeto com `{afirmacao, valor, status, fonte{doc, pagina, trecho, char_range}, base_legal, confianca}`.
6. Regra dura: **sem `trecho`, o status é `nao_localizado`.** Validar em Python que `trecho ∈ documento` — item que falha é rebaixado automaticamente, não confia-se no modelo.
7. Quebrar em extratores por tipo de documento (edital / matrícula / laudo / certidão), cada um com prompt próprio, em português.
8. Calcular em Python: preço vil, antecedências (886/887/889), deságio, custo total com ônus que sobrevivem.

### Fase 2 — Ramificação e o que decide a compra

9. Roteamento por modalidade — três conjuntos de temas (judicial / extrajudicial / venda direta), como o `legalDemo` já modela.
10. Classificador `sobrevive_arrematacao` por ônus, com justificação normativa (§2.6). É a ponte entre jurídico e preço.
11. Cruzamento entre documentos → `divergencias[]` gerado, não escrito à mão.
12. Retirar `zoning_compliance`, `construction_permits`, `tax_debts_itbi`, `raw_findings`.

### Fase 3 — Fontes reais

13. **DataJud (CNJ)** — capa + movimentações com código TPU e data. Maior retorno por esforço: grátis, público, e entrega literalmente "mencionar o movimento".
14. Certidão de IPTU nas 5 cidades de maior volume.
15. Matrícula via ONR sob demanda (custo por imóvel → casa com o premium de R$ 197/397).
16. Registro explícito de fontes **não obtidas**, com motivo. A lacuna declarada é parte do produto.

### Fase 4 — Confiança mensurável

17. Golden set de 10-20 editais reais anotados; precisão por campo.
18. Teste de citação (`trecho ∈ documento`) rodando em CI sobre todos os itens `verificado`.
19. Reintroduzir a dimensão Jurídico no score — agora derivada de itens citados, com o "porquê" clicável.
20. Versionar a análise: `analisado_em`, hash dos documentos, revalidação quando o edital muda.

---

## O princípio que amarra tudo

> O valor não está em cobrir mais campos. Está em **cada campo carregar a prova de onde veio** — e o agente dizer, sem rodeio, o que não conseguiu verificar.

Um relatório com 6 itens verificados com página e trecho citados, 3 marcados como "requer os autos" e 2 como "não localizado" vale mais — e vende melhor — do que 14 campos preenchidos que o cliente não tem como conferir. A honestidade sobre a lacuna *é* a demonstração de precisão.

O frontend já foi construído com essa convicção. Falta o backend honrá-la.
