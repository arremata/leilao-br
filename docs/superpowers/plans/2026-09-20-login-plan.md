# Login (perfil moradia) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the Argos platform behind Google login and sync the current localStorage
watchlist/history into per-user server rows.

**Architecture:** FastAPI (vercel-backend) verifies a Google ID token, upserts a `users`
row keyed by `google_sub`, and issues a 30-day HS256 session JWT. The React frontend wraps
the app in an `AuthProvider` + `LoginGate`; everything except `/imovel/:id` requires a
session. Salvos/Vistos merge from localStorage into `user_saved_properties` /
`user_viewed_properties` on first login and stay server-backed while logged in.

**Tech Stack:** FastAPI · SQLAlchemy raw `text()` (matches vercel-backend style) ·
`google-auth` + `PyJWT` · React 18 · localStorage session · Google Identity Services.

Spec: `docs/superpowers/specs/2026-09-20-login-design.md`

---

## Environment / secrets (set once, outside code)

- `GOOGLE_CLIENT_ID` — Google OAuth web client id (shared by frontend + backend)
- `VITE_GOOGLE_CLIENT_ID` — the same value for the Vite build (frontend can only read `VITE_*` vars)
- `JWT_SECRET` — random ≥32-byte string, backend only

Add to `vercel-backend/.env` (not committed) and to Vercel project env vars. For local
dev, the frontend reads from `frontend/.env.local` as `VITE_GOOGLE_CLIENT_ID`.

---

## File map

**Backend (vercel-backend):** all new code in `vercel-backend/auth.py` (token logic) and
`vercel-backend/users_db.py` (SQL helpers). Endpoints mounted in
`vercel-backend/index.py`. Migration in `backend/db/migrations/20260920_users.sql`. Tests
in `backend/tests/test_auth.py` (imports the vercel module the same way
`test_vercel_catalog.py` does).

**Frontend:** `src/auth/AuthContext.jsx` (provider), `src/auth/LoginGate.jsx` (gate +
screen), `src/auth/api.js` (auth fetch helpers). Wired in `src/main.jsx` and
`src/App.jsx` (replace TopBar auth block, replace watched/history localStorage with
sync calls). No frontend test runner exists, so behavior is verified via a manual smoke
script at the end.

---

## Phase 1 — Backend

### Task 1: Users migration

**Files:**
- Create: `backend/db/migrations/20260920_users.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  google_sub    TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL,
  name          TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_saved_properties (
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id  BIGINT NOT NULL,
  saved_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, property_id)
);

CREATE TABLE IF NOT EXISTS user_viewed_properties (
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id  BIGINT NOT NULL,
  viewed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot     JSONB NOT NULL,
  PRIMARY KEY (user_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_user_saved_user ON user_saved_properties(user_id);
CREATE INDEX IF NOT EXISTS idx_user_viewed_user ON user_viewed_properties(user_id);
```

- [ ] **Step 2: Apply to dev database**

```bash
psql "$DATABASE_URL" -f backend/db/migrations/20260920_users.sql
```

Expected: `CREATE TABLE` × 2, `CREATE INDEX` × 2.

- [ ] **Step 3: Commit**

```bash
git add backend/db/migrations/20260920_users.sql
git commit -m "feat: users + saved/viewed tables migration"
```

---

### Task 2: Google token verification + session JWT

**Files:**
- Create: `vercel-backend/auth.py`
- Test: `backend/tests/test_auth.py`

The vercel backend is a single-file module today. Keep auth in a small module imported
by `index.py` so it stays testable without booting FastAPI.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_auth.py`:

```python
"""Contract tests for the vercel-backend auth module."""

from datetime import datetime, timedelta, timezone
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import pytest


MODULE_PATH = Path(__file__).parents[2] / "vercel-backend" / "auth.py"
SPEC = spec_from_file_location("vercel_auth", MODULE_PATH)
auth = module_from_spec(SPEC)
SPEC.loader.exec_module(auth)


def test_issue_and_verify_session_round_trip():
    user = {"id": 42, "email": "a@b.com", "name": "Ana", "avatar_url": None}
    token = auth.issue_session_token(user, secret="s" * 32, ttl_days=30)
    decoded = auth.verify_session_token(token, secret="s" * 32)
    assert decoded["sub"] == "42"
    assert decoded["email"] == "a@b.com"


def test_verify_session_token_rejects_expired():
    user = {"id": 1, "email": "a@b.com", "name": "A", "avatar_url": None}
    token = auth.issue_session_token(user, secret="s" * 32, ttl_days=-1)
    with pytest.raises(auth.AuthError):
        auth.verify_session_token(token, secret="s" * 32)


