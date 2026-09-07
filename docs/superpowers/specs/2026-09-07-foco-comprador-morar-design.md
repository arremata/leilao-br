# Foco no comprador que vai morar — desenho da entrega 1

**Data:** 7 de setembro de 2026
**Estado:** aprovado para planejamento
**Base:** `argos-comunicacao-e-tela-comprador-final.md` (5 de setembro de 2026), auditoria
de dados do backend e auditoria de interface do frontend realizadas em 7 de setembro.

## 1. O problema

O produto foi construído para quem compra imóvel de leilão como investimento. A aba
principal se chama "Cenário do investidor" e gira em torno de meta de retorno líquido,
meses até a venda, preço de saída, imposto sobre ganho de capital e reforma para revenda.

O público que passamos a atender vai **morar** no imóvel. Ele não tem preço de saída nem
meta de retorno, e não conhece o vocabulário de leilão. Segundo o documento de
comunicação, ele tem quatro perguntas, nesta ordem:

1. Quanto vou pagar no total, até a chave estar na minha mão?
2. Tem alguém morando? Quando eu consigo entrar?
3. Que dívidas vêm junto com o imóvel?
4. Eu consigo pagar isso? Dá para financiar? Posso usar o FGTS?

E depois: o que eu faço agora?

Essas cinco perguntas são o critério de corte deste desenho.

## 2. Escopo

Esta entrega é **linguagem, remoção e integridade**, mais o guia de próximos passos.
Nada aqui depende de dado que ainda não temos.

O documento de comunicação propõe uma reestruturação em cinco blocos e um card de sete
elementos. A auditoria mostrou que parte dessas propostas depende de dados que não
existem hoje. Essas partes ficam para entregas seguintes, com a dependência nomeada na
seção 8. **Nada que existe hoje e serve ao novo público é removido.**

### Fora do escopo desta entrega

Reescrever a página de detalhe nos cinco blocos do documento; trocar o card para sete
elementos com custo total em destaque; selo de ocupação; selo de financiamento; FGTS;
dívidas com valor; a frase "baseado em N imóveis parecidos"; data da avaliação;
procedência por afirmação com número de página; URLs indexáveis; a tela das duas portas;
o quadro comparativo aluguel × financiamento × leilão.

## 3. Parte A — Parar de afirmar o que não sabemos

Precede o repositionamento e independe dele: o produto hoje faz afirmações falsas.

### A1. As linhas de dívida com valor zero

O nó jurídico está desligado (`backend/enrichment/run.py:23`,
`LEGAL_NODE_ENABLED = False`). A consequência não é um campo vazio: as linhas de custo
`overdue_iptu` e `overdue_condo` saem sempre com valor `0` e com os explicadores
literais "IPTU em dia." e "Sem débito condominial." (`backend/graph/output.py:330` e
`:341`). São afirmações categóricas sobre ausência de dívida, sem nenhuma evidência.

Isso viola a decisão PD-001 já ativa e a regra 5 do documento de comunicação.

**Comportamento novo:** sem evidência, a linha de custo não é emitida. Quando o edital
menciona dívida sem informar valor, a menção aparece — sem valor — na seção que já reúne
as frases verbatim extraídas do edital (`PropertyDetail.jsx:2209`, renomeada em C1), no
padrão de incerteza: "O documento cita dívida de condomínio, mas não informa o valor."

### A2. O risco fixo no código

`vercel-backend/index.py:505` devolve `{"j": "bad", "f": "good"}` para todo imóvel. Não
há risco calculado; o campo sai do payload e nada de risco é exibido.

### A3. A coluna "risco" fantasma

`frontend/src/components/Feed.jsx:317` declara oito colunas, incluindo `risco`, e
`PropertyRow` renderiza sete células. Toda coluna após "mercado estimado" está deslocada
em relação ao próprio cabeçalho. Em `Watchlist.jsx:67-69` o cabeçalho diz
`preço / desconto / roi / risco` enquanto a linha mostra lance, avaliação e mercado.

**Correção:** o cabeçalho passa a descrever exatamente o que a linha renderiza, em ambas
as telas. As regras de celular em `styles.css:1937-1949` referenciam `:nth-child(8)` e
`:nth-child(9)`, que não existem, e são corrigidas junto.

### A4. O filtro que não filtra

`auctionType` devolve a constante `"Extrajudicial"` para todas as quatro modalidades. O
filtro "Tipo de leilão" do feed é removido.

## 4. Parte B — O que sai da tela

Aplicando as cinco perguntas como critério: sai o que não responde a nenhuma delas.

