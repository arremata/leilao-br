# Decisões de produto — Arremate

Este registro guarda decisões duráveis para que conversas futuras não reabram
escolhas já resolvidas sem perceber. Ele complementa o contexto em
`docs/PRODUCT_CONTEXT.md`; não substitui o changelog técnico de `AGENTS.md`.

Última atualização: 5 de setembro de 2026.

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

