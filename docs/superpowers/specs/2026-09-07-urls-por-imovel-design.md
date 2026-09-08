# URLs reais por imóvel — desenho

**Data:** 7 de setembro de 2026
**Estado:** aprovado para planejamento
**Depende de:** `2026-09-07-foco-comprador-morar-design.md` (entregue no PR #42)

## 1. O problema

O produto é um SPA sem rotas. A URL nunca é escrita: a navegação é um campo de
estado em `App.jsx`, e todo caminho serve o mesmo `index.html`. Três consequências
concretas, todas verificadas:

- **Não existe endereço para um imóvel.** Não dá para mandar um link, salvar nos
  favoritos, nem abrir dois imóveis lado a lado para comparar.
- **O botão voltar do navegador sai do produto**, em vez de voltar para a lista.
- **`/imovel/923` devolve 404.** O `vercel.json` tem um catch-all `/(.*)` para o
  serviço do frontend, mas o serviço é um build estático sem fallback para
  `index.html`. Confirmado no preview: `/` responde 200 e qualquer outro caminho
  responde 404.

## 2. Escopo

URLs que funcionam de verdade: abrem direto, sobrevivem ao F5, respondem ao botão
voltar e podem ser copiadas e enviadas. A renderização continua no navegador.

### Fora do escopo

Pré-renderizar páginas, `sitemap.xml`, `robots.txt`, dados estruturados e as URLs
de filtro indexáveis por cidade e bairro (a tese de flanqueamento). A injeção das
tags `og:` para pré-visualização de link é a **entrega seguinte** — ver seção 9.

## 3. As rotas

| URL | Tela |
|---|---|
| `/` | Lista de imóveis |
| `/imovel/{id}` | Um imóvel |
| `/salvos` | Imóveis salvos |
| `/vistos` | Imóveis abertos recentemente |
| caminho desconhecido | `404.html`, com link para a lista |

Um **caminho** desconhecido recebe um 404 de verdade do servidor, com uma página
própria que oferece o caminho de volta. Uma versão anterior deste desenho previa
redirecionar para a lista; isso foi revisto ao verificar no preview. Como as
rotas do app são enumeradas (seção 5), o que não está na lista não chega ao
React — e um 404 honesto para um endereço que não existe é melhor do que fingir
que ele existe. O que não pode acontecer é ser um beco sem saída, e é isso que a
página resolve.

Um **id** desconhecido numa rota válida é outra coisa: a rota existe, o imóvel é
que não. Mostra a própria mensagem, descrita em 8.3.

Na lista, o que hoje é estado local vira query: aba (`leiloes` ou `direta`), busca
por endereço, estado, cidade, tipo, rodada, modalidade, desconto mínimo e ordenação.
Só o que estiver diferente do padrão aparece na URL, para o endereço não virar uma
parede de parâmetros. `Feed.jsx:12` já aceita `initialAddress` e `initialFilters`,
props que hoje ninguém passa — a costura já existe.

O `id` é a chave primária numérica de `properties`, e **isso é seguro**. A ingestão
é um upsert por `(source, source_id)` com constraint única
(`backend/db/models.py:22`, `backend/ingestion/run.py:222-232`), e um imóvel que sai
do catálogo vira `status = "removed"` em vez de ser apagado
(`backend/ingestion/run.py:303`). O id nunca é reaproveitado por outro imóvel, então
um link compartilhado hoje aponta para o mesmo imóvel daqui a um ano.

O parâmetro `?screen=` que existe hoje em `App.jsx:13` deixa de ser lido. Ele nunca
funcionou para o detalhe — `?screen=detail` renderizava "Nenhum imóvel selecionado",
porque não havia como dizer *qual* imóvel.

## 4. Roteador

`react-router-dom`. Passa a ser a terceira dependência do frontend, que hoje tem
apenas `react` e `react-dom`. A troca é deliberada: navegação concentra muito caso
de borda — voltar e avançar, foco, rolagem, clique com modificador — e escrever isso
à mão é assumir uma classe de bugs que a biblioteca já resolveu.

Rolagem: ir para o topo em navegação nova; em voltar e avançar, deixar o navegador
restaurar a posição. O comportamento atual (`App.jsx:45-47`) força o topo em toda
troca de tela, o que faria a lista perder a posição ao voltar.

## 5. A hospedagem

`vercel.json` passa a **enumerar as rotas do app**, apontando cada uma para
`/index.html` no serviço do frontend:

```
/imovel/(.*)   ·   /salvos   ·   /vistos   →   /index.html
```

Um catch-all seria mais curto, mas engoliria `/assets/*`, `/sw.js`,
`/manifest.webmanifest`, `/offline.html` e os ícones caso a ordem de verificação de
arquivo mude. Enumerar elimina esse risco pelo custo de uma linha por rota nova.

A rota `/api/(.*)` continua tendo precedência, como hoje.

## 6. Carregar um imóvel sem carregar o catálogo

Hoje `App.jsx:33-43` busca o catálogo inteiro e bloqueia a renderização até
terminar. Com 516 imóveis, quem abrisse `/imovel/923` esperaria todos para ver um.

Passa a ser:

- **Rota da lista** busca o catálogo, como hoje.
- **Rota do imóvel** busca só o item, com `fetchCatalogItem(id)` — que já existe em
  `api.js:32` e devolve o card completo mais o `enrichment`.

`PropertyDetail` passa a aceitar **ou** um objeto de imóvel (navegação vinda da
lista, que já o tem em memória) **ou** apenas um id (link direto). O efeito de busca
que já existe no componente cobre o segundo caso; muda só o ponto de partida.

## 7. O clique

O card vira uma **âncora de verdade**, `<a href="/imovel/{id}">`. É isso que faz
botão do meio, cmd+clique, ctrl+clique e "abrir em nova guia" funcionarem sem
código — comportamentos que hoje não existem porque o card é um `<article>` com
`onClick`.

- **No computador:** `target="_blank"` com `rel="noopener"`. A pessoa compara vários
  imóveis sem perder a busca.
- **No celular:** mesma guia. Guia nova só empilha aba, e o botão voltar do aparelho
  deixa de fazer o que a pessoa espera.

A distinção usa `matchMedia('(pointer: coarse)')` — pergunta se o ponteiro é o dedo,
em vez de inferir por largura de tela, que erra em tablet e em janela estreita no
computador.

A estrela de salvar fica dentro do card e precisa de `preventDefault` além do
`stopPropagation` que já tem, senão o clique nela navega.

As mesmas regras valem para a linha da tabela (`PropertyRow`) e para a linha do
histórico (`HistoryRow`), que hoje também navegam por `onClick`.

## 8. Três defeitos que entram nesta entrega

**8.1 — O service worker grava toda navegação sob `/`.** `sw.js:52` faz
`cache.put('/', copy)` para qualquer resposta de navegação. Hoje é inofensivo porque
todo caminho devolve o mesmo HTML. No instante em que `/imovel/923` passar a existir,
abrir a home offline passaria a mostrar a página de um imóvel. Passa a gravar sob a
própria URL da requisição.

**8.2 — A página offline nunca apareceu.** `sw.js:55` faz
`caches.match('/') || caches.match('/offline.html')`. `caches.match` devolve uma
Promise, que é sempre verdadeira, então o segundo termo é inalcançável e o offline
cai sempre no shell. Passa a resolver a primeira antes de decidir.

Ambos exigem subir o `CACHE_NAME` (`arremate-v1` → `argos-v2`), senão quem já tem o
worker instalado continua com o comportamento antigo.

**8.3 — Imóvel removido é exibido como se estivesse à venda.** `get_catalog_item`
(`vercel-backend/index.py:663`) não filtra por status e devolve o campo `status` no
payload; a lista filtra `status = 'active'` (`:648`). A interface ignora o campo. Com
links compartilháveis isso deixa de ser teórico: alguém vai abrir um link de um mês
atrás. A página passa a dizer que o imóvel saiu do catálogo da Caixa, em vez de
mostrar preço e contagem regressiva de algo que não existe mais.

Um id inexistente (404 da API) recebe sua própria mensagem, distinta de "removido":
não encontramos este imóvel.

## 9. Pré-visualização de link — a entrega seguinte

**Nesta entrega o link funciona, mas a pré-visualização no WhatsApp é genérica:** a
marca do site, não o imóvel. O robô lê o HTML do servidor, que é a mesma casca vazia
para todo caminho.

Isso **não exige pré-renderizar o site** — exige apenas que o HTML entregue ao robô
traga `og:title`, `og:description` e `og:image`. O corpo continua sendo montado pelo
React. É uma entrega bem menor do que o projeto de SEO, e fica separada desta sem
retrabalho: `/imovel/{id}` é justamente a chave que a função usaria.

Viabilidade verificada: **513 dos 516 imóveis têm foto** (99%), servidas pela Caixa
em https, hotlinkáveis, `image/jpeg`, ~60 KB, respondendo normalmente a um robô. Não
é preciso hospedar imagem. Os 3 sem foto precisam de uma imagem padrão.

Duas coisas a resolver quando essa entrega chegar, registradas para não se perderem:

- **Frontend e backend são serviços separados na Vercel.** A função do backend não
  enxerga o `index.html` que o build do frontend gerou, cujos nomes de arquivo têm
  hash. A saída provável é buscar a casca da própria URL pública e guardar em
  memória por instância. É um remendo, e deve ser tratado como tal.
- **Os campos do imóvel precisam ser escapados** ao entrar no HTML. Endereço e
  título vêm de texto livre da Caixa.

## 10. Verificação

- **Backend:** nenhuma mudança de comportamento; a suíte existente deve continuar
  passando.
- **Frontend:** lint e build, mais validação em navegador real nos dois tamanhos.
  O repositório não tem arcabouço de teste unitário no frontend, e introduzir um é
  uma decisão própria, fora deste escopo.
- **Roteiro em navegador**, cobrindo o que não dá para verificar por build:
  1. `/imovel/{id}` de um imóvel real abre direto, sem passar pela lista.
  2. F5 nessa URL mantém a mesma página.
  3. Voltar retorna à lista, com os filtros e a posição de rolagem preservados.
  4. Clique no card abre guia nova no computador e mesma guia no celular.
  5. Cmd+clique e botão do meio abrem guia nova nos dois casos.
  6. Clicar na estrela salva sem navegar.
  7. Um id inexistente mostra a mensagem própria, não uma tela quebrada.
  8. Um imóvel com `status = "removed"` avisa que saiu do catálogo.
  9. `/assets/*`, `/sw.js` e `/manifest.webmanifest` continuam sendo servidos como
     arquivo, e não capturados pela reescrita. Esta é a razão de enumerar as
     rotas: um catch-all para `index.html` transformaria `/sw.js` em HTML.
  10. Console sem erro novo; sem transbordo horizontal no celular.

## 11. Decisão de produto a registrar

**PD-011 — Cada imóvel tem um endereço próprio.** O produto deixa de ser uma tela
só. Consequência: `/imovel/{id}` é um contrato público — o id é estável e links
compartilhados devem continuar funcionando, inclusive para imóveis que saíram do
catálogo, que passam a dizer isso em vez de desaparecer.
