# Decisões de produto — Arremate

Este registro guarda decisões duráveis para que conversas futuras não reabram
escolhas já resolvidas sem perceber. Ele complementa o contexto em
`docs/PRODUCT_CONTEXT.md`; não substitui o changelog técnico de `AGENTS.md`.

Última atualização: 7 de setembro de 2026.

## Como manter este registro

- Registre uma decisão quando ela alterar uma regra, um princípio ou uma direção
  durável do produto — não para cada correção de interface.
- Use um identificador estável, data, estado, decisão, motivo e consequências.
- Uma conversa no Claude pode sugerir uma decisão, mas ela só entra como
  **Ativa** depois da aceitação do responsável pelo produto.
- Não apague uma decisão antiga. Marque-a como **Substituída** e indique qual
  nova decisão assumiu seu lugar.
- Mudanças apenas técnicas continuam somente no changelog de `AGENTS.md`.

## Decisões ativas de produto

### PD-001 — Separar fatos oficiais de estimativas

- **Data:** 9 de agosto de 2026
- **Estado:** Ativa
- **Decisão:** valores e condições oficiais nunca são apresentados como se
  fossem estimativas do Arremate, e estimativas nunca são rotuladas como fatos
  oficiais.
- **Motivo:** o usuário precisa saber o que veio da Caixa, o que veio de uma
  referência de mercado e o que ainda precisa ser confirmado.
- **Consequências:** valor de avaliação, preço mínimo, preços de praças e mercado
  estimado aparecem separadamente. Dados ausentes não recebem preenchimento
  inventado.

### PD-002 — Manter a experiência sem conta enquanto não houver autenticação

- **Data:** 12 de agosto de 2026
- **Estado:** Ativa
- **Decisão:** o produto atual é uma experiência de visitante, sem identidade ou
  personalização fictícia.
- **Motivo:** simular uma conta passa uma confiança que a infraestrutura atual
  ainda não oferece.
- **Consequências:** Watchlist e Histórico ficam no navegador; não há avatar,
  saudação pessoal, logout ou promessa de sincronização.

### PD-003 — Usar o Feed como entrada principal

- **Data:** 4 de setembro de 2026
- **Estado:** Ativa
- **Decisão:** o Feed de oportunidades é a entrada do produto e o Dashboard não
  existe como tela separada.
- **Motivo:** a principal tarefa é encontrar e comparar oportunidades reais; uma
  tela intermediária não acrescentava informação confiável suficiente.
- **Consequências:** navegação, estados iniciais e novas funcionalidades de
  descoberta devem priorizar o Feed.

### PD-004 — Representar cada modalidade com sua própria semântica

- **Data:** 29 de agosto de 2026
- **Estado:** Ativa
- **Decisão:** Leilão SFI, Licitação Aberta e Venda Direta Online não compartilham
  campos ou textos que não se aplicam à modalidade real.
- **Motivo:** tratar toda oportunidade como leilão gera datas, comissões e
  documentos incorretos.
- **Consequências:** Venda Direta não possui praças, lote, leiloeiro ou comissão;
  Licitação Aberta usa sua data e seu preço próprios; Leilão SFI pode mostrar
  duas praças quando publicadas.

### PD-005 — Comunicar somente o nível de confiança da estimativa de mercado

- **Data:** 5 de setembro de 2026
- **Estado:** Ativa
- **Decisão:** a classificação numérica usada para auditar a estimativa permanece
  interna; o produto mostra somente confiança baixa, média ou alta.
- **Motivo:** o número técnico parecia uma precisão maior do que a evidência
  suporta e desviava a atenção da decisão do usuário.
- **Consequências:** quantidade, semelhança e consistência dos comparáveis seguem
  sendo calculadas internamente. Evidência incompleta impede confiança alta, e
  terrenos não recebem extrapolação automática por área.

### PD-006 — Explicar viabilidade como uma equação ajustável

- **Data:** 4 de setembro de 2026
- **Estado:** Ativa
- **Decisão:** a viabilidade financeira parte da relação “lance recomendado +
  custos externos = custo total”, com premissas ajustáveis e origem dos custos
  explicitada.
- **Motivo:** uma recomendação isolada não ajuda o usuário a entender quanto
  capital será necessário nem quais hipóteses mudam o resultado.
- **Consequências:** custos automáticos são identificados, despesas personalizadas
  podem ser adicionadas, reforma e preço de saída são ajustáveis, e comissão só
  entra quando aplicável à modalidade.
- **Emendada em 7 de setembro de 2026 por PD-008:** o princípio permanece, mas a
  equação passa a ser "quanto você pretende oferecer + custos = total até a
  chave". Preço de saída, prazo de revenda e meta de retorno saem, porque não
  existem para quem vai morar. Condomínio e IPTU deixam a equação e formam o
  bloco de custo mensal de morar.

### PD-007 — Não oferecer parecer jurídico antes do produto estar pronto

- **Data:** 12 de agosto de 2026
- **Estado:** Ativa
- **Decisão:** a área Jurídico permanece como “Em breve”, sem badges de risco ou
  assistente jurídico operacional.
- **Motivo:** uma classificação incompleta pode ser interpretada como diligência
  legal e induzir uma decisão financeira relevante.
