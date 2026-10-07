# Painel do imóvel — primeira etapa Client First em REM

Implementação: foto, painel e ações relacionadas na página do imóvel. Cabeçalho
global e quatro abas inferiores ainda usam estilos legados.

## Conferência

- Lint, build e 89 testes de frontend; seis testes novos cobrem a apresentação
  das rodadas, sem modificar o resolvedor de preços ou fórmulas financeiras.
- `lint:design`: unidades REM, tokens e restrições de movimento no novo CSS.
- Imóvel real 859: desktop 1440, mobile 390 e 320; sem rolagem horizontal.
- Ações: altura comum de 2.5rem no desktop e 3.25rem no mobile; datas e preços
  na mesma coordenada vertical nas duas colunas.
- Componentes reais com seis conjuntos fictícios em navegador local: primeira
  rodada, segunda vigente, preço/data ausentes, segunda mais cara com preço longo,
  venda direta e licitação. Desktop e 320 sem overflow, datas alinhadas.
- Fonte raiz ampliada para 125%: ações cresceram proporcionalmente, sem overflow.
- Descrição abre; console sem novos erros; movimento reduzido desliga transição
  e contador não pulsa. Montagem fictícia removida antes do commit.
- Revisão React: componentes sem hooks condicionais, chaves estáveis, SVGs
  decorativos ocultos, Salvar com estado acessível e details/summary nativos.

## Validar na preview

1. Abra um imóvel e compare a foto, o título e o endereço completo.
2. Confira as duas rodadas: preços/datas alinhados, desconto separado e avaliação.
3. Abra Descrição e Características; confira os links oficiais e o estado Salvar.
4. Repita no celular e amplie a fonte do navegador.

Previews usam dados reais. Esta rodada não executou gravações em produção.
Fotos: [desktop](desktop.png) e [mobile](mobile.png).
