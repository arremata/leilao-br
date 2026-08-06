# Agente Jurídico ARGOS — arquitetura em duas trilhas

**Base normativa verificada em fonte oficial (Planalto, STF, STJ, CNJ) · 29/07/2026**
**Base empírica: 2 casos reais de arrematação anulada (STJ), fornecidos pelo escritório**

---

## 0. O que agora está verificado (e o que não está)

Tudo abaixo foi extraído de texto oficial, literal. O que não confirmei está no fim, marcado.

| Fonte | Item | Status |
|---|---|---|
| Planalto | CPC arts. 799, 804, 841, 842, 843, 844, 873, 879-903, 674, 675 | ✅ literal |
| Planalto | Lei 9.514/97 arts. 22-30, 37-A/B/C — **com as alterações da Lei 14.711/2023** | ✅ literal |
| Planalto | LEF (6.830/80) arts. 12 e 13 · Lei 8.009/90 arts. 1-3 · CTN 130 · CC 1.647 · LRP 167 e 247 | ✅ literal |
| STF | **Tema 982** (RE 860.631) — constitucionalidade do procedimento extrajudicial | ✅ tese literal, trânsito 22/02/2024 |
| STJ | **Tema 1134** — cláusula de edital que passa tributo ao arrematante é **inválida** | ✅ julgado 30/10/2024 |
| STJ | **Tema 1288** (19/02/2026) — efeitos da quitação pós-Lei 13.465/2017 | ✅ teses |
| CNJ | Resolução 236/2016 — leilão judicial eletrônico | ✅ dispositivos-chave |
| STJ | Súmula ou repetitivo sobre **intimação do cônjuge** | ❌ **não existe** — ver §5 |
| STJ | Repetitivo sobre **débito condominial na arrematação** | ❌ **não existe** — só REsp 1.769.443 (3ª Turma) |

---

## 1. A assimetria que define o produto

Não são duas variações do mesmo produto. São dois riscos de natureza oposta, e é isso que precisa ser vendido de forma diferente.

### Extrajudicial — o risco foi legalmente estreitado a UM ponto

Três movimentos fecharam o cerco:

**1. O STF encerrou o risco sistêmico.** Tema 982, tese literal:

> "É constitucional o procedimento da Lei nº 9.514/1997 para a execução extrajudicial da cláusula de alienação fiduciária em garantia, haja vista sua compatibilidade com as garantias processuais previstas na Constituição Federal"

Plenário, 26/10/2023, sem modulação, trânsito em julgado 22/02/2024. A tese de "leilão extrajudicial é inconstitucional" está morta.

**2. A Lei 14.711/2023 converteu quase todo vício em dinheiro.** Art. 30, parágrafo único — o dispositivo mais importante de todo este documento:

> "Arrematado o imóvel ou consolidada definitivamente a propriedade no caso de frustração dos leilões, as ações judiciais que tenham por objeto controvérsias sobre as estipulações contratuais ou os requisitos procedimentais de cobrança e leilão, **excetuada a exigência de notificação do devedor** e, se for o caso, do terceiro fiduciante, **não obstarão a reintegração de posse** de que trata este artigo e **serão resolvidas em perdas e danos**."

Leia o que isso significa para o arrematante: erro no edital, erro no cálculo da dívida, vício no procedimento do leilão — **nada disso tira o imóvel dele nem trava a posse.** Vira indenização entre devedor e credor. A única exceção, escrita na lei, é a **notificação do devedor**.

**3. E o arrematante ganhou legitimidade própria para tomar a posse.** Art. 30, caput:

> "É assegurada ao fiduciário, ao seu cessionário ou aos seus sucessores, **inclusive ao adquirente do imóvel por força do leilão público** de que tratam os arts. 26-A, 27 e 27-A, a reintegração na posse do imóvel, **que será concedida liminarmente**, para desocupação no prazo de 60 (sessenta) dias [...]"

**Consequência para o produto:** no extrajudicial, "análise de risco judicial" é conversa fiada — e o cliente sente isso. O que existe de verdade é **uma pergunta binária de altíssimo valor** (a notificação foi válida?) + **aritmética de prazos** + **economia da desocupação**. Menos itens, muito mais densidade. É exatamente o formato que você descreveu.