def test_verify_google_credential_uses_google_verifier(monkeypatch):
    captured = {}

    def fake_verify(id_token, request, audience):
        captured["token"] = id_token
        captured["audience"] = audience
        return {"sub": "g-1", "email": "x@y.com", "name": "X", "picture": "p"}

    monkeypatch.setattr(auth.id_token, "verify_oauth2_token", fake_verify)
    payload = auth.verify_google_credential("tok", "client-id")
    assert payload["sub"] == "g-1"
    assert captured == {"token": "tok", "audience": "client-id"}


def test_verify_google_credential_rejects_bad_token(monkeypatch):
    def boom(*_a, **_kw):
        raise ValueError("invalid")

    monkeypatch.setattr(auth.id_token, "verify_oauth2_token", boom)
    with pytest.raises(auth.AuthError):
        auth.verify_google_credential("bad", "client-id")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && ../.venv/bin/python -m pytest tests/test_auth.py -v
```

Expected: 4 failures with `ModuleNotFoundError: No module named 'auth'` (or path error).

- [ ] **Step 3: Implement `vercel-backend/auth.py`**

```python
"""Google login verification and Argos session JWT handling."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from fastapi import HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

# Re-export under the name tests monkeypatch, so we can swap the Google verifier
# without a network call to fetch Google's certs.
id_token = google_id_token


class AuthError(Exception):
    """Any failure the login flow should surface as 401."""


def verify_google_credential(credential: str, client_id: str) -> dict[str, Any]:
    """Call Google's public cert verifier and return the ID-token payload."""
    try:
        return id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            client_id,
        )
    except Exception as exc:  # google-auth raises ValueError subclasses
        raise AuthError("Não foi possível entrar com o Google. Tente de novo.") from exc


def issue_session_token(user: dict, *, secret: str, ttl_days: int = 30) -> str:
    """Sign a JWT for a logged-in user."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user["id"]),
        "email": user["email"],
        "name": user.get("name"),
        "avatar_url": user.get("avatar_url"),
        "iat": now,
        "exp": now + timedelta(days=ttl_days),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def verify_session_token(token: str, *, secret: str) -> dict[str, Any]:
    """Decode and validate an Argos session JWT."""
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("Sua sessão expirou. Entre de novo.") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError("Sessão inválida. Entre de novo.") from exc


def user_from_google_payload(payload: dict) -> dict:
    return {
        "google_sub": payload["sub"],
        "email": payload.get("email", ""),
        "name": payload.get("name"),
        "avatar_url": payload.get("picture"),
    }


def require_settings() -> tuple[str, str]:
    import os
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    secret = os.environ.get("JWT_SECRET")
    if not client_id or not secret:
        raise HTTPException(status_code=503, detail="Login não configurado")
    return client_id, secret
```

- [ ] **Step 4: Add deps to `vercel-backend/requirements.txt`**

Append two lines:

```
google-auth>=2.30.0
PyJWT>=2.8.0
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && ../.venv/bin/python -m pytest tests/test_auth.py -v
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add vercel-backend/auth.py vercel-backend/requirements.txt backend/tests/test_auth.py
git commit -m "feat: google verification + session jwt helpers"
```

---

### Task 3: Users DB helpers

**Files:**
- Create: `vercel-backend/users_db.py`
- Test: `backend/tests/test_auth.py` (append)

The vercel backend uses raw `text()` SQL (no ORM session factory), so these helpers take
a SQLAlchemy `Connection`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_auth.py`:

```python
from sqlalchemy import create_engine, text

from importlib.util import spec_from_file_location, module_from_spec


def _load(name):
    path = Path(__file__).parents[2] / "vercel-backend" / f"{name}.py"
    spec = spec_from_file_location(f"vercel_{name}", path)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


users_db = _load("users_db")


def _fresh_conn():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.exec_driver_sql(
            """
            CREATE TABLE users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              google_sub TEXT NOT NULL UNIQUE,
              email TEXT NOT NULL,
              name TEXT, avatar_url TEXT,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              last_login_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.exec_driver_sql(
            "CREATE TABLE user_saved_properties (user_id INTEGER, property_id INTEGER,"
            " saved_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, property_id))"
        )
        conn.exec_driver_sql(
            "CREATE TABLE user_viewed_properties (user_id INTEGER, property_id INTEGER,"
            " viewed_at TEXT DEFAULT CURRENT_TIMESTAMP, snapshot TEXT,"
            " PRIMARY KEY (user_id, property_id))"
        )
        yield conn
    engine.dispose()


def test_upsert_user_is_idempotent_and_tracks_login():
    conn = next(_fresh_conn())
    first = users_db.upsert_user(conn, {
        "google_sub": "g-1", "email": "x@y.com", "name": "X", "avatar_url": "p",
    })
    second = users_db.upsert_user(conn, {
        "google_sub": "g-1", "email": "x2@y.com", "name": "X2", "avatar_url": "p2",
    })
    assert first["id"] == second["id"]
    # Email refresh on re-login: keyed by google_sub, single row.
    row = conn.execute(text("SELECT email, name FROM users WHERE google_sub='g-1'")).one()
    assert row == ("x2@y.com", "X2")


