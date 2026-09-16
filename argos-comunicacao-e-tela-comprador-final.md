# ARGOS — Comunicação e Arquitetura de Tela para o Comprador Final

**Data:** 5 de setembro de 2026
**Para:** Guilherme · Gustavo · Luigi
**Base:** Insights de Conversas Sessão 01 · pesquisa de público-alvo · análise competitiva
**O que este documento é:** as regras de linguagem e a estrutura de tela para o público que não conhece leilão. Feito para ser executado, não discutido.

---

## 0. A premissa

O site hoje fala com quem já sabe o que está fazendo. O público que decidimos atender **não sabe, não quer aprender o vocabulário do mercado, e não vai perguntar.** Ele vai fechar a aba.

Ele tem quatro perguntas, sempre nesta ordem:

1. **Quanto vou pagar no total, até a chave estar na minha mão?**
2. **Tem alguém morando? Quando eu consigo entrar?**
3. **Que dívidas vêm junto com o imóvel?**
4. **Eu consigo pagar isso? Dá para financiar? Posso usar o FGTS?**

E depois: **o que eu faço agora?**

Tudo neste documento serve a essas cinco perguntas. Qualquer elemento de tela que não responda a uma delas é candidato a sair do modo "Morar".

---

## PARTE 1 — PLANO DE COMUNICAÇÃO

## 1.1 As seis regras duras

Valem para o site inteiro, blog, anúncio e e-mail. Sem exceção.

**1. Uma ideia por frase. Frase curta.**
Não: "O imóvel encontra-se ocupado pelo executado, sendo necessária a propositura de ação de imissão na posse após a expedição da carta de arrematação."
Sim: "O antigo dono ainda mora no imóvel. Para entrar, você vai precisar de uma ordem judicial. Isso leva tempo."

**2. Reais, não porcentagem.**
Porcentagem é abstrata e soa a corretor. "Você economiza R$ 110 mil" funciona. "Deságio de 38%" não diz nada para quem nunca comprou.

**3. Sempre em segunda pessoa.**
"Você vai pagar", "você vai precisar", "o que falta para você". Nunca "o arrematante deverá".

**4. Nomear o custo é o que derruba a desconfiança — não negá-lo.**
O medo nº 2 dos insights ("bom demais, tem letra miúda") não se resolve dizendo que é seguro. Se resolve mostrando cada custo, um por um, com nome e valor. Quem lista o que custa parece honesto. Quem só fala do desconto parece golpe.

**5. Dizer o que não sabemos, sempre que não soubermos.**
Esse é o produto, não um defeito. Padrões prontos no item 1.5.

**6. Nunca recomendar. Sempre mostrar.**
"Acima de R$ 180 mil você paga mais do que a avaliação" é fato. "Recomendamos comprar" é conselho — e é o que o concorrente faz. Além de errado para o leigo, conselho é terreno onde o Guilherme não pode pisar.

---

## 1.2 Dicionário de tradução

Coluna do meio é o que vai na tela. Coluna da direita é a explicação que aparece ao tocar no termo, quando ele for inevitável.

| Termo do mercado | Como escrever na tela | Explicação ao tocar |
|---|---|---|
| Arrematar | **Comprar** / ganhar o imóvel | — |
| Arrematante | **Você** / o comprador | — |
| Edital | **As regras deste leilão** | Documento oficial com todas as condições. É o que vale. |
| 1ª e 2ª praça | **Primeira e segunda rodada** | Se ninguém compra na primeira, abre uma segunda com valor menor. |
| Hasta pública | *não usar* | — |
| Lance mínimo | **Valor inicial** | Menor valor aceito nesta rodada. |
| Avaliação | **Valor de avaliação** | Quanto um avaliador oficial disse que o imóvel vale. |
| Deságio | **Quanto abaixo da avaliação** (em R$) | — |
| Caução | **Depósito para participar** | Valor que fica bloqueado enquanto você disputa. Volta se você não ganhar. |
| Habilitação | **Cadastro para dar lance** | — |
| Comissão do leiloeiro | **Comissão do leiloeiro (5%)** | Pago por você, além do lance. Não está incluído no preço. |
| Auto / carta de arrematação | **O documento que prova que o imóvel é seu** | — |
| Imissão na posse | **A ordem judicial para você entrar** | Pedido ao juiz para desocupar o imóvel. |
| Desocupação | **Tirar quem está morando** | — |
| Ocupado pelo executado | **O antigo dono ainda mora lá** | — |
| Matrícula | **A certidão do imóvel no cartório** | Histórico oficial: dono, dívidas, processos. |
| Ônus | **Pendências registradas na certidão** | — |
| Sub-rogação | **A dívida sai do valor pago, não do seu bolso** | Em certos casos, a dívida é quitada com o dinheiro do leilão. |
| Alienação fiduciária | **O banco retomou o imóvel** | — |
| Leilão judicial | **Leilão da Justiça** | O imóvel foi levado a leilão dentro de um processo. |
| Leilão extrajudicial | **Leilão do banco** | O banco retomou e está vendendo direto. |
| Venda direta | **Compra direta — sem disputa** | Não tem leilão. O primeiro que fecha, leva. |
| Consolidação da propriedade | *não usar* | — |
| ITBI | **ITBI — o imposto da prefeitura para transferir o imóvel** | — |
| Laudêmio / foro | **Taxa extra deste imóvel** | — |

