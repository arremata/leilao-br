# Ajustes de hover, detalhes e primeira aba

- Hover de ações secundárias e abas: fundo branco preservado, borda fina roxa.
  Aba selecionada tem estado persistente distinto, com `aria-selected`.
- Entrar/Criar conta e ações com a classe legada de botão agora usam pill.
- Detalhes expandidos ocupam a largura completa; não ampliam a coluna direita.
- Quatro abas quebram linhas, sem barra de rolagem própria, e aceitam setas,
  Home e End. Painel identifica a aba correspondente.
- Primeira aba com REM, rótulos mínimos de .8125rem e campos/ações padronizados.
  Fórmulas, persistência e regras financeiras preservadas.
- Conferido localmente em 1440, 390 e 320; sem overflow horizontal. Hover real
  mostrou fundo branco e borda `#7C3AED`. Teclado mudou para Preço na região.
- Orçamento de teste de R$ 400 mil recalculou o lance máximo para R$ 355.698;
  Recomeçar e abrir/cancelar gasto adicional conferidos em navegador isolado.
- Lint, lint de design, build e 89 testes passaram. Não houve gravação em produção.

Referências: [desktop](desktop.png) e [mobile](mobile.png).
