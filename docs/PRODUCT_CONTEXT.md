# Contexto de produto — Arremate

Este é o contexto curto e não técnico para conversas sobre produto. Ele descreve
o que o Arremate é, o que já existe e quais limites devem ser respeitados. Para
decisões já tomadas, consulte também `docs/PRODUCT_DECISIONS.md`.

Última atualização: 5 de setembro de 2026.

## Como usar no Claude

No projeto “Arremate — Produto” do Claude:

1. Adicione este arquivo e `docs/PRODUCT_DECISIONS.md` pelo conector do GitHub.
2. Selecione a branch `main`.
3. Use **Sync now** antes de uma conversa importante ou após uma publicação.
4. Adicione arquivos de código somente quando a pergunta realmente exigir esse
   nível de detalhe.

O Claude deve distinguir claramente:

- **Hoje:** comportamento já disponível em produção.
- **Decidido:** direção aceita, mesmo que ainda esteja sendo implementada.
- **Proposta:** ideia em discussão, ainda sujeita a decisão.

## Visão

O Arremate quer tornar o investimento em imóveis de leilão mais acessível e
seguro. A plataforma reúne oportunidades, organiza documentos oficiais e cruza
preço, mercado e custos para reduzir uma pesquisa que hoje exige muitas horas e
conhecimento especializado.

A ambição é cobrir os leilões imobiliários de todo o Brasil. O produto atual é
um MVP em evolução, concentrado no catálogo imobiliário da Caixa.

## Para quem estamos construindo

O usuário principal é uma pessoa que considera comprar um imóvel como
investimento, mas precisa responder rapidamente a perguntas como:

- O preço pedido parece realmente atrativo?
- A estimativa de mercado tem evidência suficiente?
- Quais custos ficam fora do preço de compra?
- Quais datas, documentos e condições são oficiais?
- O que ainda precisa ser confirmado antes de tomar uma decisão?

O produto deve funcionar para alguém que não domina linguagem jurídica,
financeira ou de leilões. Termos técnicos precisam ser explicados no próprio
contexto e nunca usados para esconder incerteza.

## Produto disponível hoje

### Feed de oportunidades

- É a entrada principal do produto; não existe mais um Dashboard separado.
- Exibe imóveis reais do catálogo de produção, com fotos quando disponíveis.
- Permite filtrar e ordenar usando opções derivadas dos dados atuais, incluindo
  localização, modalidade, tipo de imóvel e datas quando aplicáveis.
- Diferencia descontos oficiais de descontos baseados na estimativa de mercado.
- Imóveis encerrados não aparecem como oportunidades que “encerram em breve”, e
  imóveis sem data conhecida ficam depois dos que possuem data futura.

### Detalhe do imóvel

O detalhe possui quatro áreas:

1. **Mercado:** estimativa de valor, comparáveis e nível de confiança baixo,
   médio ou alto.
2. **Viabilidade financeira:** lance recomendado, custos externos, custo total,
   margem até o preço mínimo e premissas ajustáveis pelo usuário.
3. **Edital ou Documentos:** dados oficiais do imóvel e da modalidade, edital,
   matrícula, datas, preços, pagamento e responsabilidades quando publicados.
4. **Jurídico:** permanece visível como “Em breve”; o produto atual não entrega
   parecer jurídico nem classificação automática de risco legal.

O acesso ao anúncio oficial deve permanecer destacado como “Acessar leilão” ou
ação equivalente à modalidade.

### Preferências locais

- Watchlist e Histórico existem sem login.
- Esses dados ficam somente no navegador da pessoa.
- Não existe conta de usuário, sincronização entre dispositivos ou identidade
  fictícia na interface.

## Dados e confiança

- Dados oficiais da Caixa e estimativas do Arremate são conceitos diferentes e
  devem ser rotulados separadamente.
- Valor de avaliação, preço mínimo, preços de 1º/2º leilão e estimativa de
  mercado não podem ser apresentados como se fossem o mesmo valor.
