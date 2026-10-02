# Rodada de validação visual da plataforma

## Ambiente de trabalho

Nesta rodada, solicitada em 1º de outubro de 2026, as alterações serão
acompanhadas pela preview da Vercel vinculada ao PR. O PR inicial abre a versão
atual da plataforma para servir de referência; os próximos ajustes entram na
mesma branch e atualizam a preview.

O endereço confirmado fica na descrição do PR. A preview usa o catálogo real
de produção. O aviso visível na página informa se as ações podem gravar dados;
quando a escrita está habilitada, uma ação persistente também afeta produção.

## Referência para a futura padronização

A landing page já tem um contrato visual baseado em Client-First:
[DESIGN-SYSTEM.md da LP](https://github.com/arremata/Landing-page-Argos/blob/main/DESIGN-SYSTEM.md).
Ele reúne tipografia, espaçamento, tamanhos, raios, botões, hover e movimento
reduzido. Esse é o ponto de partida solicitado para a futura padronização da
plataforma. A aplicação às telas ainda não começou.

Os documentos locais `REDESIGN_ARGOS.md` e
`argos-comunicacao-e-tela-comprador-final.md` ajudam a entender a identidade e
as telas existentes. Os próximos pedidos devem indicar qual experiência será
ajustada antes de alterar componentes ou regras visuais.

## Como conferir a referência atual

1. Abra a preview do PR em desktop e celular e confira o aviso do ambiente.
2. Percorra o catálogo, abra os filtros e consulte um imóvel.
3. Volte à lista e confira a preservação da busca e da posição de rolagem.
4. Compare cabeçalho, campos, botões, tamanhos e estados de hover com a LP.
5. Descreva no chat o próximo ajuste desejado; ele será publicado na mesma
   preview para nova conferência.

Cada alteração visual deve passar por lint, build, conferência em desktop e
celular e verificação do console. A publicação em produção continua dependendo
dos checks exigidos e do merge manual pelo responsável pela produção.