---

## 1.3 O que sai da tela no modo "Morar"

Some completamente. Não vai para "avançado", não vai para rodapé. **Some.**

| Sai | Por quê |
|---|---|
| ROI, TIR, rentabilidade, cap rate | Ele não vai revender. É ruído e sinaliza "isto não é pra mim" — o medo nº 1 |
| Score numérico (0–100) | Número sem unidade não significa nada para leigo, e é opinião disfarçada de dado |
| "Recomendação: COMPRAR" | Conselho. Não fazemos |
| Deságio em % | Vira economia em R$ |
| Lance sugerido | Vira "seu limite" (item 2.3) |
| Prazo de revenda, cenário tributário dos 180 dias | Assunto de investidor |
| Comparação de carteira, pipeline | Assunto de investidor |

**Fica, mas reescrito:** custo total, ocupação, dívidas, formas de pagamento, datas, o semáforo.

---

## 1.4 Palavras proibidas

**Por serem marca de infoproduto queimado** — e o setor está contaminado: "oportunidade imperdível", "até 70% de desconto", "renda passiva", "multiplique seu patrimônio", "invista", "lucro garantido", "fórmula", "segredo".

**Por serem conselho:** "recomendamos", "vale a pena", "você deve", "melhor negócio".

**Por serem risco de OAB para o Guilherme:** "análise jurídica", "assessoria jurídica", "parecer", "nossa equipe jurídica", "consultoria jurídica". O que fazemos é **leitura de documento e organização de informação**. É assim que se escreve.

---

## 1.5 Como escrever a incerteza

O Dr. Francisco travou exatamente aqui: viu a divergência entre avaliação e mercado estimado e perguntou por quê. O nível de confiabilidade dizia *quanto* confiar, não *por quê*. Isso é o diferencial pela metade.

Padrões prontos, para usar literalmente:

| Situação | Frase na tela |
|---|---|
| Poucos comparáveis | **"Encontramos 2 imóveis parecidos na região. É pouco para uma estimativa firme."** |
| Comparáveis suficientes | **"Baseado em 14 imóveis parecidos vendidos na região nos últimos 12 meses."** |
| Divergência avaliação × mercado | **"A avaliação oficial é de R$ 290 mil. Pelos imóveis parecidos, estimamos R$ 240 mil. A avaliação foi feita em [data] e pode estar desatualizada."** |
| Ocupação não informada | **"As regras deste leilão não dizem se há alguém morando. Essa é a informação que mais muda o prazo — vale confirmar antes de dar lance."** |
| Dívida sem valor | **"O documento cita dívida de condomínio, mas não informa o valor. Dá para pedir a prévia ao síndico."** |
| Estimativa própria | **"Estimativa nossa, não é valor oficial."** |

**Regra:** toda estimativa mostra **em quantos dados ela se apoia**. Todo campo vazio tem texto próprio — nunca "—", nunca "N/A", nunca em branco.

---

## 1.6 Os quatro medos e onde cada um é respondido

| Medo | Onde a tela responde |
|---|---|
| **1. "Isso não é pra mim"** | Linguagem sem jargão · guia passo a passo visível antes do cadastro · nenhum número de investidor na tela |
| **2. "Bom demais, tem letra miúda"** | Bloco de custo total com cada item nomeado · os três 5% explicados · seção do que não sabemos |
| **3. "Leilão de carro é ruim"** | Conteúdo: imóvel não tem sinistro, tem certidão · a certidão mostra o histórico inteiro |
| **4. "E se eu não conseguir entrar?"** | **Selo de ocupação no card** · bloco de prazo com faixa honesta · guia do pós-arremate |

