# Chat do Agente Jurídico — arquitetura

Chat de consulta e dúvidas dentro da aba Jurídico, escopado a **um imóvel**.

---

## O princípio

> **O chat não é um advogado. É um leitor do parecer.**

Ele não produz fato novo. Ele faz três coisas e só três:

1. **Explica** um achado que o motor determinístico já calculou
2. **Localiza** um trecho nos documentos analisados, com página
3. **Recalcula** cenários passando pelo mesmo motor determinístico

Qualquer pergunta que exija um fato que não esteja num achado nem num documento tem uma única resposta correta: **"não verifiquei — e é isto que seria preciso para verificar."**

Essa restrição não é limitação técnica. É o que torna o chat vendável por um escritório de advocacia: ele nunca diz mais do que o parecer sustenta, e cada frase é rastreável.

---

## Por que um chat livre seria perigoso aqui

| Risco | O que acontece sem guardrail |
|---|---|
| **Consulta jurídica** | "Devo dar lance?" → recomendação personalizada, com sua OAB atrás |
| **Alucinação em pergunta aberta** | O relatório tem citação obrigatória; prosa livre não tem |
| **Contorno da lacuna** | Cliente insiste, modelo cede e "acha" que a intimação foi regular |
| **Vazamento de escopo** | Pergunta sobre outro imóvel, sobre financiamento, sobre imposto |
| **Prova contra você** | Cliente arremata, perde o imóvel e mostra o print: "o chat disse que estava ok" |

O último é o que mais importa. Todo chat jurídico gera prova documental contra quem o opera. O desenho abaixo assume isso e transforma em controle: tudo logado, tudo ancorado, nada afirmado sem fonte.

---

## Pipeline

```
pergunta do cliente
      │
 [1]  CLASSIFICADOR ─── determinístico primeiro, LLM depois
      │                 (o padrão determinístico é o cinto;
      │                  o LLM é o suspensório — nunca o contrário)
      ▼
 [2]  MONTAGEM DE CONTEXTO ─── só a fonte que a classe autoriza
      │
      ▼
 [3]  GERAÇÃO ─── modelo compõe REFERENCIANDO achados por id
      │
      ▼
 [4]  VALIDADOR ─── todo id citado existe? todo trecho passa no locate()?
      │             o que não passa é removido, não "avisado"
      ▼
 [5]  ENTREGA + LOG de auditoria (pergunta, achados usados, citações)
```

O passo 4 é o mesmo `locate()` de `tools/doc_ingest.py` que já roda no relatório. O chat herda a disciplina anti-alucinação inteira, de graça.

---

## As classes de pergunta

| Classe | Exemplo | Fonte permitida | Comportamento |
|---|---|---|---|
| `EXPLICAR` | "por que está em cautela?" · "o que é purgação da mora?" | Parecer + glossário | Responde citando o achado |
| `LOCALIZAR` | "onde diz que o imóvel está ocupado?" | Documentos via `locate()` | Responde com página + trecho literal |
| `CALCULAR` | "e se eu der lance de R$ 240 mil?" | Motor determinístico | Recalcula e mostra a conta |
| `LACUNA` | "e a intimação do devedor?" | Achado `NAO_VERIFICAVEL` | Declara a lacuna + oferece a diligência |
| `ACONSELHAR` | "devo dar o lance?" · "vale a pena?" | — | **Recusa** e roteia ao escritório |
| `FORA_ESCOPO` | "consigo financiar?" · "quanto pago de IR?" | — | **Recusa** e roteia |
| `OUTRO_IMOVEL` | "e aquele apartamento de Londrina?" | — | **Recusa** — o escopo é um imóvel |

### `CALCULAR` é o recurso mais subestimado

"E se eu der lance de R$ 240 mil?" não é uma pergunta de opinião — é aritmética. O chat repassa ao `extrajudicial_calc.avaliar()` com o lance alterado e devolve:

> Com lance de R$ 240.000, você fica **R$ 20.000 abaixo** do referencial mínimo do 2º leilão (dívida + despesas + encargos = R$ 260.000). Em regime residencial não existe a válvula de "metade da avaliação" do art. 27, § 2º — o art. 26-A, § 4º manda extinguir a dívida se ninguém alcança o piso.

Determinístico, verificável, impossível de alucinar. E é exatamente o tipo de resposta que faz o cliente confiar.

### `LACUNA` é o momento de conversão

A pergunta mais valiosa do chat é aquela que ele **não** consegue responder:

