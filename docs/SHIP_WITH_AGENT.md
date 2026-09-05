# Publicar mudanças com um agente

Você não precisa saber programar nem escrever um pedido técnico. Descreva o que
quer mudar no produto como explicaria para outra pessoa da equipe.

Exemplos:

- “No celular, estes valores estão apertados. Deixe mais fácil de ler.”
- “Quero filtrar apenas apartamentos de Curitiba.”
- “Esta informação do edital está errada. Use o dado oficial que aparece aqui.”
- “Ao voltar do imóvel para o Feed, quero manter os filtros que escolhi.”

## O que o agente deve fazer sozinho

1. Entender o pedido e transformá-lo em critérios objetivos de aceite.
2. Investigar o produto e implementar a mudança em uma branch isolada.
3. Testar a mudança e corrigir problemas encontrados.
4. Publicar um preview da Vercel usando dados reais em modo somente leitura.
5. Entregar o link com instruções curtas sobre o que validar.
6. Depois da sua confirmação, abrir o PR para `main` e habilitar o merge automático.

## O que você precisa fazer

Abra o preview e use o produto normalmente. Responda no chat com o que percebeu:

- “Está certo, pode abrir o PR.”
- “No celular ainda ficou apertado.”
- “A regra deveria ser X, não Y.”

Quando o PR estiver pronto, `GustavoAdamee` revisa e aprova no GitHub. A aprovação
é o comando de publicação: o merge só acontece quando a aprovação, os testes e o
preview estiverem todos válidos.

## Limites de segurança

O preview lê o mesmo catálogo usado em produção para representar fielmente o
produto, mas não deve alterar esse catálogo. Ingestão, migrações de banco,
credenciais, permissões, automações e infraestrutura sempre precisam ser
destacadas para revisão especial do responsável técnico.

Cada pessoa usa sua própria conta do GitHub. Ninguém compartilha senha, token ou
credencial de produção com outra pessoa ou com o chat.