- Informações ausentes devem aparecer como indisponíveis; nunca devem ser
  inventadas para preencher uma tela.
- O catálogo é atualizado por rotinas programadas e persistido em PostgreSQL.
- Estimativas de mercado usam referências regionais e comparáveis previamente
  coletados. Uma visita à página não executa pesquisa aberta na web nem chama um
  LLM para inventar uma avaliação.
- Quando há localização suficiente, a seleção busca até cinco comparáveis em um
  raio de 2 km. Quantidade, semelhança e consistência alimentam uma classificação
  interna, mas o usuário vê apenas confiança baixa, média ou alta.
- Evidência incompleta pode sustentar uma estimativa, porém impede confiança
  alta. Terrenos, lotes e glebas não recebem estimativa automática por
  extrapolação de preço por metro quadrado.
- Uma estimativa ajuda na triagem; ela não substitui avaliação profissional,
  diligência jurídica ou confirmação dos documentos oficiais.

## Modalidades atuais

### Leilão SFI

É uma modalidade extrajudicial que pode ter 1º e 2º leilão, com datas e preços
distintos. Praça e comissão de leiloeiro só aparecem quando aplicáveis e
documentadas.

### Licitação Aberta

Possui uma data e um preço mínimo próprios. Não deve herdar automaticamente a
semântica de duas praças de um Leilão SFI.

### Venda Direta Online

Venda direta não é leilão. Não possui praça, lote, leiloeiro ou comissão de
leiloeiro. A interface deve falar em preço, proposta, documentos e regras da
venda, sem inventar um edital individual inexistente.

## Princípios de produto

1. **Evidência antes de completude:** é melhor mostrar que algo não está
   disponível do que apresentar uma resposta sem fonte.
2. **Oficial e estimado sempre separados:** o usuário deve entender a origem e o
   grau de certeza de cada número.
3. **Decisão explicável:** custos, premissas e limitações precisam ser visíveis e
   ajustáveis quando fizer sentido.
4. **Linguagem direta:** a interface ajuda a pessoa a decidir; não tenta parecer
   mais inteligente por usar jargão.
5. **Sem personalização fictícia:** enquanto não houver autenticação, não há
   perfil, atividade ou recomendação atribuída a uma pessoa imaginária.
6. **Segurança proporcional ao impacto:** qualquer ação que grave em produção é
   tratada como uma ação real, inclusive quando executada em preview.

## Ainda não disponível

- Autenticação, contas e sincronização entre dispositivos.
- Mapa nacional e agregação de todos os leiloeiros do Brasil.
- Alertas configuráveis e exportação CSV.
- Parecer ou assistente jurídico operacional.
- Lances, pagamentos ou contratação dentro do Arremate.
- Planos pagos, créditos e cobrança dentro do produto.

Itens futuros não devem ser descritos como se já estivessem disponíveis. Quando
aparecerem na interface, precisam estar claramente marcados como “Em breve”.

## Fluxo de publicação

Uma pessoa pode pedir uma mudança em linguagem comum. O agente traduz o pedido,
implementa e testa em uma branch isolada, entrega um preview público e aguarda a
validação. O PR só é aberto depois da confirmação da pessoa e nunca é mesclado
pelo agente. Gustavo é o responsável pela aprovação e publicação em produção.

Os previews usam o catálogo real de produção. Eles são públicos e, quando a
escrita está habilitada, uma ação persistente no preview também altera produção.
Por isso, novas ações de escrita exigem revisão explícita e comportamento
limitado e não destrutivo.

## Onde aprofundar

- `docs/PRODUCT_DECISIONS.md`: decisões de produto e operação já aceitas.
- `docs/SHIP_WITH_AGENT.md`: fluxo humano para pedir, validar e publicar mudanças.
- `AGENTS.md`: arquitetura, regras técnicas e changelog completo.
- `frontend/src/components/`: comportamento atual das telas.
- `backend/graph/contracts.py`: contrato detalhado dos dados de uma análise.