### Judicial — o risco é perda total, retroativa, e a boa-fé não protege

Os dois casos que você me deu provam isso empiricamente, e provam a mesma coisa:

| | REsp 1.617.956/MG | REsp 1.909.273/MS |
|---|---|---|
| Execução | Fiscal (IPTU, R$ ~5 mil) | Bancária (Bradesco) |
| Imóvel | Apto. 303, Santo Agostinho, BH — avaliado R$ 200k | Fazenda Carolina, 1.079 ha, Camapuã/MS |
| Vício | Cônjuge do executado não intimado da penhora | Cônjuge da executada não intimado da penhora |
| Norma | LEF art. 12, § 2º | CPC/73 art. 655, § 2º (hoje **art. 842**) |
| Decisão | Nulidade de **todos os atos posteriores à penhora** | Idem + **cancelamento do registro** R.18/8.054 |
| Arrematante | Nunca obteve a posse; levou multa por protelação | Já tinha registrado a carta; perdeu em 5 instâncias |
| Horizonte | ~13 anos | Carta em 26/02/2016 → Corte Especial em 08/04/2025 = **9 anos** |
| Boa-fé discutida? | **Não** | **Não** |
| Ressarcimento? | Não consta | Não consta |

Duas execuções de naturezas diferentes, estados diferentes, décadas diferentes — **o mesmo vício, uma única checagem binária.** E em MS o sinal era literal e documental: o termo de penhora *"somente as devedoras assinaram"*, e a executada já constava como casada na inicial da execução desde 2006.

Detalhe que muda a estratégia: **o art. 842 do CPC tem ressalva de separação absoluta; o art. 12, § 2º, da LEF não tem.** Em execução fiscal, portanto, o padrão é mais rígido. E em MS os arrematantes sustentaram que o bem era herança anterior ao casamento — tese razoável, com precedentes — e **perderam em todas as instâncias**, porque a orientação aplicada foi "imprescindível independentemente do regime de bens".

---

## 2. O que o agente é: 6 camadas

### Camada 0 — Classificação da modalidade (primeiro ato, sempre)

Nada roda antes disso. A modalidade determina quais perguntas existem — e perguntar art. 889 numa venda direta da Caixa destrói credibilidade tanto quanto errar o mérito.

Sinais de classificação, por ordem de confiabilidade:

| Sinal | Onde | Conclui |
|---|---|---|
| Registro de alienação fiduciária na matrícula (LRP art. 167, I, **item 35**) + averbação de consolidação (Lei 9.514, art. 26, § 7º) | matrícula | **extrajudicial** |
| Registro de penhora/arresto (LRP art. 167, I, **item 5**) + número de processo | matrícula + edital | **judicial** |
| Proprietário registral já é o banco, sem leilão pendente | matrícula | **venda direta** (não é leilão) |
| Menção a "praça", juízo, exequente/executado | edital | judicial |
| Menção a "agente fiduciário", "consolidação", art. 27 | edital | extrajudicial |

Saída da camada 0: `{modalidade, confianca, fonte_da_classificacao}`. Se a confiança for baixa, **o agente para e diz que não classificou** — não escolhe a trilha por chute.

### Camada 1 — Aquisição de documentos

| Documento | Judicial | Extrajudicial | Fonte |
|---|---|---|---|
| Edital | obrigatório | obrigatório | site do leiloeiro |
| **Matrícula atualizada** | obrigatório | obrigatório | ONR (pago, por imóvel) |
| Capa + movimentações do processo | obrigatório | n/a | DataJud (CNJ, grátis) |
| **Termo/auto de penhora** | **decisivo** | n/a | autos |
| **Certidão de intimação do cônjuge** | **decisivo** | n/a | autos |
| **Carta precatória (se houver)** | **decisivo** | n/a | autos da comarca do imóvel |
| Laudo de avaliação | importante | n/a | autos |
| **Dossiê do procedimento no RI** (requerimento, AR, certidões de diligência, certidão de decurso de prazo) | n/a | **decisivo** | Registro de Imóveis |
| Certidão de ações reais e reipersecutórias | importante | importante | RI |
| Certidão de distribuição por nome/CPF do executado **e do cônjuge** | importante | importante | tribunal |
| Vistoria/constatação de ocupação | importante | importante | diligência local |