| Elemento | Referência |
|---|---|
| Meta de retorno líquido (deslizador) | `PropertyDetail.jsx:1519` |
| Meses até venda (deslizador) | `PropertyDetail.jsx:1507` |
| Valor de venda no cenário e o alternador Mercado / Avaliação oficial | `PropertyDetail.jsx:1459`, `SaleValueMetric` em `:1741` |
| Imposto sobre ganho de capital e Cenário tributário | `PropertyDetail.jsx:487`, `:1544` |
| Título "Cenário do investidor" | `PropertyDetail.jsx:1344` |
| Marcadores `§ 01.01`, `§ 02.01` e equivalentes | 7 ocorrências |
| Vocabulário de spread: "spread", "deságio", "ágio", "% do mercado", "100% (referência)" | aba Mercado |
| Faixa "R$/m² da região" e "taxa de reforma aplicada" | `PropertyDetail.jsx:1535-1541` |
| Botões desabilitados "Exportar CSV", "Exportar análise", "↓ PDF" | `Feed.jsx:166`, `PropertyDetail.jsx:699`, `:1568` |
| A aba 04 inteira — ver B2 | `PropertyDetail.jsx:841`, `LegalComingSoon` em `:2034-2046` |
| Código morto: `LiveCard.jsx`, CSS do score circular (`styles.css:233-255`) e da barra de risco (`:301-314`) | — |

Estas remoções não constituem a reescrita da página de detalhe nos cinco blocos do
documento, que permanece fora do escopo. A página mantém a estrutura de abas; o que muda
é o que existe dentro delas.

### B1. Dois elementos que permanecem, reenquadrados

**Condomínio e IPTU mensais.** Hoje existem como custo projetado até a venda e morreriam
junto com o deslizador de meses. Para quem vai morar, são a conta que chega todo mês
depois da mudança. Passam a formar um bloco próprio — "Quanto custa por mês morar aqui" —
alimentado pela referência municipal já existente (`backend/enrichment/property_expenses.py`)
e ajustável pela pessoa, como já é hoje.

**Reforma.** O deslizador de intensidade responde "quanto vou gastar para revender". A
pergunta de quem vai morar é "dá para eu me mudar já ou preciso mexer antes?". O valor
segue ajustável; muda o enquadramento e some o vocabulário de R$/m².

### B2. A aba 04 é removida, não renomeada

A aba 04 é hoje um "em breve" sem conteúdo, intitulado "Análise jurídica"
(`PropertyDetail.jsx:2039`). Ela tem dois problemas ao mesmo tempo: não responde a
nenhuma das cinco perguntas, e seu título é palavra proibida por risco de OAB (§1.4).

Renomeá-la criaria um problema novo — a aba 03 já se chama "Edital" ou "Documentos", e
duas abas de documento confundem exatamente quem é leigo. A aba é removida. O conteúdo
jurídico futuro está na seção 8, com sua dependência nomeada.

Isso **substitui a decisão PD-007**, que mantinha a área como "Em breve". O motivo
original de PD-007 (não oferecer parecer antes de o produto estar pronto) permanece
válido e é melhor servido pela ausência da aba do que por uma promessa vazia com um nome
que não podemos usar.

## 5. Parte C — A linguagem

O dicionário de tradução do documento de comunicação (§1.2) é aplicado a toda a
interface. Três regras têm alcance maior que o dicionário:

**Reais, não porcentagem.** Quase todo número comparativo do produto é percentual hoje.
`38% de desconto oficial` passa a `R$ 76.000 abaixo da avaliação`. O percentual pode
permanecer como informação secundária, nunca como o número principal.

**Segunda pessoa.** "Você vai pagar", nunca "o arrematante deverá".

**Nunca recomendar, sempre mostrar.** Frases factuais no lugar de conselho.

### C1. Renomeações com consequência

| De | Para | Motivo |
|---|---|---|
| "Lance máximo recomendado" / "Proposta máxima recomendada" | "Seu limite" | §2.3; a frase de apoio é factual, nunca conselho |
| "Watchlist" | "Salvos" | jargão em inglês |
| "Feed de oportunidades" | "Imóveis" | "feed" é jargão; "oportunidade" faz vizinhança com o vocabulário de infoproduto proibido pelo §1.4 |
| "Alertas do documento oficial" | "O que o documento oficial menciona" | é onde as frases verbatim do edital aparecem (`PropertyDetail.jsx:2209`); "alerta" promete uma triagem de gravidade que não fazemos |

Nenhum texto da interface pode conter "análise jurídica", "parecer", "assessoria
jurídica" ou "consultoria jurídica". O que o produto faz é leitura de documento e
organização de informação, e é assim que se escreve.

### C2. A marca

