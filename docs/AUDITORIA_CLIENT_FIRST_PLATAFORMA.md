# Vistoria Client First da plataforma

**Data:** 6 de outubro de 2026 · **Base:** `7107a15` · **Estado:** diagnóstico concluído; migração visual ainda pendente.

## Resultado

A plataforma adota as fontes e o roxo da LP, mas ainda mistura o padrão novo dos cards com estilos antigos. As maiores diferenças estão nos textos pequenos, nos botões, no contraste de algumas cores e nos estados de interação. A vistoria não alterou a interface ou as regras da plataforma.

A referência é o contrato da **home da LP** em `C:/Projetos/GL2/landing-page/DESIGN-SYSTEM.md`, `lp/client-first.css` e `lp/styles.css`. A organização Client First deve acompanhar os componentes da aplicação; as grandes distâncias entre seções de marketing não devem ser copiadas automaticamente para filtros e tabelas.

## Critérios para a padronização

- Mesmas famílias tipográficas, cores, papéis de texto e estados de interação da LP.
- Texto de leitura com 16 px; textos auxiliares com pelo menos 13 px.
- Ações com alturas de 40, 48 ou 52 px, formato arredondado e estados de foco, hover e pressionamento previsíveis.
- Campos com raio de 12 px; cards e painéis com 20 px; ações e selos com raio arredondado.
- Layout legível no celular, sem rolagem horizontal e com controles fáceis de tocar.
- Preservar identificação dos imóveis, alinhamento dos cards, cálculos, filtros, navegação e autenticação.

## Cobertura e método

Foram registrados **34 estados de tela**, com medidas de estilos efetivamente renderizados e capturas de referência. Foram usados desktop de 1440 px, celular de 390 px e verificações pontuais de 320 px. Nenhum dos estados medidos apresentou rolagem horizontal. Isso não elimina os problemas de legibilidade e tamanho dos controles.

| Área | Conferência realizada |
| --- | --- |
| Catálogo | Grade, lista, filtros, autocomplete e cabeçalho público |
| Imóvel | Quanto você vai pagar, Preço na região, Regras deste leilão e Consultoria |
| Interações do imóvel | Formulário de gasto adicional e guia O que fazer agora, sem salvar ou marcar etapas |
| Salvos e Vistos | Lista e estados vazios; dados somente no navegador isolado de inspeção |
| Entrada e página inexistente | Desktop/mobile do login de preview e página inexistente no mobile |
| Conta e assinatura | Componentes reais, com nome e e-mail fictícios numa montagem local isolada |
| Questionário | Cidade, tipo de imóvel e orçamento, desktop/mobile; tipo também em 320 px |
| Estados condicionais | Carregamento, imóvel ausente/retirado e tratamentos de erro revisados no código |

Conta e questionário foram inspecionados visualmente com dados fictícios. Não houve login Google real, alteração de perfil ou escrita em produção. O botão oficial Google deve preservar as exigências do provedor. Dicionário e blog públicos pertencem ao site institucional e não fazem parte das telas internas deste levantamento.

O console foi conferido durante a navegação, sem novos erros da aplicação observados. A verificação de movimento reduzido confirmou que o ponto animado da contagem continua pulsando. O levantamento de CSS distingue regras próprias das regras externas do Google.

## O que já está alinhado

- Plus Jakarta Sans nos títulos, Inter no corpo e JetBrains Mono disponíveis para números/código.
- Roxo principal `#7C3AED` compartilhado com a LP.
- Cards recentes com raio de 20 px e grade interna que alinha os blocos entre imóveis da mesma linha.
- Preços das duas rodadas simplificados, bairro/cidade/UF e ausência do endereço completo na lista.
- Nenhuma declaração explícita de `transition: all` encontrada no inventário.
- Ausência de rolagem horizontal nos estados medidos.

## Diferenças prioritárias

**P1:** corrigir na primeira etapa da migração, por afetar leitura ou interação. **P2:** consolidar na sequência, para reduzir variações e manter consistência.

| ID | Prioridade | Padrão da LP | Situação observada | Ajuste recomendado |
| --- | --- | --- | --- | --- |
| DS-01 | P1 | Corpo 16 px; auxiliares ≥13 px | Corpo global 14 px; rótulos de conta/questionário e detalhes entre 8 e 12 px | Definir papéis tipográficos e substituir tamanhos pequenos nos componentes |
| DS-02 | P1 | Botões 40/48/52 px, arredondados | Botão pequeno 28 px/raio 6; padrão 38 px/raio 10; grande 44 px/raio 12 | Unificar variantes e eliminar alturas próprias de cada tela |
| DS-03 | P1 | Texto auxiliar legível e cores semânticas acessíveis | Cinza `#9CA3AF` tem contraste 2,54:1 no branco; verde `#16A34A`, 3,30:1 | Adotar cores de texto da LP; usar verde de texto `#15803D`, já usado nos cards novos |
| DS-04 | P1 | Campos coerentes; fonte móvel 16 px | Filtros com 12,5–13 px no mobile e campo de cidade do questionário com 15 px | Padronizar fonte, altura, borda, foco e área de toque dos controles auxiliares |
| DS-05 | P1 | Hover somente em mouse; pressionamento `scale(.97)`; movimento reduzido | 31 regras próprias de hover sem proteção de mouse; botões/cards antigos sobem; ponto pulsa infinitamente mesmo com movimento reduzido | Aplicar o mesmo comportamento da LP e retirar a animação contínua |
| DS-06 | P2 | Campos 12 px, painéis 20 px, selos arredondados | Painéis e controles com raios 6, 7, 10, 13, 16, 17 e 22 px | Consolidar tokens e revisar cada superfície; preservar geometria de barras e ilustrações |
| DS-07 | P2 | Títulos por função e texto de interface consistente | Título de conta 49 px no desktop; catálogo usa outra escala; muitos rótulos usam monoespaçada | Criar papéis para título de tela, seção, item, preço e informação auxiliar |
| DS-08 | P2 | Espaçamento por escala e contêiner previsível | Layouts têm medidas locais e regras duplicadas | Manter largura útil do catálogo e aplicar escala comum de espaçamentos da aplicação |
| DS-09 | P2 | Estilos compartilhados e classes por componente | 260 blocos de estilo inline; 170 na página do imóvel; 5 manipuladores JS de hover | Migrar aparência estática para classes; manter estilos realmente dependentes dos dados |
| DS-10 | P2 | Ícones SVG de 16 px em ações | Mistura de caracteres, ícones e botões auxiliares muito pequenos | Unificar ícones e ampliar a área acionável sem aumentar desnecessariamente o desenho |
| DS-11 | P2 | Componentes recentes seguem todo o contrato | Salvar tem 44 px e hover suave; tags mantêm raio antigo; contador usa texto pequeno | Completar a padronização dos cards preservando o alinhamento e a hierarquia dos preços |

