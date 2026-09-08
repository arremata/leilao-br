# Contexto de produto — Argos

Este é o contexto curto e não técnico para conversas sobre produto. Ele descreve
o que o Argos é, o que já existe e quais limites devem ser respeitados. Para
decisões já tomadas, consulte também `docs/PRODUCT_DECISIONS.md`.

Última atualização: 7 de setembro de 2026.

## Como usar no Claude

No projeto “Argos — Produto” do Claude:

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

O Argos quer tornar a compra de um imóvel de leilão possível para quem vai morar
nele. A plataforma reúne imóveis, organiza os documentos oficiais e monta a conta
completa — o que hoje exige muitas horas e um vocabulário que a pessoa não tem.

A ambição é cobrir os leilões imobiliários de todo o Brasil. O produto atual é
um MVP em evolução, concentrado no catálogo imobiliário da Caixa.

## Para quem estamos construindo

O usuário principal é uma pessoa comprando um imóvel **para morar**. Ela não
conhece o vocabulário de leilão, não quer aprendê-lo e não vai perguntar: vai
fechar a aba. Ela tem quatro perguntas, nesta ordem:

1. Quanto vou pagar no total, até a chave estar na minha mão?
2. Tem alguém morando? Quando eu consigo entrar?
3. Que dívidas vêm junto com o imóvel?
4. Eu consigo pagar isso? Dá para financiar? Posso usar o FGTS?

E depois: o que eu faço agora?

**Essas cinco perguntas são o critério de corte.** Um elemento de tela que não
responde a nenhuma delas é candidato a sair.

O produto não atende mais o investidor na interface. O cálculo de revenda
permanece desligado no backend, para eventual reativação.

## Produto disponível hoje

### Endereços

Cada imóvel tem uma URL própria — `/imovel/{id}` — que abre direto, sobrevive ao
recarregar e pode ser copiada e enviada. A lista guarda a busca no endereço, então
voltar de um imóvel devolve os mesmos filtros. No computador, clicar num imóvel
abre nova guia, para comparar sem perder a busca; no celular, a mesma guia.

Um imóvel que saiu do catálogo da Caixa continua acessível pelo link antigo e diz
que saiu, em vez de sumir ou de aparecer como se ainda estivesse à venda.

A pré-visualização do link em aplicativos de mensagem ainda é genérica: mostra a
marca do site, não o imóvel. Isso depende de entregar as tags de compartilhamento
no HTML do servidor, o que ainda não é feito.

### Lista de imóveis

- É a entrada principal do produto; não existe um Dashboard separado.
- Separa **Leilões** e **Compra direta** em abas, porque são produtos com lógicas
  opostas: um tem disputa e data, o outro é primeiro a chegar.
- Exibe imóveis reais do catálogo de produção, com fotos quando disponíveis.
- A ordenação padrão é relevância: data mais próxima primeiro, depois quanto do
  imóvel realmente conhecemos. Desconto continua disponível, mas não é o padrão.
- Diferenças de preço aparecem em reais, não em porcentagem.

### Página do imóvel

Cinco áreas:

1. **Quanto você vai pagar:** o valor que a pessoa pretende oferecer, "Seu
   limite", a conta aberta item por item, o total até a chave, e o custo mensal
   de morar (condomínio e IPTU) em bloco separado.
2. **O que fazer agora:** os passos antes da compra e depois dela, com estado
   salvo no navegador e ancorados nas datas reais quando existirem.
3. **Preço na região:** comparação com a avaliação oficial e com imóveis
   parecidos, os anúncios usados, e quanta evidência sustenta a estimativa.
4. **Regras deste leilão / Documentos:** dados oficiais, documentos, datas,
   preços, pagamento e responsabilidades quando publicados.
5. **Pendências do imóvel:** permanece como “Em breve”. O produto não entrega
   parecer jurídico nem classificação automática de risco legal.

**"Seu limite" é um fato, não um conselho:** é o valor de oferta a partir do qual
o custo total ultrapassa o valor de avaliação oficial. Não depende de preço de
saída nem de meta de retorno.

O acesso ao anúncio oficial permanece destacado como “Ver o leilão na Caixa” ou
ação equivalente à modalidade.

### Preferências locais

- Salvos e Vistos existem sem login.
- Esses dados ficam somente no navegador da pessoa.
- Não existe conta de usuário, sincronização entre dispositivos ou identidade
  fictícia na interface.

## Dados e confiança

- Dados oficiais da Caixa e estimativas do Argos são conceitos diferentes e
  devem ser rotulados separadamente.
- **Ausência de evidência nunca vira afirmação.** Uma linha de custo sem valor
  apurado não é emitida; uma dívida citada no documento sem valor aparece como
  menção, não como número; um veredito de risco não calculado não é publicado.
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
4. **Linguagem direta:** uma ideia por frase, sempre em segunda pessoa, valores
   em reais e não em porcentagem. Nunca recomendar, sempre mostrar: "acima de
   R$ X o custo total passa a avaliação" é fato; "vale a pena" é conselho.
   A interface não usa "análise jurídica", "parecer", "assessoria jurídica" nem
   "consultoria jurídica" — o que o produto faz é leitura de documento e
   organização de informação.
5. **Sem personalização fictícia:** enquanto não houver autenticação, não há
   perfil, atividade ou recomendação atribuída a uma pessoa imaginária.
6. **Segurança proporcional ao impacto:** qualquer ação que grave em produção é
   tratada como uma ação real, inclusive quando executada em preview.

## Ainda não disponível

- Autenticação, contas e sincronização entre dispositivos.
- Mapa nacional e agregação de todos os leiloeiros do Brasil.
- Alertas configuráveis e exportação CSV.
- Parecer ou assistente jurídico operacional.
- Lances, pagamentos ou contratação dentro do Argos.
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
- `docs/superpowers/specs/2026-09-07-foco-comprador-morar-design.md`: o desenho
  do repositionamento e as dependências das próximas entregas.
- `frontend/src/content/nextStepsContent.js`: texto do guia, sob revisão
  editorial.
- `docs/SHIP_WITH_AGENT.md`: fluxo humano para pedir, validar e publicar mudanças.
- `AGENTS.md`: arquitetura, regras técnicas e changelog completo.
- `frontend/src/components/`: comportamento atual das telas.
- `backend/graph/contracts.py`: contrato detalhado dos dados de uma análise.

