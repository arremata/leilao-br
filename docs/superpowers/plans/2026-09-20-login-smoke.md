# Login Google — validação manual

Pré-condições de produção/local:

- banco com a migration de usuários já aplicada;
- `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID` e `JWT_SECRET` configurados;
- origem oficial autorizada no Google OAuth;
- preview de branch continua público e não oferece login Google.

## Visitante em produção

1. Abrir `/`, `/salvos`, `/vistos`, `/perfil` e um link `/imovel/{id}`: todos
   levam a `/entrar`.
2. Confirmar que a tela oferece somente “Continuar com Google”, sem campos de
   e-mail ou senha do Argos.
3. Confirmar console limpo e ausência de `argos_token`, `argos_user` e
   `argos_local_account_v1` no localStorage.

## Primeiro acesso

4. Continuar com Google: o backend valida o ID token e define `argos_session`
   como cookie HttpOnly, Secure e SameSite=Lax.
5. Confirmar que a pessoa segue para o questionário de moradia e que concluir o
   questionário abre o catálogo sem aplicar o perfil como filtro.
6. Abrir `/perfil`: nome, e-mail e preferências pertencem à conta Google.

## Retorno, sincronização e saída

7. Atualizar a página: a sessão é recuperada por `GET /me`, sem token acessível
   ao JavaScript.
8. Entrar com a mesma conta em outro navegador: Salvos e Vistos sincronizam.
9. Entrar novamente em outro dispositivo ou navegador: as duas sessões
   permanecem válidas e independentes.
10. Sair em um dispositivo: o cookie expira e essa sessão é revogada no banco;
    uma cópia anterior do cookie recebe `401`, mas a outra sessão continua ativa.

## Segurança HTTP

11. Origem externa recebe bloqueio de CORS e requisições mutáveis sem `Origin`
    recebem `403`.
12. Respostas `/api/auth/*` e `/api/me*` usam `Cache-Control: no-store`.
13. Documento e API entregam CSP, anti-framing, `nosniff`, Referrer-Policy e
    Permissions-Policy; o login Google e o catálogo continuam sem erros no
    console.