### Exemplos por tela

- **Catálogo:** “Criar conta” mede 28 px de altura, com texto de 12 px no desktop e 10 px no mobile. O segmento “Leilões” mede 36 px, com texto de 11,5 px. O filtro de cidade precisa do mesmo tratamento de campo da LP.
- **Imóvel:** ações do topo usam o botão pequeno de 28 px. Tabelas, indicadores de mercado e informações de custos misturam tamanhos de 10,5 a 12,5 px. Os formulários monetários também precisam de papéis consistentes para valor, rótulo e explicação.
- **Conta:** “Alterar preferências” tem 34 px de altura e fonte de 10 px. Há rótulos de 9 px e selo “Em breve” de 8 px. Painéis usam raio de 22 px.
- **Questionário:** “Continuar” já mede 48 px, mas mantém raio de 13 px e fonte de 11 px. O botão para limpar cidade tem área de 17 × 17 px. Cartões de escolha têm função distinta de uma ação comum e precisam de um padrão próprio documentado.
- **Estados vazios e erros:** ainda herdam corpo de 14 px, cards com raio de 16 px e ações de 38 px. Também devem entrar na migração.

## Ordem de implementação

1. **Fundação:** tokens, tipografia, botões, campos, foco, cores de texto e movimento reduzido. Migrar componentes compartilhados antes de ajustes isolados.
2. **Descoberta:** cabeçalho, filtros, autocomplete, catálogo, Salvos, Vistos e estados vazios. Preservar as melhorias dos cards.
3. **Imóvel:** topo, abas, tabelas, custos, formulários, documentos, comparáveis e guia lateral. Conferir todos os estados financeiros sem alterar cálculos.
4. **Conta:** entrada, perfil, assinatura e três etapas do questionário. Validar montagem autenticada em ambiente autorizado antes da publicação.
5. **Conferência final:** lint, build, testes pertinentes, teclado, desktop/mobile, console e preview. Conferir contraste em fundos reais, não somente nas amostras brancas.

O contrato operacional proposto está em [PLATFORM_DESIGN_SYSTEM.md](PLATFORM_DESIGN_SYSTEM.md). A implementação deve ser feita em entregas verificáveis; este relatório não significa que a migração já foi aplicada.

## Evidências

- [Catálogo desktop](reviews/client-first-2026-10-06/catalogo-desktop.png)
- [Catálogo mobile](reviews/client-first-2026-10-06/catalogo-mobile.png)
- [Imóvel mobile](reviews/client-first-2026-10-06/imovel-mobile.png)
- [Guia de próximos passos](reviews/client-first-2026-10-06/proximos-passos-mobile.png)
- [Conta com dados fictícios](reviews/client-first-2026-10-06/conta-desktop-fixture.png)
- [Questionário com dados fictícios](reviews/client-first-2026-10-06/questionario-mobile-fixture.png)
- [Autocomplete mobile](reviews/client-first-2026-10-06/autocomplete-mobile.png)
- [Resumo dos 34 estados medidos](reviews/client-first-2026-10-06/resumo-medicoes.json)
- [Inventário estático](reviews/client-first-2026-10-06/inventario-fontes.json)

### Como interpretar os números

O inventário encontrou 373 declarações numéricas de fonte, das quais 226 estão abaixo de 13 px, e 35 tamanhos numéricos diferentes. São declarações de código, incluindo estilos antigos, condicionais e tamanhos de ícone; **não são 226 problemas visíveis distintos**. Valores definidos por variáveis e `clamp()` não entram nessa contagem.

As medidas da tela incluem elementos renderizados fora da área visível e excluem elementos `aria-hidden`. As razões de contraste citadas usam cores sólidas sobre branco; não representam uma aprovação completa de contraste sobre fotos, gradientes ou estados desabilitados. Valores computados de transição com duração zero não foram classificados como uso explícito de `transition: all`.

## Validação da próxima entrega

1. Abra catálogo, Salvos e Vistos no desktop e no celular; compare títulos, ações e filtros.
2. Abra um imóvel e passe pelas quatro abas; confira preços, explicações, campos e guia lateral.
3. Confira conta e as três etapas do questionário num ambiente autorizado.
4. Use teclado e movimento reduzido; confirme foco visível e ausência de animações contínuas.
5. Confira estados vazios e página inexistente. Aprove a preview antes da abertura do PR de produção.