### Camada 2 — Extração citada

Toda afirmação vira objeto com prova. Sem trecho literal localizável no documento, o status é `nao_localizado` — nunca preenchido por inferência:

```json
{
  "afirmacao": "Penhora averbada em favor do exequente",
  "status": "verificado",
  "fonte": { "doc": "matricula_92385", "pagina": 3,
             "trecho": "Av-7 — penhora nos autos 4001883-07...",
             "char_range": [18422, 18501] },
  "base_legal": [{ "norma": "LRP 6.015/73", "artigo": "167, I, 5" }],
  "sobrevive_arrematacao": false
}
```

Validação em Python: `assert trecho in documento.paginas[n].texto`. Item que falha é rebaixado automaticamente. Isso é testável em CI.

### Camada 3 — Cálculo determinístico (nunca LLM)

O modelo extrai as **entradas** com citação. O Python calcula e classifica.

**Judicial:**
- Preço vil: `lance vs. mínimo do edital`; sem mínimo, `lance / avaliação < 50%` (art. 891, § único)
- Antecedência do edital: `data_leilão − data_publicação ≥ 5 dias` (art. 887, § 1º)
- Antecedência das intimações: `≥ 5 dias` (art. 889, caput)
- Quota do coproprietário preservada sobre a **avaliação** (art. 843, § 2º)
- Imóvel de incapaz: piso de **80%** da avaliação (art. 896)
- Parcelamento: `≥ 25%` à vista + até 30 meses (art. 895, § 1º)
- Custo de entrada real: lance + **comissão do leiloeiro (mín. 5%, Res. CNJ 236, art. 7º)** + ITBI + despesas — sem isso não sai carta nem mandado de imissão (art. 901, § 1º)

**Extrajudicial:**
- Leilão dentro de **60 dias** do registro do art. 26, § 7º (art. 27, caput)
- 2º leilão nos **15 dias** seguintes ao 1º (art. 27, § 1º)
- Regime residencial: consolidação averbada **30 dias** após expirar o prazo de purgação (art. 26-A, § 1º)
- Piso do 2º leilão: `lance ≥ dívida + despesas + encargos` (art. 27, § 2º). A válvula de "metade da avaliação" existe **só por opção exclusiva do credor** e **não se aplica** ao regime residencial (art. 26-A, § 3º) → arremate residencial por metade da avaliação é sinal vermelho
- Janela de preferência do fiduciante aberta até a data do 2º leilão (art. 27, § 2º-B) → risco de perder o negócio, não de nulidade
- Locação: denúncia com 30 dias para desocupar, a ser feita em até 90 dias da consolidação (art. 27, § 7º)

### Camada 4 — Verificação por trilha (§3 e §4 abaixo)

### Camada 5 — Conclusão + precificação do risco

Três linhas, como o mock já acertou — mas agora derivadas de itens citados:

1. **Recomendação:** participar / cautela / não recomendado
2. **Principal risco:** o item de maior gravidade, com norma e fonte
3. **Providência antes do lance:** a diligência concreta que fecha a lacuna

E o número: quais ônus **sobrevivem** à arrematação. É isso que traduz jurídico em preço.

| Ônus | Sobrevive? | Base |
|---|---|---|
| Penhora do próprio processo | não | extinta pela arrematação |
| **IPTU e taxas do imóvel** | **não — sub-roga no preço** | CTN 130, § único + **STJ Tema 1134**: cláusula de edital que passa ao arrematante é **inválida** |
| Hipoteca / AF de terceiro | **sobrevive se o titular não foi intimado** | CPC art. 804 → alienação **ineficaz** contra ele |
| Usufruto / uso / habitação | **sobrevive se o titular não foi intimado** | CPC art. 804, § 6º; art. 889, III |
| Promessa de compra e venda registrada | **sobrevive se o promitente não foi intimado** | CPC art. 804, § 1º; art. 889, VI |
| **Débito condominial** | **depende — e aqui não há repetitivo** | só REsp 1.769.443 (3ª T., CPC/73): arrematante responde por débito anterior **apenas se o edital informou a pendência**. Tratar como risco em aberto, não como regra pacificada |
| Locação com cláusula de vigência averbada | sobrevive | atrasa a posse |

### Camada 6 — Entrega ao cliente