- **Consequências:** documentos e fatos oficiais podem ser exibidos, mas não como
  parecer jurídico. A ativação futura exigirá escopo, fontes e responsabilidade
  claramente definidos.

### PD-008 — Atender quem compra para morar

- **Data:** 7 de setembro de 2026
- **Estado:** Ativa
- **Decisão:** o usuário principal passa a ser a pessoa que vai morar no imóvel.
  A superfície de investidor sai da interface; o cálculo permanece desligado no
  backend, para eventual reativação.
- **Motivo:** o produto foi construído em torno de meta de retorno, prazo de
  revenda e preço de saída. Quem vai morar não tem nenhuma dessas coisas, e o
  vocabulário sinalizava "isto não é para você".
- **Consequências:** todo elemento de tela precisa responder a uma destas cinco
  perguntas — quanto vou pagar no total, tem alguém morando, que dívidas vêm
  junto, dá para financiar, o que faço agora. "Seu limite" é derivado de um fato
  (o valor a partir do qual o custo total passa a avaliação oficial), nunca de
  uma meta de retorno. Condomínio e IPTU passam a ser a conta mensal de morar, e
  reforma responde "dá para eu me mudar já?".

### PD-009 — Ausência de evidência nunca vira afirmação

- **Data:** 7 de setembro de 2026
- **Estado:** Ativa
- **Decisão:** um dado que não temos é declarado como desconhecido; nunca é
  convertido em uma afirmação sobre o mundo.
- **Motivo:** as linhas de IPTU e condomínio saíam com valor zero e os textos
  "IPTU em dia." e "Sem débito condominial." para todo imóvel, porque o nó
  jurídico está desligado. Era uma afirmação categórica sem nenhuma evidência, e
  justamente sobre a informação que mais pesa na decisão.
- **Consequências:** linha de custo sem valor apurado não é emitida. Dívida
  citada no documento sem valor aparece como menção, não como número. Veredito
  de risco não calculado não é publicado. Rótulo de coluna sem dado embaixo é
  defeito, não decoração.

### PD-010 — Leilão e compra direta são separados na descoberta

- **Data:** 7 de setembro de 2026
- **Estado:** Ativa
- **Decisão:** o feed separa Leilões e Compra direta em abas próprias, e cada
  modalidade tem seu próprio guia de próximos passos.
- **Motivo:** são produtos com lógicas opostas — um tem disputa e data, o outro
  é primeiro a chegar. Misturá-los confunde exatamente quem é leigo, e reaproveitar
  os passos do leilão na compra direta inventaria um processo que não existe.
- **Consequências:** a ordenação padrão passa a ser relevância (proximidade da
  data mais completude dos dados); desconto continua disponível como opção, mas
  deixa de ser o padrão, porque premiava terreno sistematicamente.

### PD-011 — Cada imóvel tem um endereço próprio

- **Data:** 7 de setembro de 2026
- **Estado:** Ativa
- **Decisão:** o produto deixa de ser uma tela só. Cada imóvel passa a ter uma
  URL — `/imovel/{id}` — que abre direto, sobrevive ao recarregar, responde ao
  botão voltar e pode ser copiada e enviada.
- **Motivo:** sem endereço não dá para mandar um imóvel para alguém, guardar nos
  favoritos do navegador, nem comparar dois lado a lado. O botão voltar saía do
  produto em vez de retornar à lista.
- **Consequências:** `/imovel/{id}` é um contrato público. O id é estável — a
  ingestão é upsert e nada é apagado — e links antigos devem continuar
  funcionando, inclusive para imóveis que saíram do catálogo, que passam a dizer
  isso em vez de sumir ou de aparecer como se ainda estivessem à venda. No
  computador o clique num imóvel abre nova guia; no celular, a mesma.

## Decisões ativas de operação do produto

### OD-001 — Validar em preview antes de abrir o PR

- **Data:** 5 de setembro de 2026
- **Estado:** Ativa
- **Decisão:** toda mudança feita por um agente passa por um preview validado pela
  pessoa que pediu antes da abertura do PR para `main`.
- **Motivo:** pessoas não técnicas precisam aprovar o comportamento real, e não
  uma descrição de código.
- **Consequências:** agentes trabalham em branches isoladas, entregam um roteiro
  curto de validação, aguardam confirmação e nunca fazem o merge. Gustavo é o
  responsável final pela publicação.

### OD-002 — Usar dados reais de produção nos previews públicos

- **Data:** 5 de setembro de 2026
- **Estado:** Ativa
- **Decisão:** previews usam o catálogo de produção e podem ser acessados sem uma
  conta da Vercel.
- **Motivo:** a validação precisa refletir imóveis e estados reais e precisa ser
  acessível às pessoas do projeto.
- **Consequências:** todo preview é tratado como interface pública. Escritas são
  habilitadas somente de forma explícita, têm efeito em produção e devem ser
  limitadas e não destrutivas. Ingestão, migração e reparos amplos não são
  executados pelo preview sem solicitação explícita.

## Modelo para uma nova decisão

```markdown
### PD-XXX — Título curto

- **Data:** DD de mês de AAAA
- **Estado:** Proposta | Ativa | Substituída por PD-YYY
- **Decisão:** o que foi decidido.
- **Motivo:** por que esta escolha foi feita.
- **Consequências:** o que passa a ser verdadeiro no produto e quais limites se
  aplicam.
```

