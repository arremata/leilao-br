# Argos Login Design

**Date:** 2026-09-20 **Branch:** `codex/login-perfil-moradia` **Status:** Approved

## Goal

Add real login to the Argos platform. The app is currently auth-free; Salvos/Vistos live
only in browser localStorage. Login gates the whole platform on first open and unlocks
cross-device sync of saved/viewed properties.

## Decisions locked with the user

- Login is a **full gate** — when the platform opens, the login appears.
- Scope for this task is sync-only: no server-side analysis gating yet.
- Auth scheme: **FastAPI JWT + Google Identity Services** (Option A). No Supabase, no
  external auth vendor.
- Session stored in **localStorage** (standard SPA pattern, survives refresh).
- First login goes **straight into the app**. The perfil-moradia onboarding question
  ("Quero morar") is a follow-up feature; the `users` table leaves room for it.
- `/imovel/{id}` stays publicly reachable logged-out (public product contract), but its
  top bar shows an "Entrar" entry.

## Architecture

```
┌──────────────────────────┐         ┌──────────────────────────────┐
│  Frontend (React, Vite)  │         │  Backend (FastAPI, vercel)   │
│                          │  1      │                              │
│  Google One Tap button ──┼──► Google accounts                    │
│  receives ID token       │         │                              │
│                          │  2      │                              │
│  POST /api/auth/google ──┼────────►│  verify ID token (google-auth│
│  { credential }          │         │  against Google public keys) │
│                          │         │  upsert users row by sub     │
│                          │  3      │                              │
│  ◄── { token, user } ────┼─────────│  sign JWT (30d, HS256)       │
│                          │         │                              │
│  localStorage:           │  4      │                              │
│  argos_token, argos_user │         │                              │
│                          │         │                              │
│  AuthProvider context ───┼────────►│  GET /api/me (auth-required) │
│  guards all routes       │         │  POST /api/me/sync           │
│  except /imovel/:id      │         │  PUT /api/me/watch/:id       │
└──────────────────────────┘         └──────────────────────────────┘
```

Two env vars:

- `GOOGLE_CLIENT_ID` — used on both sides: the Google Identity Services client id in the
  frontend, and the audience check when verifying tokens in the backend.
- `JWT_SECRET` — backend only, signs the Argos session token.

## Data model

New migration `20260920_users.sql`:

```sql
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  google_sub    TEXT NOT NULL UNIQUE,     -- stable Google account id
  email         TEXT NOT NULL,
  name          TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_saved_properties (
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id  BIGINT NOT NULL,           -- catalog property id
  saved_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, property_id)
);

CREATE TABLE user_viewed_properties (
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id  BIGINT NOT NULL,
  viewed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot     JSONB NOT NULL,            -- title/address/price as seen
  PRIMARY KEY (user_id, property_id)
);
```

`snapshot` mirrors what the localStorage history entry stores today, so `/vistos` renders
without extra fetches.

## Frontend components

- **`AuthProvider`** (`context/AuthContext.jsx`) — holds `{ user, token, login(credential),
  logout() }`, initializes from localStorage, exposes an `authFetch()` helper that attaches
  `Authorization: Bearer`.
- **`LoginScreen` + `LoginGate`** — wraps `App`. If there is no token and the route isn't
  `/imovel/:id`, show a full-screen login (Argos brand, "Quero encontrar meu lugar" copy,
  Google button). `/imovel/:id` stays reachable logged-out; its top bar shows "Entrar".
- **Watchlist/History sync** — on login, merge localStorage → server (union, server wins
  on duplicates), then clear local copies. `toggleWatch` writes server-side when logged
  in, localStorage otherwise.
- Signed-in UI: avatar + name in the top bar, "Sair" menu item.

## API endpoints

| Method | Path | Auth | Behavior |
|---|---|---|---|
| `POST` | `/auth/google` | no | body `{credential}` → verify → `{token, user}` |
| `GET` | `/me` | yes | profile + saved ids + viewed list |
| `POST` | `/me/sync` | yes | merge `{watched: [ids], history: [entries]}` |
| `PUT` | `/me/saved/{property_id}` | yes | idempotent save/unsave (body `{saved: bool}`) |
| `POST` | `/me/viewed` | yes | record a visit `{property_id, snapshot}` |

Protected routes return `401` on missing/expired token → frontend clears the session and
shows login.

## Error handling & edge cases

- **Invalid/expired Google credential** → `401` with
  `"Não foi possível entrar com o Google. Tente de novo."`
- **Email mismatch on re-login** — keyed by `google_sub`, so email changes on Google's
  side do not create duplicate user rows.
- **Offline** — logged-in state survives via localStorage; server sync failures keep an
  optimistic local write and retry on the next action.
- **Token expiry** — user is soft-logged-out at the next 401; the login screen returns
  with a small "Sua sessão expirou" note.
- **Preview env** — login works the same in preview (same `GOOGLE_CLIENT_ID`, additional
  listed origin). The existing preview-banner logic is unchanged.

## Out of scope

- Perfil-moradia onboarding quiz ("Quero morar" vs "Quero investir") — follow-up task. The
  `users` table will gain a `JSONB profile` column then.
- Email/password or other identity providers.
- Server-side gating of analysis/enrichment (currently public).
- Any changes to the ingestion worker or catalog APIs.

## Testing

- **Backend (`vercel-backend`):** pytest — token verification with mocked Google certs,
  upsert idempotency, sync merge logic, 401 paths on protected routes.
- **Frontend:** render tests for `LoginGate` (redirect to login without token, allow
  `/imovel/:id`), and `AuthProvider` localStorage initialization.
- **Manual:** staging preview with a real Google OAuth test project client id.