def test_sync_merges_localstorage_into_server_rows():
    conn = next(_fresh_conn())
    user = users_db.upsert_user(conn, {
        "google_sub": "g-2", "email": "a@b.com", "name": "A", "avatar_url": None,
    })
    users_db.sync_saved(conn, user["id"], [10, 11, 11])   # dupes collapse into the PK
    users_db.sync_viewed(conn, user["id"], [
        {"id": 20, "snapshot": {"title": "t"}},           # correct shape id → snapshot
        {"id": 20, "snapshot": {"title": "t2"}},          # re-view updates, no dupe
    ])
    saved = users_db.get_saved_ids(conn, user["id"])
    viewed = users_db.get_viewed(conn, user["id"])
    assert saved == [10, 11]
    assert len(viewed) == 1 and viewed[0]["property_id"] == 20
    assert viewed[0]["snapshot"]["title"] == "t2"


def test_unsave_removes_row():
    conn = next(_fresh_conn())
    user = users_db.upsert_user(conn, {
        "google_sub": "g-3", "email": "a@b.com", "name": "A", "avatar_url": None,
    })
    users_db.set_saved(conn, user["id"], 30, True)
    users_db.set_saved(conn, user["id"], 30, False)
    assert users_db.get_saved_ids(conn, user["id"]) == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && ../.venv/bin/python -m pytest tests/test_auth.py -v
```

Expected: 3 failures with `ModuleNotFoundError` on `users_db`.

- [ ] **Step 3: Implement `vercel-backend/users_db.py`**

```python
"""Raw-SQL user persistence for the Argos session flow."""

from __future__ import annotations

import json
from typing import Iterable

from sqlalchemy import text


def upsert_user(conn, profile: dict) -> dict:
    conn.execute(
        text(
            """
            INSERT INTO users (google_sub, email, name, avatar_url, last_login_at)
            VALUES (:sub, :email, :name, :avatar, now())
            ON CONFLICT (google_sub) DO UPDATE SET
              email = EXCLUDED.email,
              name = EXCLUDED.name,
              avatar_url = EXCLUDED.avatar_url,
              last_login_at = now()
            """
        ),
        {"sub": profile["google_sub"], "email": profile["email"],
         "name": profile.get("name"), "avatar": profile.get("avatar_url")},
    )
    row = conn.execute(
        text("SELECT id, email, name, avatar_url FROM users WHERE google_sub = :sub"),
        {"sub": profile["google_sub"]},
    ).mappings().one()
    return dict(row)


def get_saved_ids(conn, user_id: int) -> list[int]:
    rows = conn.execute(
        text("SELECT property_id FROM user_saved_properties WHERE user_id = :u ORDER BY saved_at"),
        {"u": user_id},
    ).all()
    return [r[0] for r in rows]


def get_viewed(conn, user_id: int) -> list[dict]:
    rows = conn.execute(
        text(
            "SELECT property_id, snapshot, viewed_at FROM user_viewed_properties"
            " WHERE user_id = :u ORDER BY viewed_at DESC"
        ),
        {"u": user_id},
    ).mappings().all()
    out = []
    for r in rows:
        snapshot = r["snapshot"]
        if isinstance(snapshot, str):
            snapshot = json.loads(snapshot)
        out.append({"property_id": r["property_id"], "snapshot": snapshot,
                    "viewed_at": r["viewed_at"]})
    return out


def set_saved(conn, user_id: int, property_id: int, saved: bool) -> None:
    if saved:
        conn.execute(
            text(
                "INSERT INTO user_saved_properties (user_id, property_id)"
                " VALUES (:u, :p) ON CONFLICT (user_id, property_id) DO NOTHING"
            ),
            {"u": user_id, "p": property_id},
        )
    else:
        conn.execute(
            text("DELETE FROM user_saved_properties WHERE user_id = :u AND property_id = :p"),
            {"u": user_id, "p": property_id},
        )


def sync_saved(conn, user_id: int, property_ids: Iterable[int]) -> None:
    for pid in dict.fromkeys(property_ids):  # dedupe, keep order
        set_saved(conn, user_id, int(pid), True)


def sync_viewed(conn, user_id: int, entries: Iterable[dict]) -> None:
    for entry in entries:
        conn.execute(
            text(
                """
                INSERT INTO user_viewed_properties (user_id, property_id, snapshot)
                VALUES (:u, :p, CAST(:s AS JSONB))
                ON CONFLICT (user_id, property_id) DO UPDATE SET
                  viewed_at = now(), snapshot = EXCLUDED.snapshot
                """
            ),
            {"u": user_id, "p": int(entry["id"]), "s": json.dumps(entry["snapshot"])},
        )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && ../.venv/bin/python -m pytest tests/test_auth.py -v