A marca visível é **Argos**, que já é o que aparece no topo do produto. Os documentos de
produto que hoje dizem "Arremate" são alinhados.

**Identificadores internos não mudam:** as chaves de armazenamento local
`arremate_watched` e `arremate_history` e a variável `ARREMATE_PREVIEW_ALLOW_WRITES`
permanecem. Renomear as chaves apagaria silenciosamente os imóveis salvos e o histórico
de quem já usa o produto.

## 6. Parte D — O feed

**Abas Leilões · Compra direta.** Decisão 3 do §3.3. `modalidade` já é um enum limpo de
quatro valores (`backend/ingestion/normalize.py:94-105`) exposto no endpoint de lista, e
o frontend já deriva filtros dele. São produtos com lógicas opostas — um tem disputa e
data, o outro é primeiro a chegar — e misturá-los confunde exatamente quem é leigo.

**Ordenação padrão passa a ser relevância:** proximidade da data do leilão somada à
completude dos dados do imóvel. Desconto vira opção. Hoje o padrão é desconto, e terreno
tem sistematicamente o maior desconto, então o padrão atual promove a categoria errada.

**O card mantém a estrutura atual, com a linguagem nova.** Ele não passa aos sete
elementos com custo total em destaque nesta entrega: ver seção 8.

## 7. Parte E — O guia de próximos passos

Responde à quinta pergunta ("o que eu faço agora?"). É a peça de maior valor por esforço
entre as adições, porque não depende de dado novo.

**Estrutura.** Lista de passos com estado, ancorada nas datas reais do imóvel, seguida de
uma segunda lista para depois da compra. O estado de cada passo é local ao navegador,
coerente com a decisão PD-002 (não há conta de usuário).

**Fontes de data já disponíveis:** data do leilão (`endsAt`, `first_auction_at`,
`second_auction_at`), `commissionPaymentDeadline`, `cashPaymentDeadline` e `resultDate`
em `edital_data`.

**Três regras de construção:**

1. **Compra direta tem guia próprio.** Não há disputa, habilitação nem depósito para
   participar. Reaproveitar os passos do leilão inventaria processo e contrariaria a
   decisão PD-004.
2. **Prazo ausente é prazo ausente.** Quando o edital não traz o prazo, o passo aparece
   sem data, com o padrão de incerteza. Nada é estimado por analogia.
3. **O texto dos passos é de responsabilidade do Guilherme.** O §3.1 atribui a ele a
   redação, e "o que dá errado se atrasar" é afirmação de processo com consequência
   jurídica. O texto de cada passo vive em um único arquivo de conteúdo isolado, editável
   sem tocar em código. Enquanto não houver texto revisado, o passo mostra apenas o
   rótulo e a data, nunca uma explicação provisória.

## 8. Dependências nomeadas para as próximas entregas

Cada item abaixo veio do documento de comunicação e está bloqueado por um fato verificado.

| Item | Bloqueio | Esforço |
|---|---|---|
| **Selo de ocupação** (3 estados, no card e como filtro) | `Situação` é texto livre capturado em `caixa_detail.py:127-130`; valores vazios são descartados no parse, então "não informado" é indistinguível de ausente; não há coluna própria e o campo só existe no endpoint de detalhe, dentro de `editalData` | Normalizar em enum de 3 estados, criar coluna, expor na lista. **Melhor retorno por esforço da lista.** |
| **Selo "Aceita financiamento"** | A coluna `Financiamento` do CSV é lida mas não está em `CAIXA_HEADER_MAP` (`caixa_csv.py:75-94`), então cai em `raw_payload` — que nenhum handler de API seleciona. O dado já está no banco e é inalcançável | Mapeamento e exposição. Baixo |
| **FGTS** | Não existe em nenhum lugar do repositório. Zero ocorrências | Coleta nova |
| **Custo total no card** e filtro por custo total | O total só é somado no frontend (`PropertyDetail.jsx:614`); várias linhas são percentuais que recalculam contra um lance ajustável; não há total canônico no servidor; e a análise por imóvel não cobre o catálogo inteiro | Definir cenário padrão canônico no servidor e cobrir o catálogo. Alto |
| **"Baseado em N imóveis parecidos"** | `comparable_count` é calculado (`market_confidence.py:266`) e descartado — só o nível é preservado (`market.py:147`). O teto é 5 comparáveis, então a frase nunca dirá 14 como no exemplo do documento | Encanamento. Baixo |
| **"A avaliação foi feita em [data]"** | A data da avaliação não é capturada de nenhuma fonte | Coleta nova |
| **Procedência com número de página** | As páginas do PDF são unidas com `\n` antes de qualquer parse (`caixa_edital.py:38-41`); a fronteira de página é destruída na extração | Refatorar a extração |
| **Dívidas com valor** | Não há valor de dívida estruturado em lugar nenhum | Fonte nova, e decisão sobre risco de OAB |
| **URLs indexáveis** | Não há roteador (dependências do front são só `react` e `react-dom`), a URL nunca é escrita, não há renderização no servidor, e `vercel.json` manda todo caminho para o mesmo `index.html` vazio | Projeto próprio de arquitetura |
| **Filtros Banheiros e Vaga** | `baths`, `parking` e `floor` são campos declarados no contrato e nunca preenchidos por nada. Sempre `null` | Extração nova |