---

## 1.7 A comparação que convence

Não comparar com preço de mercado. Comparar com **o que a pessoa já ia fazer**. Vira um bloco na página do imóvel e um artigo:

| | Continuar alugando | Financiar pela imobiliária | Comprar neste leilão |
|---|---|---|---|
| Entrada | R$ 0 | R$ 60.000 | R$ 9.000 (5%) |
| Pagamento mensal | R$ 1.800 | R$ 2.400 | R$ 1.550 |
| Custo até a chave | — | R$ 78.000 | R$ 34.000 |
| Prazo até morar | imediato | 45 a 90 dias | 60 a 180 dias |
| Em 5 anos você terá | R$ 108.000 pagos, nada seu | o imóvel | o imóvel |

Números ilustrativos — o bloco é calculado por imóvel. É a peça que faz o desconto parar de parecer suspeito.

---

## PARTE 2 — ARQUITETURA DE TELA

## 2.1 Princípio de camadas

Menos informação por tela não é menos informação. É informação **em camadas, com uma resposta fechada em cada nível**.

```
Camada 1 — CARD          7 elementos. Responde "isso serve pra mim?"
Camada 2 — PÁGINA        5 blocos. Cada um responde 1 das 4 perguntas.
Camada 3 — DETALHE       Abre dentro do bloco. Fonte, trecho, cálculo.
Camada 4 — GUIA          O que fazer, com datas.
```

Regra dura: **cada bloco da camada 2 abre com a resposta em uma frase.** O detalhe fica atrás de um toque. Quem quiser só a resposta, rola e sai satisfeito.

---

## 2.2 O card do feed — modo Morar

**Sete elementos. Nada além disso.**

1. **Foto**
2. **Tipo + bairro, cidade** — "Apartamento 2 quartos · Portão, Curitiba"
3. **Custo total estimado até a chave — o número em destaque**
   `R$ 214.000` — e abaixo, menor: *"lance inicial R$ 180.000 + custos"*
   O número grande **não é o lance**. É o que ele vai pagar. Isso sozinho já nos separa de todo mundo.
4. **Economia em reais** — "R$ 76.000 abaixo da avaliação"
5. **Selo de ocupação** — três estados, sempre visível:
   🟢 **Desocupado** · 🟡 **Ocupado** · ⚪ **Não informado**
6. **Selo de pagamento** — "Aceita financiamento" · "Aceita FGTS" · "Só à vista"
7. **Selo de tipo + prazo** — "Leilão · faltam 9 dias" ou "Compra direta · sem disputa"

**Fora do card:** score, ROI, % de desconto, valor de avaliação isolado, nome do leiloeiro, número do processo.

### Sobre venda direta × leilão

O Dr. Francisco percebeu sozinho que são coisas diferentes. **Separar.** São produtos com lógicas opostas: um tem disputa e data, o outro é primeiro a chegar. Misturar confunde exatamente quem é leigo.

Recomendação: **abas no topo do feed**, não filtro escondido. "Leilões" · "Compra direta". Com uma linha explicando a diferença na primeira visita.

### Ordenação padrão

Terreno sempre tem o maior desconto, então ordenar por desconto premia a categoria errada. **Padrão sugerido: relevância = proximidade da data do leilão + completude dos dados + adequação ao filtro do usuário.** Desconto vira opção, não padrão.

---

## 2.3 A página do imóvel — cinco blocos

### Bloco 1 · "Quanto você vai pagar"

Abre com o semáforo, que é a única coisa que o Dr. Francisco entendeu de primeira. Ele carrega a decisão — então tudo o mais na tela é apoio.

**Renomear para o modo Morar:** não é "lance sugerido", é **"Seu limite"**.

```
┌─────────────────────────────────────────┐
│  Seu limite de lance                    │
│                                          │
│  [████████████░░░░░]                     │
│  até R$ 173.000        acima disso →     │
│  verde                 você paga mais    │
│                        que a avaliação   │
└─────────────────────────────────────────┘
```

A frase abaixo do semáforo é factual, nunca conselho: *"Acima de R$ 180.000, o custo total passa o valor de avaliação do imóvel."*

Logo abaixo, **a conta aberta, item por item** — é isto que derruba o medo nº 2:

