# Parâmetros visuais e próxima etapa: painel do imóvel

**6 de outubro de 2026.** Complementa a vistoria após a imagem enviada pelo usuário. O painel dentro da página do imóvel continua usando componentes antigos, distintos dos cards recentemente ajustados na listagem. A expressão “cards mais próximos da LP” não significa que esse painel esteja padronizado.

## Fontes e tamanhos

| Uso | Referência da LP | Plataforma atual |
| --- | --- | --- |
| Títulos | Plus Jakarta Sans | Mesma família |
| Corpo, ações e rótulos | Inter | Mesma família no corpo; muitos rótulos usam Mono |
| Números e código | JetBrains Mono quando apropriado | Preços e datas do painel usam Mono |
| Corpo | Papel de 16 px, entrelinha 1,6 | Base global 14 px, entrelinha 1,45 |
| Apoio | 15 px, entrelinha 1,55 | Endereço/descrição do painel 13 px |
| Notas e selos | 13 px mínimo; selo peso 600 | Selo 11 px; rótulo superior 10,5 px; datas/desconto 11 px |
| Título de item | 18 px/700; card grande 22–28 px/800 | Título do painel 32 px/800, entrelinha 1,1 |
| Preço do painel | Definir papel comum e alinhamento | 19 px/500, Mono |

A LP tem título de hero 34–54 px/800 e título de seção 28–40 px/700. Esses tamanhos são para a hierarquia de marketing, não uma obrigação de tornar cada título da aplicação tão grande. Sua base antiga em `lp/styles.css` é 15 px; o papel explícito `text-size-medium` do Client First é 16 px. Novos textos de corpo devem usar o papel explícito.

## Cores

| Função | Padrão LP a seguir | Plataforma atual |
| --- | --- | --- |
| Marca | `#7C3AED` | `#7C3AED` |
| Hover | `#6D28D9` | `#6D28D9` no principal |
| Fundo de marca | `#F3EFFE` | `#EDE9FE` |
| Texto principal | `#1D1D1F` | `#111827` |
| Texto secundário | `#494952` | `#374151` |
| Texto de apoio | `#5E5E65` / `#6C6C71` | `#6B7280` / `#9CA3AF` |
| Branco | `#FFFFFF` | `#FFFFFF` |
| Fundo suave | `#F5F5F7` | `#F3F4F6` |
| Borda neutra | `#E8E8ED` | `#E5E7EB` / `#D1D5DB` |
| Positivo: texto / fundo | `#15803D` / `#E8FAF0` | Legado `#16A34A` / `#DCFCE7`; cards novos usam verde de texto mais escuro |
| Alerta: texto / fundo | `#9A5B00` / `#FFF6E5` | `#B45309` / `#FEF3C7` |
| Erro: texto | `#D70015` | `#DC2626` |

O cinza `#9CA3AF` e o verde `#16A34A` não são adequados para texto pequeno sobre branco (contrastes 2,54:1 e 3,30:1). Cores devem vir dos tokens, não de valores novos isolados em componentes.

## Botões, bordas e formas

| Tamanho | Altura | Fonte Inter | Peso | Espaço lateral | Raio | Borda |
| --- | --- | --- | --- | --- | --- | --- |
| Pequeno | 40 px | 14 px | 600 | 18 px | 999 px | 1 px |
| Padrão | 48 px | 15 px | 600 | 24 px | 999 px | 1 px |
| Grande | 52 px | 15 px | 600 | 32 px; 20 px no mobile da LP | 999 px | 1 px |

As larguras variam conforme o texto; ações lado a lado usam a mesma altura. Link de ação é a variante sem caixa fixa. Variantes principal, secundária, inversa e link, com seus estados, estão no [contrato](PLATFORM_DESIGN_SYSTEM.md#variantes-de-ação).

Campos usam raio 12 px; cards/painéis/modal, 20 px; selos, 999 px. Círculos usam 50%. O desenho de uma seleção ou aba deve ser explicitamente documentado; estilos antigos não são uma alternativa autorizada ao padrão.

## Falhas identificáveis na imagem

1. **Ações sem pill:** “Ver o leilão na Caixa”, downloads, regras e Salvar herdam `.btn.sm`: 28 px de altura, raio 6 px, texto 12 px/500. A ação Criar conta do cabeçalho usa o mesmo padrão antigo.
2. **Selos sem pill:** “1ª rodada” e “Casa” usam raio 6 px e fonte Mono de 11 px. “Ocupado” e “Aceita FGTS” já têm formato pill; não devem ser descritos como se todos os selos estivessem errados.
3. **Raios diferentes:** foto principal 10 px, painel 16 px, miniatura 6 px, rótulo da miniatura 3 px. A foto e o painel devem seguir o papel de superfície de 20 px.
4. **Datas desalinhadas:** na primeira coluna, a data vem logo após o preço. Na segunda, a linha de desconto é inserida antes da data. As colunas não compartilham linhas estruturais. Corrigir com grade comum para rótulo, preço, data e comparação, incluindo conteúdo ausente e textos longos.
5. **Hierarquia confusa:** a avaliação tem destaque semelhante aos preços de compra; quando coincide com a primeira rodada, o número aparece duas vezes. São fatos diferentes, mas é possível indicar a equivalência sem repetir o destaque monetário.
6. **Endereço repetido:** o título inclui a rua, o endereço aparece abaixo e volta na descrição. Manter título por tipo/área e endereço completo em um bloco identificável da página, sem retirar informação importante do detalhe.
7. **Rótulos muito pequenos e claros:** cabeçalhos de preço e avaliação usam 10,5 px e cinza fraco; datas/desconto usam 11 px. Elevar ao papel mínimo de 13 px e às cores de texto da LP.
8. **Datas repetidas:** o prazo mostra a data vigente e a rodada a repete. Organizar prazo e calendário das rodadas numa hierarquia única, preservando a situação oficial.
9. **Ícones inconsistentes:** setas e estrela são caracteres, em vez do SVG de 16 px do padrão de ações.

O topo da foto e do painel está alinhado na imagem. O problema comprovável de alinhamento dentro do painel está nas linhas das rodadas e em seus conteúdos condicionais; não é necessário inventar um desalinhamento do topo.

## Próxima fase delimitada

Focar na **foto e no painel de informações da página do imóvel**, junto às ações relacionadas. Usar como critérios: ações pill de mesma altura; selos coerentes; foto/painel com raio 20 px; título curto; endereço preservado em bloco próprio; preços e datas alinhados; comparação percentual e em reais em linha dedicada; avaliação secundária sem destaque duplicado quando equivalente; textos mínimos de 13 px.

Conferir desktop e mobile, segunda rodada vigente, ausência de segunda rodada, segunda rodada mais cara, compra direta, licitação, textos longos e dados ausentes. Não alterar cálculos ou origem dos dados. A interface dessa fase ainda não foi implementada nesta especificação.

## Outras áreas com desvios

Cabeçalho, filtros, Salvos/Vistos, botões e tabelas nas quatro abas do imóvel, conta, assinatura, questionário e estados vazios/erro mantêm variações antigas. A [vistoria completa](AUDITORIA_CLIENT_FIRST_PLATAFORMA.md) registra 34 estados e as limitações de cobertura. A home da LP é a referência; o próprio documento da LP informa que blog e `/investidor` ainda usam estilos antigos, portanto não representam conformidade completa do site institucional.