### Itens que precisam de decisão antes de virarem escopo

**As duas portas (§2.7).** O documento pede uma escolha explícita "Quero morar / investir"
com estado que muda a interface inteira — ou seja, dois produtos vivos. A direção
aceita é a oposta: o investidor sai da interface e o cálculo permanece desligado no
backend, para reativação futura.

**O quadro comparativo do §1.7.** É a peça mais persuasiva do documento e a mais
arriscada. "Continuar alugando: R$ 1.800/mês" não tem fonte — não temos aluguel de
mercado do imóvel nem da pessoa. E "em 5 anos você terá o imóvel" na coluna do leilão é
otimista: em imóvel ocupado, em cinco anos pode-se ter um processo. Recomendação: nasce
como artigo editorial, não como bloco calculado por imóvel.

**Contradição interna do documento sobre prazo.** O §1.7 promete "prazo até morar: 60 a
180 dias" e o §2.3 diz que "quem promete prazo exato está chutando". Prevalece o §2.3.

**O semáforo do §2.3.** O documento afirma que o semáforo é "a única coisa que o Dr.
Francisco entendeu de primeira" e constrói o bloco 1 sobre ele. Não existe semáforo no
código. O que existe é uma etiqueta de três estados sobre confiança do dado
(`PropertyDetail.jsx:1207`, "Confiabilidade Baixa / Média / Alta"), dentro da aba Mercado
e abaixo da dobra. A leitura provável do insight é que **o formato de três estados em
linguagem comum funcionou**, não aquele conteúdo específico. O bloco 1 do documento
apoia-se numa premissa não verificada e precisa ser reexaminado antes de virar escopo.

## 9. Verificação

- **Backend:** cobertura de pytest para a remoção das linhas de dívida sem evidência e
  para a saída do campo `risk` do payload.
- **Frontend:** lint, build de produção e validação em navegador nos tamanhos de mesa e
  celular, com o console verificado. A verificação em celular é obrigatória: a maior parte
  do público chega por telefone, e a auditoria encontrou regras de CSS de celular que não
  disparam por falta do elemento correspondente (`.property-card-metrics`, `.mobile-search`).
- **Teste de produto**, do §3.2: mostrar um imóvel a alguém que procura o primeiro imóvel
  e nunca ouviu falar de leilão, sem explicar nada. Passa se a pessoa responder sozinha
  quanto vai pagar no total, se tem alguém morando, que dívidas vêm junto, se dá para
  financiar e qual é o próximo passo. Nesta entrega, "que dívidas vêm junto" e "dá para
  financiar" serão respondidas de forma incompleta e honesta; travar nelas é esperado e
  não invalida a entrega.
- **Elogio ao demo não é validação.** O travamento é o dado.

## 10. Decisões de produto a registrar

Ao final da implementação, registrar em `docs/PRODUCT_DECISIONS.md`:

- **PD-008 — Atender quem compra para morar.** O usuário principal passa a ser quem vai
  morar no imóvel. A superfície de investidor sai da interface e o cálculo permanece
  desligado no backend. Consequência: todo elemento de tela precisa responder a uma das
  cinco perguntas.
- **PD-009 — Ausência de evidência nunca vira afirmação.** Substitui o comportamento em
  que dívida sem dado saía como valor zero com texto afirmativo. Consequência: linha sem
  evidência não é emitida; menção sem valor é exibida como menção.
- **PD-010 — Leilão e compra direta são separados na descoberta.** Consequência: abas
  próprias no feed e guias de próximos passos distintos.
- **PD-007 passa a Substituída por PD-011.** PD-011 — a área jurídica sai da interface em
  vez de permanecer como "Em breve". Motivo: uma aba vazia não responde a nenhuma das
  cinco perguntas, e seu título é vocabulário proibido por risco de OAB. Consequência:
  reativação futura exige escopo, fontes, responsabilidade e um nome que descreva leitura
  de documento, não parecer.

Atualizar `docs/PRODUCT_CONTEXT.md` com a marca Argos, o novo público e as capacidades
resultantes.