O que demonstra precisão não é o volume. É poder apontar: **documento, página, trecho** — e, no judicial, **movimento processual com código e data**.

Formato-alvo de um item:

> **Intimação do cônjuge do executado** — ⚑ requer autos
> Executado qualificado como **casado** na petição inicial da execução (p. 2 do edital: "casado"). Regime de bens não informado.
> Não localizada certidão de intimação pessoal do cônjuge nos autos disponíveis.
> Base: CPC art. 842 · Precedente do risco: STJ, REsp 1.909.273/MS — arrematação desconstituída e registro cancelado 9 anos após a carta.
> **Providência:** obter certidão de intimação do cônjuge nos autos da execução **e da carta precatória**, se houver.

---

## 3. Trilha EXTRAJUDICIAL — o que se vende

**Uma pergunta decisiva, três blocos de aritmética, uma conta de desocupação.**

### 3.1 A pergunta decisiva: a notificação foi válida?

É a única matéria que, por lei, trava a posse do arrematante (art. 30, § único). Sub-checagens, com base literal:

- Intimação **pessoal** do fiduciante (e do terceiro fiduciante, se houver) — art. 26, §§ 1º e 3º
- Uso de **edital** (art. 26, § 4º) só se houver certidão de local ignorado, incerto ou inacessível — publicação por no mínimo **3 dias** em jornal de maior circulação local
- Prazo de purgação respeitado, e purgação eventual computada — art. 26, § 5º; art. 26-A, § 2º
- Averbação da consolidação após o prazo — art. 26, § 7º; art. 26-A, § 1º
- Comunicação das datas/horários/locais dos leilões ao devedor, inclusive endereço eletrônico — art. 27, § 2º-A

**E aqui está o gargalo honesto do produto:** a intimação da mora **não é averbada na matrícula**. Varri o art. 167 da Lei 6.015/73 — não existe item de averbação de intimação para esse fim. A matrícula mostra o **resultado** (consolidação averbada), não o **processo**. O único documento que prova regularidade é o **dossiê do procedimento no Registro de Imóveis**. Sem ele, o item é honestamente `requer diligência` — e dizer isso com clareza vale mais que fingir verificação.

### 3.2 O que NÃO entra (e por que dizer isso ao cliente é diferencial)

- Nulidade processual, intimações do art. 889, preço vil, embargos: **não existem** aqui
- Constrições sobre o direito do fiduciante (penhora, arresto, indisponibilidade): **não obstam** consolidação nem venda — art. 27, §§ 11 e 12; os credores sub-rogam-se no saldo
- Inconstitucionalidade do procedimento: encerrada — STF Tema 982

Única exceção registral que realmente trava: **ordem judicial expressa de bloqueio da matrícula**.

### 3.3 A conta que decide o negócio: desocupação

- Reintegração **liminar**, 60 dias para desocupar, legitimidade do próprio arrematante — art. 30
- **Taxa de ocupação de 1% ao mês** a favor do arrematante — art. 37-A
- Locação: denúncia 30 dias, prazo de 90 dias da consolidação, exige cláusula contratual destacada — art. 27, § 7º; locação > 1 ano sem anuência escrita do fiduciário é ineficaz — art. 37-B
- Débitos propter rem: fiduciante responde até a imissão na posse (art. 27, § 8º) — **mas isso não impede a cobrança recair sobre o imóvel**

---

## 4. Trilha JUDICIAL — o que se vende

**A tese central: mapear cada nulidade pré-processual antes do lance.** Estruturada em 5 blocos.

### 4.1 Cadeia de intimações — onde os dois casos morreram