```

Expected: 7 passed.

(The `CAST(:s AS JSONB)` keeps the same statement runnable under Postgres for prod and
under SQLite for tests — SQLite stores JSON as text, which `get_viewed` handles with the
`isinstance(snapshot, str)` branch above.)

- [ ] **Step 5: Commit**

```bash
git add vercel-backend/users_db.py backend/tests/test_auth.py
git commit -m "feat: user persistence helpers"
```

---

### Task 4: Auth endpoints

**Files:**
- Modify: `vercel-backend/index.py` (imports + endpoints + dependency guard)
- Test: `backend/tests/test_auth.py` (append)

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_auth.py`:

```python
"""HTTP-level tests through the real FastAPI app.

Auth endpoints delegate to three module-level functions (`auth_module`,
`users_db_module`, `_get_engine`). Endpoint tests stub the auth/DB helpers
directly instead of dragging a sqlite schema through FastAPI.
"""

from fastapi.testclient import TestClient


vercel_index = _load("index")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid")
    monkeypatch.setenv("JWT_SECRET", "s" * 32)
    yield TestClient(vercel_index.app)


def test_auth_google_returns_session(client, monkeypatch):
    monkeypatch.setattr(
        vercel_index.auth_module, "verify_google_credential",
        lambda cred, cid: {"sub": "g-9", "email": "e@x.com", "name": "E", "picture": "p"},
    )
    captured = {}

    class _Conn:
        def execute(self, statement, params=None):
            captured["params"] = params
            class _R:
                def mappings(self_inner):
                    class _M:
                        def one(self_m):
                            return {"id": 7, "email": params["email"],
                                    "name": params.get("name"),
                                    "avatar_url": params.get("avatar")}
                    return _M()
            return _R()

    class _Engine:
        def begin(self):
            class _B:
                def __enter__(self_inner):
                    return _Conn()
                def __exit__(self_inner, *exc):
                    return False
            return _B()

    monkeypatch.setattr(vercel_index, "_get_engine", lambda: _Engine())

    res = client.post("/api/auth/google", json={"credential": "tok"})

    assert res.status_code == 200
    body = res.json()
    assert body["user"]["email"] == "e@x.com"
    assert body["token"]
    assert captured["params"]["sub"] == "g-9"


def test_auth_google_rejects_bad_credential(client, monkeypatch):
    def boom(*_a, **_kw):
        raise vercel_index.auth_module.AuthError("bad")
    monkeypatch.setattr(vercel_index.auth_module, "verify_google_credential", boom)

    res = client.post("/api/auth/google", json={"credential": "x"})
    assert res.status_code == 401


def test_me_requires_session(client):
    assert client.get("/api/me").status_code == 401


def test_me_returns_profile_when_authed(client, monkeypatch):
    user = {"id": 11, "email": "a@b.com", "name": "A", "avatar_url": None}
    token = vercel_index.auth_module.issue_session_token(
        user, secret="s" * 32, ttl_days=30,
    )
    monkeypatch.setattr(
        vercel_index.users_db_module, "get_saved_ids", lambda conn, uid: [1, 2],
    )
    monkeypatch.setattr(
        vercel_index.users_db_module, "get_viewed", lambda conn, uid: [
            {"property_id": 5, "snapshot": {"title": "x"}, "viewed_at": "t"},
        ],
    )
    captured = {}

    class _Conn:
        def execute(self, statement, params=None):
            captured.setdefault("calls", []).append(params)
            class _R:
                def all(self_inner): return []
                def mappings(self_inner):
                    class _M:
                        def one(self_m): return dict(user)
                        def all(self_m): return []
                    return _M()
            return _R()

    class _Engine:
        def connect(self):
            class _C:
                def __enter__(self_inner): return _Conn()
                def __exit__(self_inner, *exc): return False
            return _C()
        def begin(self):
            return self.connect()

    monkeypatch.setattr(vercel_index, "_get_engine", lambda: _Engine())

    res = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["email"] == "a@b.com"
    assert body["saved"] == [1, 2]
    assert body["viewed"][0]["property_id"] == 5
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && ../.venv/bin/python -m pytest tests/test_auth.py -v
```

Expected: 4 failures — `AttributeError: module 'vercel_index' has no attribute 'auth_module'`.

- [ ] **Step 3: Implement the endpoints in `vercel-backend/index.py`**

Add right after the existing imports:

```python
from fastapi import Depends
from pydantic import BaseModel

import sys
from pathlib import Path as _Path

sys.path.insert(0, str(_Path(__file__).resolve().parent))
import auth as auth_module          # verify/credential + JWT helpers (Task 2)
import users_db as users_db_module  # SQL helpers (Task 3)
from auth import AuthError
```

