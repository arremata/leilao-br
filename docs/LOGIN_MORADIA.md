# Base de acesso e perfil de moradia

Esta entrega prepara o fluxo completo de conta sem banco de dados ou
autenticação no servidor. No protótipo, a conta, o verificador de senha com salt
e a sessão ficam neste navegador. A senha em texto é descartada.

## Rotas e comportamento

- `/entrar`: modos Criar conta e Entrar, com validação local das credenciais.
- `/perfil`: questionário de região, imóvel, orçamento e rotina.
- `/`: lista personalizada quando existe conta e perfil locais; o primeiro
  acesso abre Criar conta. `/?busca=todos` mantém a exploração livre.
- `/imovel/{id}`, `/salvos` e `/vistos`: continuam públicos.

Preferências são validadas e versionadas em `argos_housing_profile_v1` no
localStorage. Aplicar uma busca é temporário; salvar muda os próximos acessos.
Dados não são sincronizados entre dispositivos. Trabalho pode ser aproximado.

## Próxima integração

`HousingLogin` recebe `onSignUp` e `onSignIn`, que formam a fronteira do adaptador
para integração futura. Autenticação e autorização precisam ser implementadas
no servidor antes de tratar este protótipo como acesso de produção.

`localAuth.js` concentra a conta/sessão local, e `housingStorage.js` concentra o
perfil. Substituir ambos por serviços autenticados, adaptar a carga inicial de
App para assíncrona e tratar carregamento, recuperação de senha, verificação de
e-mail, erros e troca de usuário. Não usar esta sessão local como autorização.

Orçamento é uma triagem de preço inicial + reserva, aplicada apenas quando a
reserva está preenchida. Crédito, trajeto, aluguel e valorização não são
calculados ou garantidos. Requisitos essenciais excluem dados desconhecidos.

## Preview local

Em `frontend/.env.local` (ignorado pelo Git), opcionalmente configure
`VITE_DEV_API_ORIGIN` com um endereço público ativo do catálogo. O proxy remoto
aceita apenas GET/HEAD e mantém `/api`; sem a opção, usa o backend local :8000.
Não inclua credenciais nessa variável pública.

Na pasta frontend: `npm run dev -- --host 127.0.0.1 --port 5174`.
Validação: `npm run lint`, `npm test`, `npm run build`, seguida de navegador
desktop/mobile, questionário, salvar/recarregar e exploração livre.
