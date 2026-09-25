# Contexto de produto — Argos

Este é o contexto curto e não técnico para conversas sobre produto. Ele descreve
o que o Argos é, o que já existe e quais limites devem ser respeitados. Para
decisões já tomadas, consulte também `docs/PRODUCT_DECISIONS.md`.

Última atualização: 25 de setembro de 2026.

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
fechar a aba. Ela tem cinco perguntas, nesta ordem:

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

### Acesso público

O endereço oficial de produção é `https://www.argosleiloes.com.br`. Acessar
`https://argosleiloes.com.br` leva permanentemente ao endereço com `www`. Ambos
usam HTTPS, e a Vercel renova os certificados automaticamente.

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

- Em produção, Criar conta ou Entrar é obrigatório antes de acessar o catálogo,
  um imóvel por link direto, Salvos, Vistos ou a central de conta. Após entrar,
  a pessoa volta ao endereço que tentou abrir. Uma conta nova conclui sem opção
  de pular o questionário de moradia em três escolhas obrigatórias: cidade, tipo
  de imóvel e faixa de preço. A cidade pode ser digitada e escolhida em
  sugestões, inclusive sem informar os acentos durante a busca. Se o servidor
  recusar algum dado, o questionário mantém as escolhas e informa qual campo
  precisa ser revisto.
- Google é a única forma de criar conta ou entrar. O primeiro acesso cria a
  conta Argos automaticamente e abre o questionário; acessos seguintes retomam
  a plataforma. Cada dispositivo mantém uma sessão própria por até 12 horas em
  cookie protegido; sair encerra somente a sessão usada naquele dispositivo.
- Previews de branch abrem diretamente no catálogo público, sem exigir conta,
  para que a validação use os imóveis reais sem criar identidades de teste. O
  login Google fica desativado nesses domínios temporários.
- Cidade, tipo de imóvel e faixa de preço do questionário formam um perfil
  cadastral, ficam vinculados à conta Google e não filtram o catálogo.
- Todos os filtros da busca ficam numa única barra lateral e são aplicados pela
  própria pessoa. Cidade e bairro usam autocomplete com opções reais do catálogo;
  bairro fica disponível depois da escolha da cidade. O limite de valor inicial
  aceita qualquer valor digitado, o apresenta em reais e, depois da primeira
  alteração, fica lembrado neste navegador até a pessoa limpar o campo ou os
  filtros. Esse valor lembrado pertence à busca e não vem do questionário. Tipo
  de venda, localização, tipo de imóvel, orçamento, disponibilidade, modalidade,
  rodada e desconto não têm uma seção separada de “preferências”, botão de
  aplicar nem ações de salvar ou restaurar perfil. A barra usa a rolagem normal
  da página, sem área interna rolável. Compra direta não mostra opções próprias
  de leilão.
- A lista não oferece uma segunda busca livre por endereço, bairro e cidade. A
  localização é escolhida pelos autocompletes da lateral; acima dos resultados
  ficam apenas o total encontrado, a ordenação e o modo de visualização.
- A faixa cadastral do questionário vai de “Até R$ 150 mil” a “Acima de R$ 1
  milhão” e não filtra o catálogo. O valor máximo digitado na lateral limita
  somente o valor inicial do imóvel. Taxas, reforma, eventual desocupação e
  outras despesas continuam explicadas em cada imóvel; nenhuma das duas escolhas
  garante custo final nem aprovação de financiamento.
- Separa **Leilões** e **Compra direta** em abas, porque são produtos com lógicas
  opostas: um tem disputa e data, o outro é primeiro a chegar.
- Exibe imóveis reais do catálogo de produção, com fotos quando disponíveis.
- A ordenação padrão é relevância: data mais próxima primeiro, depois quanto do
  imóvel realmente conhecemos. Desconto continua disponível, mas não é o padrão.
- Diferenças de preço aparecem em reais, não em porcentagem.

### Página do imóvel

Quatro áreas numeradas e um guia lateral:

1. **Quanto você vai pagar:** o valor que a pessoa pretende oferecer, os gastos
   que ela pode ajustar, a conta aberta item por item, o total até a chave e o
   custo mensal de morar em bloco separado.
2. **Preço na região:** comparação com a avaliação oficial e com imóveis
   parecidos, os anúncios usados, e quanta evidência sustenta a estimativa.
3. **Regras deste leilão / Documentos:** dados oficiais, documentos, datas,
   preços, pagamento e responsabilidades quando publicados.
4. **Pendências do imóvel:** permanece como “Em breve”. O produto não entrega
   parecer jurídico nem classificação automática de risco legal.