(The `sys.path` shim is needed because Vercel imports `index.py` directly, but plain
`import auth` still works there — the directory of the entrypoint is on `sys.path`.)


Add the request/response models and helpers below `AnalyzeRequest`:

```python
class GoogleLoginRequest(BaseModel):
    credential: str


class SyncRequest(BaseModel):
    watched: list[int] = []
    history: list[dict] = []          # entries of {"id": int, "snapshot": {...}}


class SavedToggleRequest(BaseModel):
    saved: bool


class ViewedRequest(BaseModel):
    property_id: int
    snapshot: dict


def _current_user(authorization: str | None = None) -> dict:
    """Dependency that returns the user row or raises 401."""
    _, secret = auth_module.require_settings()
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Entre para continuar")
    try:
        payload = auth_module.verify_session_token(
            authorization.removeprefix("Bearer ").strip(), secret=secret,
        )
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return {
        "id": int(payload["sub"]),
        "email": payload.get("email"),
        "name": payload.get("name"),
        "avatar_url": payload.get("avatar_url"),
    }


CurrentUser = Depends(_current_user)


@app.post("/auth/google")
def auth_google(body: GoogleLoginRequest):
    client_id, secret = auth_module.require_settings()
    try:
        payload = auth_module.verify_google_credential(body.credential, client_id)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    profile = auth_module.user_from_google_payload(payload)
    with _get_engine().begin() as conn:
        user = users_db_module.upsert_user(conn, profile)
    token = auth_module.issue_session_token(user, secret=secret)
    return {"token": token, "user": user}


@app.get("/me")
def me(user: dict = CurrentUser):
    with _get_engine().connect() as conn:
        saved = users_db_module.get_saved_ids(conn, user["id"])
        viewed = users_db_module.get_viewed(conn, user["id"])
    return {"user": user, "saved": saved, "viewed": viewed}


@app.post("/me/sync")
def sync(body: SyncRequest, user: dict = CurrentUser):
    with _get_engine().begin() as conn:
        users_db_module.sync_saved(conn, user["id"], body.watched)
        users_db_module.sync_viewed(conn, user["id"], body.history)
    return {"ok": True}


@app.put("/me/saved/{property_id}")
def set_saved(property_id: int, body: SavedToggleRequest, user: dict = CurrentUser):
    with _get_engine().begin() as conn:
        users_db_module.set_saved(conn, user["id"], property_id, body.saved)
    return {"ok": True}


@app.post("/me/viewed")
def record_viewed(body: ViewedRequest, user: dict = CurrentUser):
    with _get_engine().begin() as conn:
        users_db_module.sync_viewed(
            conn, user["id"], [{"id": body.property_id, "snapshot": body.snapshot}],
        )
    return {"ok": True}
```

**Note on the FastAPI layer:** `_current_user` reads `Authorization` from the raw
header. FastAPI needs the header parameter declared — app's `ApiPrefixMiddleware` passes
headers through unchanged, so the dependency signature works with FastAPI's automatic
header binding when declared as `authorization: str | None = Header(default=None)`.
Adjust the dependency to:

```python
from fastapi import Header

def _current_user(authorization: str | None = Header(default=None)) -> dict:
    ...
```

Also add two CORS allowances (frontend sends `Authorization` and `PUT`):

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["*"],
)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && ../.venv/bin/python -m pytest tests/test_auth.py -v
```

Expected: 11 passed (4 from Task 2, 3 from Task 3, 4 from Task 4).

- [ ] **Step 5: Commit**

```bash
git add vercel-backend/index.py backend/tests/test_auth.py
git commit -m "feat: auth + sync endpoints"
```

---

## Phase 2 — Frontend

No JS test runner exists in `frontend/`. Frontend tasks are verified by the smoke script in
Task 9; the TDD loop here is "edit → render → manual check", automated where practical.

### Task 5: Auth API helpers + module-level comments

**Files:**
- Create: `frontend/src/auth/api.js`
- Create: `frontend/src/auth/index.js` (re-export surface)

- [ ] **Step 1: Write `frontend/src/auth/api.js`**

```javascript
/**
 * Auth-scoped API helpers. Every request goes through `/api/...`; the session JWT is
 * attached via Authorization when present. localStorage keys:
 *   argos_token — the JWT returned by /auth/google
 *   argos_user  — cached profile for fast first paint; /me is the source of truth
 */

const TOKEN_KEY = 'argos_token';
const USER_KEY = 'argos_user';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
}

export function getCachedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveSession({ token, user }) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch { /* storage full — keep session in memory */ }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('arremate_watched');
    localStorage.removeItem('arremate_history');
  } catch { /* ignore */ }
}

