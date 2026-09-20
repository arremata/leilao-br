# Login smoke — manual

Pre-conditions:
- `DATABASE_URL` points at a dev Postgres with migration applied
- `GOOGLE_CLIENT_ID` + `JWT_SECRET` set for backend
- `VITE_GOOGLE_CLIENT_ID` set for frontend (`.env.local` in `frontend/`)
- Test Google account authorized in the OAuth consent screen

## Logged-out
1. Open `/`          → login screen renders, Google button visible
2. Open `/salvos`    → login screen (not the Salvos page)
3. Open `/imovel/1`  → property renders; "Entrar" button or nothing auth-dependent shows
4. Reload `/`        → login screen, console has no errors

## First login
5. Click "Continuar com Google" → account chooser → redirect back
6. App loads `/`, TopBar shows avatar + name + Sair
7. localStorage has `argos_token`, `argos_user`; `arremate_watched`/`arremate_history` are gone
8. Star two properties → reload → stars persist

## Sync
9. In an incognito window, log in with the SAME Google account
10. Starred properties appear

## Logout
11. Click Sair → login screen returns; `argos_token` gone; `watched`/`history` cleared from UI
12. `/imovel/1` still renders logged-out

## Token expiry
13. In devtools, edit `argos_token` to garbage → refresh → login screen with "Sua sessão expirou."
14. Or wait for token exp to pass naturally (30d) — should also redirect with the same message