| | |
|---|---|
| Lance | R$ 180.000 |
| Comissão do leiloeiro (5%) | R$ 9.000 |
| ITBI | R$ 5.400 |
| Registro em cartório | R$ 4.100 |
| IPTU atrasado | R$ 2.300 |
| Condomínio atrasado | *valor não informado* |
| Reforma estimada | R$ 12.000 |
| **Total até a chave** | **R$ 212.800 +** |

O "+" no total, quando há campo desconhecido, é honestidade visual. Não arredondar para um número falso.

### Bloco 2 · "Quem está no imóvel"

O selo grande, e a explicação do que aquilo significa **para ele**:

> 🟡 **Ocupado — o antigo dono ainda mora no imóvel.**
> Para entrar, você vai precisar de uma ordem judicial. Não dá para trocar a fechadura.
> Prazo: varia conforme o tipo de leilão e a resistência do morador. Não existe estatística oficial — quem promete prazo exato está chutando.

Quando não se sabe, o estado **"Não informado"** com a frase do item 1.5. Nunca esconder a variável mais importante atrás de um documento.

### Bloco 3 · "Que dívidas vêm junto"

IPTU, condomínio, e **quem paga cada uma** — que depende do regime, e é onde o leigo mais se perde:

> **IPTU atrasado: R$ 2.300.**
> Neste tipo de leilão, dívidas de imposto costumam ser quitadas com o próprio dinheiro do leilão. Você não paga. *(fonte: trecho do documento, página 7)*

> **Condomínio: o documento cita dívida, sem valor.**
> Em leilão do banco, quem paga a dívida antiga é assunto ainda discutido nos tribunais. Vale pedir a prévia ao síndico antes de dar lance.

Cada afirmação com a fonte e o trecho. **Aqui é onde o produto ganha ou perde.**

### Bloco 4 · "Como você paga"

> **Este imóvel aceita financiamento e FGTS.**
> Entrada de 5%: R$ 9.000 — sai do seu bolso, o FGTS não cobre o sinal.
> Restante: financiado ou pago com FGTS + financiamento.
> Parcela estimada: R$ 1.550/mês em 360 meses.
> ⚠️ Você precisa do crédito **aprovado antes** de dar o lance.

E os **três 5%** separados, porque o leigo funde os três:

| Qual 5% | Sobre o quê | Quando |
|---|---|---|
| Depósito para participar | valor de avaliação | antes de dar lance |
| Comissão do leiloeiro | valor da sua proposta | na arrematação |
| Entrada mínima | valor mínimo de venda | até 2 dias úteis após aprovação |

Nota que os insights corrigiram e precisa entrar aqui: **os 5% são regra, não promoção. A promoção é a dispensa deles.**

E o divisor de regime, em uma linha: **leilão do banco** → o banco que vende é quem financia, operação simplificada. **Leilão da Justiça** → regra geral é à vista no prazo; financiamento, quando cabe, vem depois.

Requisitos objetivos de FGTS, em lista curta: avaliação até R$ 2,25 milhões · não ter usado FGTS em compra nos últimos 3 anos · imóvel residencial urbano para morar. **O critério é o valor de avaliação, não o do lance** — imóvel avaliado acima do teto não passa mesmo com desconto.

### Bloco 5 · "O que você faz agora"

O guia. Camada 4. Detalhado no item 2.4.

---

## 2.4 O guia de arremate

É o que transforma o site de consulta em companhia. Checklist com estado, ancorado na data real do leilão.

```
Faltam 9 dias para o leilão

✓  1. Ler as regras deste leilão          concluído
✓  2. Conferir os custos                  concluído
○  3. Conseguir crédito aprovado          → comece agora, leva 5 a 15 dias
○  4. Fazer o cadastro no leiloeiro       até 2 dias antes
○  5. Depositar o valor para participar   até 1 dia antes
○  6. Dar o lance                         14/09, 14h
```

E o **pós-arremate**, que hoje ninguém do mercado serve e é onde a dor é maior:

```
Depois que você ganhar
○  Pagar o valor + comissão                prazo do edital
○  Receber o documento de propriedade
○  Pagar o ITBI na prefeitura
○  Registrar o imóvel no cartório
○  Entrar no imóvel                        depende da ocupação
```

Cada passo abre com: o que é, quanto custa, quanto tempo leva, e o que dá errado se atrasar. Sem conselho — instrução de processo.

---

## 2.5 Affordance — o travamento do Dr. Francisco

Citação direta: *"não tem nada que me leve a vir com o mouse aqui, parece estático"*.