export class AuthError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) throw new AuthError(await _detail(res) || 'Sua sessão expirou. Entre de novo.', 401);
  if (!res.ok) throw new Error(await _detail(res) || `Erro ${res.status}`);
  return res.json();
}

async function _detail(res) {
  try {
    const data = await res.json();
    return typeof data?.detail === 'string' ? data.detail : null;
  } catch { return null; }
}

export const authApi = {
  loginWithGoogle: (credential) =>
    request('/auth/google', { method: 'POST', body: { credential }, auth: false }),
  me: () => request('/me'),
  sync: ({ watched, history }) =>
    request('/me/sync', { method: 'POST', body: { watched, history } }),
  setSaved: (propertyId, saved) =>
    request(`/me/saved/${propertyId}`, { method: 'PUT', body: { saved } }),
  recordViewed: (propertyId, snapshot) =>
    request('/me/viewed', { method: 'POST', body: { property_id: propertyId, snapshot } }),
};
```

- [ ] **Step 2: Write `frontend/src/auth/index.js`**

```javascript
export {
  authApi, getToken, getCachedUser, saveSession, clearSession, AuthError,
} from './api';
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/auth/
git commit -m "feat: frontend auth api helpers"
```

---

### Task 6: AuthContext provider

**Files:**
- Create: `frontend/src/auth/AuthContext.jsx`

- [ ] **Step 1: Implement the provider**

```jsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  authApi, getCachedUser, getToken, saveSession, clearSession, AuthError,
} from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getCachedUser());
  const [synced, setSynced] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const token = getToken();
  const isAuthed = Boolean(token && user);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setSynced(false);
  }, []);

  // On a fresh 401 anywhere, soft-logout and tell the login screen why.
  useEffect(() => {
    const onExpired = () => {
      clearSession();
      setUser(null);
      setSynced(false);
      setSessionExpired(true);
    };
    window.addEventListener('argos:session-expired', onExpired);
    return () => window.removeEventListener('argos:session-expired', onExpired);
  }, []);

  const loginWithGoogle = useCallback(async (credential) => {
    const data = await authApi.loginWithGoogle(credential);
    saveSession(data);
    setSessionExpired(false);
    setUser(data.user);
    return data.user;
  }, []);

  // One-time sync of localStorage watchlist/history into the account, then
  // continuity: every later toggle/view writes server-side.
  useEffect(() => {
    if (!isAuthed || synced) return;
    let cancelled = false;
    const watched = _readIds('arremate_watched');
    const history = _readHistory('arremate_history');
    authApi.sync({ watched, history })
      .then(() => authApi.me())
      .then((data) => {
        if (cancelled) return;
        saveSession({ token: getToken(), user: data.user });
        setUser(data.user);
        setSynced(true);
        try {
          localStorage.removeItem('arremate_watched');
          localStorage.removeItem('arremate_history');
        } catch { /* ignore */ }
        window.dispatchEvent(new CustomEvent('argos:synced', { detail: data }));
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AuthError) {
          window.dispatchEvent(new Event('argos:session-expired'));
        }
        // Transient failure: stay localStorage-backed until next action retries.
      });
    return () => { cancelled = true; };
  }, [isAuthed, synced]);

  const value = useMemo(() => ({
    user,
    isAuthed,
    synced,
    sessionExpired,
    loginWithGoogle,
    logout,
    setSessionExpired,
  }), [user, isAuthed, synced, sessionExpired, loginWithGoogle, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function _readIds(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(raw) ? raw.map(Number).filter(Number.isFinite) : [];
  } catch { return []; }
}

function _readHistory(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(entry => entry && Number.isFinite(Number(entry.id)))
      .map(entry => ({ id: Number(entry.id), snapshot: entry }));
  } catch { return []; }
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
```

- [ ] **Step 2: Wire into `frontend/src/main.jsx`**

Current file (read it before editing):

```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles.css';
import App from './App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

Change to:

```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles.css';
import App from './App';
import { AuthProvider } from './auth/AuthContext';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/auth/AuthContext.jsx frontend/src/main.jsx
git commit -m "feat: auth context provider + main wiring"
```

---

### Task 7: LoginGate + LoginScreen

**Files:**
- Create: `frontend/src/auth/LoginGate.jsx`

- [ ] **Step 1: Implement the gate**

```jsx
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

const PUBLIC_PATH = /^\/imovel\/[^/]+$/;

export default function LoginGate({ children }) {
  const { isAuthed, sessionExpired } = useAuth();
  const location = useLocation();
  const isPublic = PUBLIC_PATH.test(location.pathname);

  if (isAuthed || isPublic) return children;
  return <LoginScreen sessionExpired={sessionExpired} />;
}

function LoginScreen({ sessionExpired }) {
  const { loginWithGoogle } = useAuth();
  const buttonRef = useRef(null);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google?.accounts?.id) return undefined;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async ({ credential }) => {
        try { await loginWithGoogle(credential); } catch { /* screen already shows */ }
      },
    });
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: 320,
    });
    window.google.accounts.id.prompt();
    return () => window.google.accounts.id.cancel();
  }, [loginWithGoogle]);

  return (
    <div className="login-screen" style={{
      minHeight: '100dvh', display: 'grid', placeItems: 'center',
      background: 'var(--bg-0)', padding: '24px',
    }}>
      <div className="card" style={{ maxWidth: 420, padding: '40px 36px', textAlign: 'center' }}>
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 18 }}>
          <span className="logo" />
          Argos
        </div>
        <h1 className="h1" style={{ marginBottom: 10 }}>Quero encontrar meu lugar.</h1>
        <p style={{ color: 'var(--fg-2)', marginBottom: 24 }}>
          Imóveis da Caixa com a conta de quanto você pagaria até receber a chave.
          Entre para salvar imóveis e continuar de onde parou.
        </p>
        {sessionExpired && (
          <p role="status" style={{ color: 'var(--warn, #b45309)', marginBottom: 16, fontSize: 13 }}>
            Sua sessão expirou. Entre de novo.
          </p>
        )}
        <div ref={buttonRef} style={{ display: 'flex', justifyContent: 'center' }} />
        <p style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 20 }}>
          Ao entrar, você concorda com os termos da Argos.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Load Google Identity Services once**

Update `frontend/index.html` inside `<head>` (read the file first to find the right spot):

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

- [ ] **Step 3: Wrap `<App />` in `main.jsx`**

Change the render to:

```jsx
      <AuthProvider>
        <LoginGate>
          <App />
        </LoginGate>
      </AuthProvider>
```

and add the import `import LoginGate from './auth/LoginGate';`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/auth/LoginGate.jsx frontend/src/main.jsx frontend/index.html
git commit -m "feat: login gate + google one-tap screen"
```

---

### Task 8: Wire watchlist/history through the session

**Files:**
- Modify: `frontend/src/App.jsx`

The current `App` reads `arremate_watched` / `arremate_history` from localStorage and
writes back on change. Logged in, those values become server-driven. The provider
broadcasts `argos:synced` after the first `/me` fetch; `App` listens and adopts the
server lists.

- [ ] **Step 1: Replace localStorage seeding with session-aware state**

In `App()`:

```jsx
import { useAuth } from './auth/AuthContext';
import { authApi } from './auth';

const isPreview = import.meta.env.VITE_DEPLOY_ENV === 'preview';
const previewCanWrite = import.meta.env.VITE_PREVIEW_WRITES === 'true';

function App() {
  const { isAuthed, synced } = useAuth();
  const [watched, setWatched] = useState([]);
  const [history, setHistory] = useState([]);
```

  Delete the two `useState(() => { ... localStorage ... })` initializers and the two
  `useEffect` blocks that write `arremate_watched` / `arremate_history`. Keep everything
  else in `App` (catalog fetch, observers, toggleWatch body shell, recordVisit body
  shell).

- [ ] **Step 2: Adopt server lists when sync lands**

```jsx
  useEffect(() => {
    if (!isAuthed || !synced) return;
    const onSynced = (event) => {
      const data = event.detail;
      setWatched(Array.isArray(data.saved) ? data.saved : []);
      setHistory(Array.isArray(data.viewed)
        ? data.viewed.map(entry => entry.snapshot).filter(Boolean)
        : []);
    };
    window.addEventListener('argos:synced', onSynced);
    return () => window.removeEventListener('argos:synced', onSynced);
  }, [isAuthed, synced]);
```

- [ ] **Step 3: Make toggleWatch/recordVisit server-aware**

```jsx
  const toggleWatch = useCallback((id) => {
    setWatched(current => {
      const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
      return next;
    });
    if (isAuthed) {
      setWatched(current => {
        const saved = current.includes(id);
        authApi.setSaved(id, saved).catch(() => {});
        return current;
      });
    }
  }, [isAuthed]);
```

(The first block is the split naive version; the second is the atomic one. **Use the
atomic version below** — do not paste both.)

```jsx
  const toggleWatch = useCallback((id) => {
    setWatched(current => {
      const willSave = !current.includes(id);
      const next = willSave ? [...current, id] : current.filter(x => x !== id);
      if (isAuthed) authApi.setSaved(id, willSave).catch(() => {});
      return next;
    });
  }, [isAuthed]);
```

```jsx
Also in `TopBar` — the Salvos/Vistos empty-state copy in `Watchlist.jsx` refers to
"neste navegador". That's now only true logged-out; logged in it syncs. Leave the copy
as-is for this task (small fix later).

```jsx
  const recordVisit = useCallback((prop) => {
    if (!prop?.id) return;
    const entry = { /* keep the existing shape from App.jsx */ };
    setHistory(prev => [entry, ...prev.filter(h => h.id !== prop.id)].slice(0, 50));
    if (isAuthed) {
      authApi.recordViewed(prop.id, entry).catch(() => {});
    }
  }, [isAuthed]);
```

  The `entry` body is unchanged from the current implementation — copy from
  `App.jsx:108-124`.

- [ ] **Step 4: Add auth UI to TopBar**

Inside `TopBar`, after the existing `<nav>`:

```jsx
        <AuthMenu />
```

and define (in the same file, above `export default App`):

```jsx
import { useAuth } from './auth/AuthContext';
import { authApi } from './auth';

function AuthMenu() {
  const { user, isAuthed, logout } = useAuth();
  if (!isAuthed) return null;
  return (
    <div className="row gap-2" style={{ alignItems: 'center', marginLeft: 'auto' }}>
      {user?.avatar_url
        ? <img src={user.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />
        : <span className="logo" style={{ width: 28, height: 28 }} />}
      <span style={{ fontSize: 14 }}>{user?.name || user?.email}</span>
      <button className="btn" onClick={logout} style={{ height: 30, padding: '0 10px' }}>
        Sair
      </button>
    </div>
  );
}
```

  Add `function AuthMenu...` at the end of `App.jsx`, and render `<AuthMenu />` inside the
  TopBar's outer `div.row.gap-6`, after the `<nav>` element.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: auth-aware watchlist/history + topbar menu"
```

---

## Phase 3 — Smoke, polish, deploy

### Task 9: Manual smoke script

**Files:**
- Create: `docs/superpowers/plans/2026-09-20-login-smoke.md`

- [ ] **Step 1: Write the smoke checklist**

```markdown
# Login smoke — manual

Pre-conditions:
- DATABASE_URL points at a dev Postgres with migration applied
- GOOGLE_CLIENT_ID + JWT_SECRET set for backend
- VITE_GOOGLE_CLIENT_ID set for frontend
- Test Google account authorized in the OAuth consent screen

## Logged-out
1. Open `/`          → login screen renders, Google button visible
2. Open `/salvos`    → login screen (not the Salvos page)
3. Open `/imovel/1`  → property renders; "Entrar" appears in topbar
4. Reload `/`        → login screen, console has no errors

## First login
5. Click "Continue with Google" → account chooser → redirect back
6. App loads `/`, TopBar shows avatar + name + Sair
7. localStorage has `argos_token`, `argos_user`; `arremate_watched`/`arremate_history` are gone
8. Star two properties → reload → stars persist

## Sync
9. In an incognito window, log in with the SAME Google account
10. Starred properties appear

## Logout
11. Click Sair → login screen returns; `argos_token` gone
12. `/imovel/1` still renders logged-out

## Token expiry
13. In devtools, edit `argos_token` to garbage → refresh → login screen with "Sua sessão expirou."
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-09-20-login-smoke.md
git commit -m "docs: login smoke checklist"
```

---

### Task 10: Final verification & deploy prep

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && ../.venv/bin/python -m pytest -x -q
```

Expected: all passed (existing tests must keep passing — check `test_vercel_catalog.py`
specifically since it loads the same module we edited).

- [ ] **Step 2: Build frontend**

```bash
cd frontend && npm run build
```

Expected: clean build, no import errors.

- [ ] **Step 3: Run frontend dev server + hit endpoints**

```bash
cd frontend && npm run dev
# in another shell:
curl -s http://localhost:5173/api/catalog | head -c 200
curl -s -X POST http://localhost:5173/api/auth/google -H 'Content-Type: application/json' -d '{"credential":"x"}'
```

First curl: catalog JSON. Second: `401` with the Portuguese error message.

- [ ] **Step 4: Document env vars**

Append to `docs/PRODUCT_CONTEXT.md` (read first):

```markdown
## Auth env vars

- `GOOGLE_CLIENT_ID` — web OAuth client id (backend verifies with this audience)
- `VITE_GOOGLE_CLIENT_ID` — same value exposed to Vite for the Google button
- `JWT_SECRET` — random string ≥32 bytes; signs 30-day HS256 session tokens

OAuth consent screen must whitelist the preview and production origins, plus
`http://localhost:5173` for dev.
```

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "feat: google login gates platform, syncs watchlist/history"
git push -u origin codex/login-perfil-moradia
```

---

## Open follow-ups (not this task)

- Perfil-moradia onboarding ("Quero morar" quiz) — will add a `profile JSONB` on `users`.
- Replace the placeholder `Sair` icon with a proper avatar menu.
- Email/password and other identity providers.
- Server-side gating of analysis/enrichment endpoints.