| Quem | Norma | Quando | Efeito da omissão |
|---|---|---|---|
| **Cônjuge do executado** (penhora de imóvel) | **CPC art. 842** — ressalva só separação absoluta | na penhora | **nulidade dos atos posteriores** (empírico: 2/2 casos) |
| **Cônjuge — execução fiscal** | **LEF art. 12, § 2º** — **sem ressalva de regime** | na penhora | idem, padrão mais rígido |
| Executado | CPC art. 841 (penhora) e art. 889, I (leilão, 5 dias) | ambos | nulidade |
| Credor hipotecário, pignoratício, anticrético, **fiduciário** | CPC art. 799, I + art. 889, V | leilão | **ineficácia** — art. 804 |
| Usufrutuário / uso / habitação | art. 799, II + art. 889, III | leilão | ineficácia — art. 804, § 6º |
| Promitente comprador / vendedor (registrado) | art. 799, III-IV + art. 889, VI-VII | leilão | ineficácia — art. 804, §§ 1º e 3º |
| Coproprietário de fração ideal | art. 889, II + art. 843 | leilão | nulidade + preferência |
| Superficiário, enfiteuta, concessionário | art. 799, V-VI + art. 889, III-IV | leilão | ineficácia — art. 804, §§ 2º, 4º, 5º |
| Titular de laje / construção-base | art. 799, X-XI | penhora | ineficácia |
| União/Estado/Município (bem tombado) | art. 889, VIII | leilão | nulidade |

**Regra de ouro derivada da matrícula:** cada gravame registrado gera um titular a intimar. A matrícula diz **quem** deveria ser intimado; só os autos dizem **se foi**.

**Armadilha comprovada:** em MS havia edital publicado em DJ (fls. 350-351) e em jornal (fls. 356-357), e intimação do patrono via DJ (fl. 352) — e o TJMS decidiu que *"não se pode considerar que a mera publicação dos editais de hasta pública no diário de justiça ou em jornal supre a necessidade de se intimar pessoalmente o cônjuge"*. Um checklist que marque "edital publicado = ok" produz **falso negativo**.

**Ponto cego comprovado:** em MS, penhora, avaliação, praça e arrematação ocorreram numa **carta precatória** (0001492-87.2009.8.12.0006, Camapuã) distinta da execução principal (Campo Grande). Quem lê só a execução principal examina o processo errado.

### 4.2 Edital e publicidade
Art. 886, I-VI (todos os requisitos) · art. 887, § 1º (5 dias) · art. 888 (leilão transferido exige nova publicação) · Res. CNJ 236/2016 arts. 11, 20-22.
**Alavanca do arrematante:** ônus, recurso ou processo pendente não mencionado no edital (art. 886, VI) dá direito de desistência com devolução do depósito em 10 dias — art. 903, § 5º, I.

### 4.3 Avaliação e preço
Art. 873 (nova avaliação: erro/dolo, variação de valor, dúvida fundada) · art. 891 (preço vil) · art. 843, § 2º (quota do coproprietário sobre a avaliação) · art. 896 (incapaz, 80%) · LEF art. 13, § 1º (impugnação da avaliação antes do edital).
**Sinal empírico:** em MG, dívida de ~R$ 5 mil contra imóvel avaliado em R$ 200 mil. A razão dívida/avaliação é um sinal calculável.

### 4.4 Impenhorabilidade e legitimados a atacar
Lei 8.009/90 art. 1º e art. 3º (exceções — inciso IV: impostos, taxas e contribuições **devidas em função do imóvel**; a extensão à cota condominial é jurisprudencial, **não está no texto legal**) · CPC art. 674, § 2º, I (cônjuge/companheiro como terceiro) · art. 675 (embargos de terceiro até **5 dias após a arrematação**, sempre antes da carta).

### 4.5 Janelas de ataque e de saída
Art. 903, § 2º — **10 dias** para alegar vício nos autos · § 4º — depois da carta, ação autônoma com o arrematante como **litisconsorte necessário** · § 5º — as três hipóteses de desistência do arrematante · § 6º — multa de até 20% por suscitação infundada.

---

## 5. Onde o produto tem que ser honesto

Três coisas que a pesquisa desmentiu e que **não podem** aparecer como verdade pacificada:

1. **Não existe súmula nem repetitivo do STJ sobre intimação do cônjuge.** Varri a base oficial: "cônjuge" em repetitivos = 0 registros. Existe Súmula 134, mas ela diz outra coisa (o cônjuge *intimado* ainda pode opor embargos de terceiro) — usá-la como fundamento de nulidade é erro. O que sustenta a tese é jurisprudência reiterada, e os dois casos do escritório são prova concreta disso. Isso é forte — só não é súmula.
2. **Não existe repetitivo sobre débito condominial na arrematação.** Só REsp 1.769.443 (3ª Turma, CPC/73). Tratar como risco em aberto.
3. **A Lei 8.009/90 não menciona "contribuição condominial"** no art. 3º. A extensão é jurisprudencial.