> **Cliente:** A notificação do devedor foi feita direito?
>
> **Chat:** Não verifiquei — e não é possível verificar com os documentos que tenho.
> A intimação da mora **não é averbada na matrícula** (art. 167 da Lei 6.015/73 não prevê esse ato), então nem a certidão de matrícula nem o edital respondem.
> Quem responde é a **certidão do procedimento no Registro de Imóveis**: requerimento do fiduciário, AR ou certidão de diligência, e certidão de decurso do prazo do art. 26, § 7º.
> Isso importa porque, pelo art. 30, parágrafo único, **a notificação é a única matéria capaz de obstar sua reintegração de posse** — todo o resto vira perdas e danos.
>
> *[Solicitar diligência ao escritório]*

Honestidade que vende melhor que qualquer copy. O cliente entende sozinho por que vale pagar.

---

## O que o chat responde sobre a recomendação

Nunca "eu recomendo". Sempre a derivação:

> A recomendação é **cautela** porque 5 dos 12 itens não puderam ser verificados com os documentos disponíveis — nenhum vício foi encontrado. Se os 5 forem fechados e nada aparecer, a classificação passa a "participar" automaticamente.

A recomendação já é derivada em `Parecer.recomendacao`, não opinada. O chat só explica a derivação.

---

## Guardrails, em camadas

**1. Determinístico antes do modelo.** Padrões de busca-de-conselho (`devo`, `vale a pena`, `compensa`, `o que você faria`) são detectados por regex e roteados **antes** de qualquer chamada de LLM. Não se confia ao modelo a decisão de recusar.

**2. Contexto mínimo.** O modelo recebe apenas o que a classe autoriza. Numa pergunta `LOCALIZAR`, ele recebe documentos; numa `EXPLICAR`, recebe achados. Ele não recebe tudo sempre — contexto que não chega não pode ser mal usado.

**3. Referência por id.** O modelo não reescreve o conteúdo do achado; ele referencia `purgacao.prazo` e o renderizador injeta o texto canônico. Elimina a classe inteira de erro "o modelo parafraseou e mudou o sentido".

**4. Validação pós-geração.** Todo trecho entre aspas passa por `locate()`. O que não localiza é **removido**, não sinalizado — resposta com aviso ainda é resposta errada na tela.

**5. Sem memória entre imóveis.** A sessão de chat morre com o imóvel. Impede contaminação de contexto entre análises.

**6. Log de auditoria.** Cada resposta grava: pergunta, classe, achados usados, citações validadas, versão do parecer, `sha256` dos documentos. Se o cliente reclamar depois, existe registro do que foi dito e com base em quê.

---

## Escalonamento para o escritório

Toda recusa e toda lacuna geram um botão de encaminhamento com contexto estruturado — não um "fale conosco" genérico:

```json
{
  "imovel_id": "a1",
  "pergunta": "A notificação do devedor foi feita direito?",
  "classe": "LACUNA",
  "achados_relacionados": ["purgacao.via", "purgacao.prazo"],
  "documentos_faltantes": ["dossiê do procedimento no RI"],
  "cobertura_atual": 0.58,
  "parecer_versao": "sha256:..."
}
```

O advogado abre já sabendo o imóvel, a dúvida, o que falta e por quê. Reduz o custo de atendimento — que é o que decide se o premium fecha a conta.

---

## O que NÃO fazer

- **Caixa de texto em branco como primeira tela.** Convida "devo comprar?". Abrir com perguntas sugeridas, derivadas dos achados reais daquele imóvel.
- **Disclaimer no rodapé.** Ninguém lê. A recusa *é* o disclaimer, dita no momento em que importa.
- **Streaming de resposta não validada.** Se a validação roda depois do texto aparecer, o cliente já leu a alucinação. Validar antes de exibir.
- **Deixar o chat resumir o parecer inteiro.** Resumo perde citação. Se o cliente quer o todo, entrega-se o relatório.
- **Histórico "inteligente" entre sessões.** Aumenta superfície de erro e de vazamento, e não agrega ao caso concreto.

---

## Perguntas sugeridas — derivadas, não fixas

Geradas a partir do `Parecer` daquele imóvel:

- Há achado `NAO_CONFORME` que trava posse → *"Por que este leilão é desaconselhado?"*
- Há lacuna → *"O que falta para completar a análise?"*
- Imóvel ocupado → *"Quanto tempo e quanto custa para desocupar?"*
- Sempre → *"O que este relatório NÃO verificou?"*

A última é permanente e proposital. Um produto que oferece ao cliente a pergunta "o que você não sabe?" comunica confiança que nenhum selo comunica.

---

## Ordem de construção

1. Guardrails e validação (`legal_chat.py`) — a parte que torna o resto seguro
2. Montagem de contexto por classe
3. Geração com referência por id
4. UI: perguntas sugeridas → resposta com chips de fonte clicáveis → botão de escalonamento
5. Log de auditoria persistido

O passo 1 vem primeiro de propósito. Chat sem guardrail funcionando é passivo, não ativo.