**Regra de teste:** quem nunca viu não pode precisar descobrir. Se precisar de explicação em voz, está errado.

Mínimo para qualquer controle ajustável:
- Alça visível em repouso, não só no hover
- Rótulo com o valor atual sempre à vista
- Microcopy acima: *"arraste para simular"*
- Movimento sutil na primeira visita
- Estado de toque em mobile — a maior parte do público chega por celular

---

## 2.6 Filtros no formato de imobiliária

O Dr. Francisco descreveu a própria busca: região, condomínio, 3 quartos, 2 banheiros. É assim que esse público busca, e é assim que ele pesquisa no Google. **Produto e SEO na mesma decisão.**

Filtros em ordem de uso: **Cidade / bairro → Tipo → Quartos → Banheiros → Vaga → Custo total até (não lance) → Aceita financiamento → Aceita FGTS → Desocupado**

Os três últimos são exclusivos nossos e ninguém tem. E cada combinação vira URL indexável:
`/imoveis/curitiba/portao/apartamento-2-quartos-aceita-fgts`

---

## 2.7 As duas portas

Antes do login, escolha explícita. **"Quero morar" à esquerda e primeiro.** Todo o mercado faz o contrário.

A escolha guarda um estado que muda a interface inteira, não só o texto: modo Morar esconde os sete elementos do item 1.3. Trocável a qualquer momento, em local visível.

---

## PARTE 3 — EXECUÇÃO

## 3.1 O que muda, por dono

**Luigi — front e mídia**
- [ ] Card de 7 elementos, com custo total no lugar do lance
- [ ] Selo visual de ocupação, três estados
- [ ] Corrigir affordance dos controles — testar com quem nunca viu
- [ ] Hierarquia visual com o semáforo como elemento primário
- [ ] Abas Leilões / Compra direta no feed
- [ ] Tela das duas portas
- [ ] Aplicar o dicionário de tradução em toda a interface
- [ ] Mapa estilo Airbnb — pós-lançamento

**Gustavo — backend e dados**
- [ ] Campo de ocupação com valor explícito para "não informado"
- [ ] Venda direta e leilão como tipos distintos no modelo
- [ ] Expor o **motivo** da divergência avaliação × mercado, com contagem de comparáveis
- [ ] Custo total como campo calculado, exposto no feed
- [ ] Flags de aceita financiamento / aceita FGTS
- [ ] Filtros e URLs no formato imobiliária
- [ ] Nova ordenação padrão
- [ ] Fonte e trecho por afirmação, expostos na API

**Guilherme — jurídico e editorial**
- [ ] Revisar todo o texto da interface contra o dicionário e as palavras proibidas
- [ ] Escrever os textos dos cinco blocos
- [ ] Artigo dos três 5%
- [ ] Reescrever a seção de FGTS com o divisor de regime e o critério de avaliação
- [ ] Definir a faixa de prazo até a posse a partir de prazos normativos
- [ ] Redigir os padrões de incerteza definitivos

## 3.2 O teste que decide se funcionou

Pegar **uma pessoa que está procurando o primeiro imóvel e nunca ouviu falar de leilão**. Mostrar um imóvel. Não explicar nada.

Passou se ela responder sozinha, em voz alta:
1. Quanto vou pagar no total
2. Se tem alguém morando
3. Que dívidas vêm junto
4. Se dá para financiar
5. Qual é o próximo passo

Se travar em qualquer uma, a tela é que está errada — não a pessoa.

**Lembrete dos insights, que vale repetir:** elogio ao demo não é validação. O travamento é o dado. Nenhuma das duas conversas foi com o público-alvo final.

## 3.3 As decisões que ainda são dos três

1. **Tese do flanqueamento** — capturar quem busca aluguel, primeira casa, FGTS e entrada, em vez de disputar "leilão". Muda arquitetura de URL, plano de conteúdo e filtros. É a decisão mais estruturante.
2. **Selo de ocupação entra no escopo de lançamento?** Recomendação: sim. É o medo nº 4 e a variável que mais move o risco.
3. **Separar venda direta no feed** — recomendação: sim, por abas.
4. **Ordenação padrão** — recomendação: relevância, não desconto.
5. **Prestador credenciado** — pós-lançamento. E, como os insights já apontam, a frente de advogado credenciado esbarra em captação de clientela e na vedação de sociedade com não-advogado. Precisa de desenho separado das outras frentes, ou fica de fora.