E o gargalo estrutural, que não se resolve com engenharia: **o vício decisivo, nas duas trilhas, mora em documento que não é público.** No judicial, na certidão de intimação dentro dos autos (e da carta precatória). No extrajudicial, no dossiê do procedimento no Registro de Imóveis. DataJud dá o movimento e a data — dá para provar que *o ato existe*; não dá o inteiro teor.

Isso não enfraquece o produto. **Define onde ele cobra.** A triagem automática diz onde olhar e o que já está descartado; a diligência que fecha o item é o serviço premium. E o cliente entende a diferença quando o relatório mostra, com página e trecho, o que foi lido — e nomeia com precisão o que falta.

---

## 6. Decisões que travam o início

1. **Trilha primeiro:** extrajudicial (mais volume via Caixa, escopo estreito, entrega mais rápida) ou judicial (maior valor percebido, mais difícil)?
2. **Fonte dos autos no judicial:** DataJud só (metadados, grátis) · scraping de consulta pública por tribunal (frágil, captcha) · upload do PDF dos autos pelo cliente/advogado · híbrido com diligência humana no premium?
3. **Dossiê do RI no extrajudicial:** pedir certidão do procedimento (pago, por imóvel) · exigir do leiloeiro/credor · declarar `requer diligência` e vender como premium?
4. **Corte automático × humano:** o que o plano gratuito vê, e o que dispara o advogado.

---

### Fontes

- [CPC — Lei 13.105/2015 (Planalto)](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm)
- [Lei 9.514/1997 (Planalto)](https://www.planalto.gov.br/ccivil_03/leis/l9514.htm)
- [Lei 14.711/2023 — Marco Legal das Garantias (Planalto)](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14711.htm)
- [Lei 6.830/1980 — LEF (Planalto)](https://www.planalto.gov.br/ccivil_03/leis/l6830.htm)
- [Lei 8.009/1990 (Planalto)](https://www.planalto.gov.br/ccivil_03/leis/l8009.htm)
- [Lei 6.015/1973 — LRP (Planalto)](https://www.planalto.gov.br/ccivil_03/leis/l6015compilada.htm)
- [CTN — Lei 5.172/1966 (Planalto)](https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm)
- [Código Civil — Lei 10.406/2002 (Planalto)](https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm)
- [STF — Tema 982, RE 860.631](https://portal.stf.jus.br/jurisprudenciaRepercussao/tema.asp?num=982)
- [STF — Tema 249, RE 627.106](https://portal.stf.jus.br/jurisprudenciaRepercussao/verAndamentoProcesso.asp?incidente=3919340&numeroProcesso=627106&classeProcesso=RE&numeroTema=249)
- [STJ — Tema Repetitivo 1134](https://scon.stj.jus.br/SCON/repetitivos/toc.jsp?tema1=1134&tema2=1134&l=10&ordenacao=%40NUM)
- [STJ — notícia oficial do Tema 1134 (30/10/2024)](https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Noticias/2024/30102024-Mesmo-com-previsao-no-edital--arrematante-nao-responde-por-divida-tributaria-anterior-a-alienacao-do-imovel.aspx)
- [STJ — Tema Repetitivo 1288 (19/02/2026)](https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Noticias/2026/19022026-Repetitivo-define-efeitos-da-quitacao-da-divida-em-imovel-com-alienacao-fiduciaria-apos-a-Lei-13-4652017.aspx)
- [STJ — REsp 1.769.443, débito condominial (24/11/2020)](https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Noticias/24112020-Na-vigencia-do-CPC-de-1973--dividas-condominiais-nao-se-sub-rogam-no-valor-da-arrematacao-de-imovel.aspx)
- [STJ — Súmula 134](https://scon.stj.jus.br/SCON/sumstj/toc.jsp?livre=%40NUM%3D%27134%27&b=SUMU&l=10&ordenacao=-%40NUM)
- [CNJ — Resolução 236/2016](https://atos.cnj.jus.br/atos/detalhar/2313)
- Casos do escritório: AgInt no REsp 1.617.956/MG (2ª Turma, 18/12/2023) · REsp 1.909.273/MS (3ª Turma; AgInt no AgInt nos EDiv, Corte Especial, 08/04/2025)
