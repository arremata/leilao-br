"""Contract tests for the vercel-backend auth module.

HTTP-level tests through the real FastAPI app.

Auth endpoints delegate to module-level functions on `vercel_index.auth_module`
and `vercel_index.users_db_module`. These tests stub those helpers and run the
real FastAPI app via TestClient so we exercise routing + dependency injection
without needing a live DB or the Google certs endpoint.
"""

from fastapi.testclient import TestClient

from datetime import datetime, timedelta, timezone
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text


MODULE_PATH = Path(__file__).parents[2] / "vercel-backend" / "auth.py"
SPEC = spec_from_file_location("vercel_auth", MODULE_PATH)
auth = module_from_spec(SPEC)
SPEC.loader.exec_module(auth)


def _load(name):
    path = Path(__file__).parents[2] / "vercel-backend" / f"{name}.py"
    spec = spec_from_file_location(f"vercel_{name}", path)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


users_db = _load("users_db")


def _fresh_conn():
    """Return an open SQLite connection with the schema pre-created.

    The caller owns the connection and never closes it — the pytest process
    exits cleanly and the in-memory database evaporates. Schema DDL runs in
    its own transaction and commits before any test body executes.
    """
    engine = create_engine("sqlite://")
    conn = engine.connect()
    with conn.begin():
        conn.exec_driver_sql(
            """
            CREATE TABLE users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              google_sub TEXT NOT NULL UNIQUE,
              email TEXT NOT NULL,
              name TEXT, avatar_url TEXT,
              housing_profile TEXT,
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
        conn.exec_driver_sql(
            "CREATE TABLE user_sessions (id TEXT PRIMARY KEY, user_id INTEGER,"
            " created_at TEXT, expires_at TEXT, revoked_at TEXT)"
        )
    return conn


def test_issue_and_verify_session_round_trip():
    user = {"id": 42, "email": "a@b.com", "name": "Ana", "avatar_url": None}
    token = auth.issue_session_token(
        user, secret="s" * 32, session_id="session-123", ttl_hours=12,
    )
    decoded = auth.verify_session_token(token, secret="s" * 32)
    assert decoded["sub"] == "42"
    assert decoded["iss"] == auth.SESSION_ISSUER
    assert decoded["aud"] == auth.SESSION_AUDIENCE
    assert decoded["jti"] == "session-123"
    assert "email" not in decoded


def test_verify_session_token_rejects_expired():
    user = {"id": 1, "email": "a@b.com", "name": "A", "avatar_url": None}
    token = auth.issue_session_token(
        user, secret="s" * 32, session_id="expired-session", ttl_hours=-1,
    )
    with pytest.raises(auth.AuthError):
        auth.verify_session_token(token, secret="s" * 32)


def test_verify_session_token_rejects_wrong_audience():
    import jwt

    now = datetime.now(timezone.utc)
    token = jwt.encode({
        "sub": "1", "iss": auth.SESSION_ISSUER, "aud": "outro-app",
        "jti": "j", "iat": now,
        "exp": now + timedelta(hours=1),
    }, "s" * 32, algorithm="HS256")
    with pytest.raises(auth.AuthError):
        auth.verify_session_token(token, secret="s" * 32)


def test_verify_google_credential_uses_google_verifier(monkeypatch):
    captured = {}

    def fake_verify(id_token, request, audience):
        captured["token"] = id_token
        captured["audience"] = audience
        return {
            "sub": "g-1",
            "email": "x@y.com",
            "email_verified": True,
            "name": "X",
            "picture": "p",
        }

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


def test_verify_google_credential_rejects_unverified_email(monkeypatch):
    def fake_verify(*_a, **_kw):
        return {"sub": "g-1", "email": "x@y.com", "email_verified": False}

    monkeypatch.setattr(auth.id_token, "verify_oauth2_token", fake_verify)
    with pytest.raises(auth.AuthError):
        auth.verify_google_credential("tok", "client-id")


def test_user_from_google_payload_requires_email():
    with pytest.raises(auth.AuthError):
        auth.user_from_google_payload({"sub": "g-1", "email": ""})


def test_upsert_user_is_idempotent_and_tracks_login():
    conn = _fresh_conn()
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


def test_individual_sessions_can_be_revoked_without_ending_other_devices():
    conn = _fresh_conn()
    login_at = datetime(2026, 9, 25, 12, 0, 0, 123456, tzinfo=timezone.utc)
    user = users_db.upsert_user(conn, {
        "google_sub": "g-session", "email": "x@y.com", "name": "X", "avatar_url": None,
    }, login_at=login_at)
    expires_at = login_at + timedelta(hours=12)
    users_db.create_session(
        conn, user["id"], "browser-a", expires_at, created_at=login_at,
    )
    users_db.create_session(
        conn, user["id"], "browser-b", expires_at, created_at=login_at,
    )
    assert users_db.session_is_active(
        conn, user["id"], "browser-a", now=login_at,
    )
    assert users_db.session_is_active(
        conn, user["id"], "browser-b", now=login_at,
    )

    users_db.revoke_session(
        conn, user["id"], "browser-a", revoked_at=login_at + timedelta(seconds=1),
    )
    assert not users_db.session_is_active(
        conn, user["id"], "browser-a", now=login_at + timedelta(seconds=2),
    )
    assert users_db.session_is_active(
        conn, user["id"], "browser-b", now=login_at + timedelta(seconds=2),
    )


def test_sync_merges_localstorage_into_server_rows():
    conn = _fresh_conn()
    user = users_db.upsert_user(conn, {
        "google_sub": "g-2", "email": "a@b.com", "name": "A", "avatar_url": None,
    })
    users_db.sync_saved(conn, user["id"], [10, 11, 11])   # dupes collapse into the PK
    users_db.sync_viewed(conn, user["id"], [
        {"id": 20, "snapshot": {"title": "t"}},
        {"id": 20, "snapshot": {"title": "t2"}},
    ])
    saved = users_db.get_saved_ids(conn, user["id"])
    viewed = users_db.get_viewed(conn, user["id"])
    assert saved == [10, 11]
    assert len(viewed) == 1 and viewed[0]["property_id"] == 20
    assert viewed[0]["snapshot"]["title"] == "t2"


def test_housing_profile_is_persisted_on_the_user():
    conn = _fresh_conn()
    user = users_db.upsert_user(conn, {
        "google_sub": "g-profile", "email": "a@b.com", "name": "A", "avatar_url": None,
    })
    updated = users_db.set_housing_profile(conn, user["id"], {
        "city": "Curitiba", "property_type": "Apartamento", "budget": "400000",
    })
    assert updated["housing_profile"] == {
        "city": "Curitiba", "property_type": "Apartamento", "budget": "400000",
    }
    assert users_db.get_user(conn, user["id"])["housing_profile"]["city"] == "Curitiba"


def test_unsave_removes_row():
    conn = _fresh_conn()
    user = users_db.upsert_user(conn, {
        "google_sub": "g-3", "email": "a@b.com", "name": "A", "avatar_url": None,
    })
    users_db.set_saved(conn, user["id"], 30, True)
    assert users_db.get_saved_ids(conn, user["id"]) == [30]
    users_db.set_saved(conn, user["id"], 30, False)
    assert users_db.get_saved_ids(conn, user["id"]) == []


def test_upsert_viewed_uses_jsonb_cast_on_postgres(monkeypatch):
    captured = {}

    class _FakeConn:
        class dialect:
            name = "postgresql"

        def execute(self, statement, params):
            captured["sql"] = str(statement)
            captured["params"] = params

    users_db._upsert_viewed(_FakeConn(), 1, 2, {"a": 1})
    assert "CAST(:s AS JSONB)" in captured["sql"]


vercel_index = _load("index")


def _fake_engine_with(conn):
    class _Ctx:
        def __enter__(self):
            return conn
        def __exit__(self, *exc):
            return False
    class _Engine:
        def begin(self): return _Ctx()
        def connect(self): return _Ctx()
    return _Engine()


def _capture_conn():
    calls = []
    class _Conn:
        def execute(self, statement, params=None):
            calls.append(params)
            class _R:
                def mappings(self):
                    class _M:
                        def one(self):
                            return {
                                "id": params["sub"] and 7 or 7,
                                "email": params.get("email", "e@x.com"),
                                "name": params.get("name"),
                                "avatar_url": params.get("avatar"),
                                "housing_profile": None,
                            }
                        def all(self):
                            return []
                    return _M()
                def all(self): return []
            return _R()
    _Conn.calls = calls
    return _Conn()


import pytest


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid")
    monkeypatch.setenv("JWT_SECRET", "s" * 32)
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.delenv("VERCEL_ENV", raising=False)
    monkeypatch.delenv("ARREMATE_PREVIEW_ALLOW_WRITES", raising=False)
    monkeypatch.setattr(
        vercel_index.users_db_module, "session_is_active", lambda *_args: True,
    )
    vercel_index._login_attempts.clear()
    yield TestClient(vercel_index.app)


ORIGIN = {"Origin": "http://testserver"}
GOOGLE_CREDENTIAL = "g" * 200


def _set_session_cookie(client, user_id: int, *, session_id: str = "test-session"):
    token = vercel_index.auth_module.issue_session_token(
        {"id": user_id},
        secret="s" * 32,
        session_id=session_id,
    )
    client.cookies.set(vercel_index.auth_module.SESSION_COOKIE_NAME, token)
    return token


def test_auth_google_returns_session(client, monkeypatch):
    monkeypatch.setattr(
        vercel_index.auth_module, "verify_google_credential",
        lambda cred, cid: {
            "sub": "g-9", "email": "e@x.com", "name": "E", "picture": "p",
            "email_verified": True,
        },
    )
    monkeypatch.setattr(
        vercel_index.users_db_module, "upsert_user",
        lambda conn, profile, login_at: {
            "id": 7, "email": profile["email"], "name": profile.get("name"),
            "avatar_url": profile.get("avatar_url"),
        },
    )
    monkeypatch.setattr(vercel_index, "_get_engine", lambda: _fake_engine_with(_capture_conn()))

    res = client.post(
        "/api/auth/google", headers=ORIGIN, json={"credential": GOOGLE_CREDENTIAL},
    )

    assert res.status_code == 200
    body = res.json()
    assert body["user"]["email"] == "e@x.com"
    assert "token" not in body
    assert "HttpOnly" in res.headers["set-cookie"]
    assert "SameSite=lax" in res.headers["set-cookie"]
    assert res.headers["cache-control"] == "no-store, max-age=0"
    token = res.cookies.get(vercel_index.auth_module.SESSION_COOKIE_NAME)
    assert token
    decoded = vercel_index.auth_module.verify_session_token(
        token, secret="s" * 32,
    )
    assert decoded["sub"] == "7"


def test_auth_google_rejects_bad_credential(client, monkeypatch):
    def boom(*_a, **_kw):
        raise vercel_index.auth_module.AuthError("bad")
    monkeypatch.setattr(vercel_index.auth_module, "verify_google_credential", boom)
    monkeypatch.setattr(vercel_index, "_get_engine", lambda: _fake_engine_with(_capture_conn()))

    res = client.post(
        "/api/auth/google", headers=ORIGIN, json={"credential": GOOGLE_CREDENTIAL},
    )
    assert res.status_code == 401


def test_auth_google_rejects_missing_or_foreign_origin(client):
    assert client.post(
        "/api/auth/google", json={"credential": GOOGLE_CREDENTIAL},
    ).status_code == 403
    assert client.post(
        "/api/auth/google",
        headers={"Origin": "https://evil.example"},
        json={"credential": GOOGLE_CREDENTIAL},
    ).status_code == 403


def test_auth_google_is_disabled_in_preview(client, monkeypatch):
    monkeypatch.setenv("VERCEL_ENV", "preview")
    res = client.post(
        "/api/auth/google", headers=ORIGIN, json={"credential": GOOGLE_CREDENTIAL},
    )
    assert res.status_code == 403


def test_auth_google_rate_limits_repeated_attempts(client, monkeypatch):
    def boom(*_args):
        raise vercel_index.auth_module.AuthError("bad")
    monkeypatch.setattr(vercel_index.auth_module, "verify_google_credential", boom)
    for _ in range(vercel_index._LOGIN_ATTEMPT_LIMIT):
        assert client.post(
            "/api/auth/google", headers=ORIGIN,
            json={"credential": GOOGLE_CREDENTIAL},
        ).status_code == 401
    blocked = client.post(
        "/api/auth/google", headers=ORIGIN,
        json={"credential": GOOGLE_CREDENTIAL},
    )
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"] == str(vercel_index._LOGIN_WINDOW_SECONDS)


def test_me_requires_session(client):
    res = client.get("/api/me")
    assert res.status_code == 401
    assert res.headers["cache-control"] == "no-store, max-age=0"


def test_bearer_token_is_not_accepted_from_javascript(client):
    token = vercel_index.auth_module.issue_session_token(
        {"id": 1}, secret="s" * 32, session_id="bearer-session",
    )
    assert client.get(
        "/api/me", headers={"Authorization": f"Bearer {token}"},
    ).status_code == 401


def test_revoked_session_cookie_is_rejected(client, monkeypatch):
    _set_session_cookie(client, 1)
    monkeypatch.setattr(
        vercel_index.users_db_module, "session_is_active", lambda *_args: False,
    )
    monkeypatch.setattr(vercel_index, "_get_engine", lambda: _fake_engine_with(_capture_conn()))
    assert client.get("/api/me").status_code == 401


def test_foreign_origin_is_not_allowed_by_cors(client):
    res = client.options(
        "/api/auth/google",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert res.status_code == 400
    assert "access-control-allow-origin" not in res.headers


def test_me_returns_profile_when_authed(client, monkeypatch):
    user = {"id": 11, "email": "a@b.com", "name": "A", "avatar_url": None}
    _set_session_cookie(client, user["id"])
    monkeypatch.setattr(
        vercel_index.users_db_module, "get_user", lambda conn, uid: {
            **user,
            "housing_profile": {
                "city": "Curitiba", "property_type": "Casa", "budget": "250000",
            },
        },
    )
    monkeypatch.setattr(
        vercel_index.users_db_module, "get_saved_ids", lambda conn, uid: [1, 2],
    )
    monkeypatch.setattr(
        vercel_index.users_db_module, "get_viewed", lambda conn, uid: [
            {"property_id": 5, "snapshot": {"title": "x"}, "viewed_at": "t"},
        ],
    )
    monkeypatch.setattr(vercel_index, "_get_engine", lambda: _fake_engine_with(_capture_conn()))

    res = client.get("/api/me")
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["email"] == "a@b.com"
    assert body["user"]["housing_profile"]["city"] == "Curitiba"
    assert body["saved"] == [1, 2]
    assert body["viewed"][0]["property_id"] == 5


def test_update_housing_profile_requires_auth_and_returns_account(client, monkeypatch):
    payload = {"city": " Curitiba ", "property_type": "Apartamento", "budget": "400000"}
    assert client.put(
        "/api/me/housing-profile", headers=ORIGIN, json=payload,
    ).status_code == 401

    user = {"id": 12, "email": "a@b.com", "name": "A", "avatar_url": None}
    _set_session_cookie(client, user["id"])
    captured = {}

    def save(_conn, user_id, profile):
        captured.update({"user_id": user_id, "profile": profile})
        return {**user, "housing_profile": profile}

    monkeypatch.setattr(vercel_index.users_db_module, "set_housing_profile", save)
    monkeypatch.setattr(vercel_index, "_get_engine", lambda: _fake_engine_with(_capture_conn()))

    res = client.put(
        "/api/me/housing-profile",
        headers=ORIGIN,
        json=payload,
    )
    assert res.status_code == 200
    assert captured == {
        "user_id": 12,
        "profile": {"city": "Curitiba", "property_type": "Apartamento", "budget": "400000"},
    }
    assert res.json()["user"]["housing_profile"]["property_type"] == "Apartamento"

    res = client.put(
        "/api/me/housing-profile",
        headers=ORIGIN,
        json={"city": "São Paulo", "property_type": "Casa", "budget": "above-1000000"},
    )
    assert res.status_code == 200
    assert captured["profile"]["budget"] == "above-1000000"


def test_update_housing_profile_respects_preview_write_guard(client, monkeypatch):
    user = {"id": 12, "email": "a@b.com", "name": "A", "avatar_url": None}
    _set_session_cookie(client, user["id"])
    monkeypatch.setattr(vercel_index, "_get_engine", lambda: _fake_engine_with(_capture_conn()))
    monkeypatch.setenv("VERCEL_ENV", "preview")

    res = client.put(
        "/api/me/housing-profile",
        headers=ORIGIN,
        json={"city": "Curitiba", "property_type": "Casa", "budget": None},
    )
    assert res.status_code == 403


def test_all_account_writes_respect_preview_guard(client, monkeypatch):
    _set_session_cookie(client, 12)
    monkeypatch.setattr(vercel_index, "_get_engine", lambda: _fake_engine_with(_capture_conn()))
    monkeypatch.setenv("VERCEL_ENV", "preview")
    res = client.put(
        "/api/me/saved/123", headers=ORIGIN, json={"saved": True},
    )
    assert res.status_code == 403


def test_logout_invalidates_server_session_and_expires_cookie(client, monkeypatch):
    _set_session_cookie(client, 15)
    captured = {}
    monkeypatch.setattr(
        vercel_index.users_db_module,
        "revoke_session",
        lambda _conn, user_id, session_id: captured.update(
            user_id=user_id, session_id=session_id,
        ),
    )
    monkeypatch.setattr(vercel_index, "_get_engine", lambda: _fake_engine_with(_capture_conn()))

    res = client.post("/api/auth/logout", headers=ORIGIN)

    assert res.status_code == 200
    assert captured == {"user_id": 15, "session_id": "test-session"}
    assert "Max-Age=0" in res.headers["set-cookie"]
    assert res.headers["cache-control"] == "no-store, max-age=0"


def test_short_jwt_secret_is_rejected(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid")
    monkeypatch.setenv("JWT_SECRET", "short")
    with pytest.raises(Exception) as exc:
        vercel_index.auth_module.require_settings()
    assert exc.value.status_code == 503


def test_production_cookie_is_secure_and_javascript_inaccessible(monkeypatch):
    from starlette.responses import Response

    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.setenv("COOKIE_SECURE", "false")
    response = Response()
    vercel_index._set_session_cookie(response, "signed-token")
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "Secure" in cookie
    assert "SameSite=lax" in cookie
    assert "Max-Age=43200" in cookie
