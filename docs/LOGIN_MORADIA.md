# Base de acesso e perfil de moradia

O produto aceita conta Google, com sessão no servidor, ou o formulário local de
e-mail e senha. No protótipo local, a conta, o verificador de senha com salt e a
sessão ficam neste navegador. A senha em texto é descartada.

## Rotas e comportamento

- `/entrar`: modos Criar conta e Entrar, com validação local das credenciais.
- `/perfil`: central com os dados da conta, as preferências informadas e a área
  de assinatura futura.
- `/preferencias`: questionário em três escolhas: cidade, tipo de imóvel e faixa
  de preço.
- `/`, `/imovel/{id}`, `/salvos` e `/vistos`: exigem conta ativa. Uma tentativa
  sem conta abre `/entrar` e retorna ao endereço original após o acesso.
- `/?busca=todos` não contorna a entrada obrigatória.

Preferências são validadas e versionadas em `argos_housing_profile_v1` no
localStorage. Aplicar uma busca é temporário; salvar muda os próximos acessos.
Dados não são sincronizados entre dispositivos. Trabalho pode ser aproximado.

## Próxima integração

`HousingLogin` recebe `onSignUp` e `onSignIn`, que formam a fronteira do adaptador
local. A conta Google possui autenticação no servidor; o formulário local serve
à experiência de interface e não é autorização para proteger uma API.

`localAuth.js` concentra a conta/sessão local, e `housingStorage.js` concentra o
perfil. Substituir ambos por serviços autenticados, adaptar a carga inicial de
App para assíncrona e tratar carregamento, recuperação de senha, verificação de
e-mail, erros e troca de usuário. Não usar esta sessão local como autorização.

Orçamento é uma triagem do preço inicial do imóvel. Custos adicionais continuam
no detalhe; crédito e aprovação de financiamento não são calculados ou
garantidos.

## Preview local

Em `frontend/.env.local` (ignorado pelo Git), opcionalmente configure
`VITE_DEV_API_ORIGIN` com um endereço público ativo do catálogo. O proxy remoto
aceita apenas GET/HEAD e mantém `/api`; sem a opção, usa o backend local :8000.
Não inclua credenciais nessa variável pública.

Na pasta frontend: `npm run dev -- --host 127.0.0.1 --port 5174`.
Validação: `npm run lint`, `npm test`, `npm run build`, seguida de navegador
desktop/mobile, bloqueio de rotas, cadastro, retorno ao endereço original,
questionário e salvar/recarregar.