**O que fazer agora** acompanha a página como painel lateral sem numeração.
Organiza as etapas antes e depois da compra, mostra o percentual concluído e usa
datas reais quando existirem. O painel se apresenta ao chegar ao fim da página;
chegar ao fim das regras oficiais registra essa leitura como concluída. O avanço
de cada imóvel pertence à conta Google: ao voltar ao imóvel, em qualquer
dispositivo, as etapas marcadas continuam marcadas.

O produto não chama nenhum valor de “seu limite”: a comparação com a avaliação
oficial continua disponível na área de preços, sem parecer uma recomendação de
oferta. Condomínio aparece no custo mensal somente para apartamentos ou imóveis
explicitamente descritos como parte de um condomínio; nos demais casos, a conta
mensal mostra apenas IPTU.

O ITBI faz parte do total até a chave em todo município brasileiro. Quando a
alíquota municipal foi revisada, a conta usa essa referência e identifica a
prefeitura. Enquanto ela ainda não foi cadastrada, o produto reserva 3% do valor
informado para a compra, rotula a linha como estimativa do Argos e orienta a
confirmação da alíquota e da base de cálculo na prefeitura. Preço, ITBI, registro,
desocupação e reforma aparecem mesmo quando a comparação de mercado ainda não
foi coletada; essa pendência não bloqueia a conta disponível.

O acesso ao anúncio oficial permanece destacado como “Ver o leilão na Caixa” ou
ação equivalente à modalidade.

### Conta, salvos e vistos

- Quando a pessoa está conectada, um ícone de usuário no lado direito do
  cabeçalho abre a central de conta. Ela mostra nome, e-mail, onde os dados são
  mantidos e as preferências de cidade, tipo de imóvel e faixa de preço que a
  própria pessoa informou. As preferências podem ser refeitas pelo mesmo
  questionário do cadastro.
- A central tem uma área de Assinatura identificada como **Em breve**. Ela não
  apresenta planos fictícios e deixa explícito que não existe assinatura nem
  cobrança ativa.
- Em produção, Salvos e Vistos exigem uma conta Google ativa. Previews públicos
  mantêm essas áreas como apoio de validação local, sem criar uma identidade.
- Salvos, Vistos e o avanço em “O que fazer agora” ficam na conta Google e são
  os mesmos em todos os dispositivos. Limpar os Vistos limpa o histórico da
  conta. Em produção o navegador não guarda cópia local dessas listas; o que um
  navegador tinha guardado antes das contas é importado uma única vez no
  primeiro acesso com Google.

## Dados e confiança

- Dados oficiais da Caixa e estimativas do Argos são conceitos diferentes e
  devem ser rotulados separadamente.
- Uma estimativa de planejamento pode preencher um custo necessário quando sua
  limitação estiver explícita; ela não se torna uma alíquota oficial por aparecer
  na conta.
- **Ausência de evidência nunca vira afirmação.** Uma linha de custo sem valor
  apurado não é emitida; uma dívida citada no documento sem valor aparece como
  menção, não como número; um veredito de risco não calculado não é publicado.
- Valor de avaliação, preço mínimo, preços de 1º/2º leilão e estimativa de
  mercado não podem ser apresentados como se fossem o mesmo valor.
- Informações ausentes devem aparecer como indisponíveis; nunca devem ser
  inventadas para preencher uma tela.
- O catálogo é atualizado por rotinas programadas e persistido em PostgreSQL.
- O navegador acessa catálogo e dados de conta somente pelos serviços do Argos;
  as tabelas do banco não formam uma API pública paralela.
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
5. **Sem personalização fictícia:** o perfil cadastral preenchido pela pessoa não
   altera o catálogo sozinho. A identidade e o perfil pertencem à conta Google.
6. **Segurança proporcional ao impacto:** qualquer ação que grave em produção é
   tratada como uma ação real, inclusive quando executada em preview.

## Ainda não disponível

- Conta própria de e-mail e senha, recuperação de senha e verificação de e-mail.
  O lançamento usa exclusivamente a conta Google.
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

## Variáveis de autenticação

- `GOOGLE_CLIENT_ID` — client id OAuth do app web; o backend verifica os ID
  tokens do Google contra essa audience.
- `VITE_GOOGLE_CLIENT_ID` — o mesmo valor exposto ao Vite para o botão Google.
- `JWT_SECRET` — string aleatória com pelo menos 32 bytes; assina o identificador
  interno da sessão, que expira em 12 horas e fica somente em cookie HttpOnly.
- `AUTH_ALLOWED_ORIGINS` — origens adicionais, separadas por vírgula, quando um
  ambiente autorizado precisar chamar a API fora do mesmo domínio.

A tela de consentimento OAuth precisa autorizar a origem de produção e
`http://localhost:5173` para desenvolvimento local. Previews de branch mantêm o
catálogo público e não oferecem login Google.
