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
    return conn


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
    yield TestClient(vercel_index.app)


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
        lambda conn, profile: {
            "id": 7, "email": profile["email"], "name": profile.get("name"),
            "avatar_url": profile.get("avatar_url"),
        },
    )
    monkeypatch.setattr(vercel_index, "_get_engine", lambda: _fake_engine_with(_capture_conn()))

    res = client.post("/api/auth/google", json={"credential": "tok"})

    assert res.status_code == 200
    body = res.json()
    assert body["user"]["email"] == "e@x.com"
    assert body["token"]
    decoded = vercel_index.auth_module.verify_session_token(
        body["token"], secret="s" * 32,
    )
    assert decoded["sub"] == "7"


def test_auth_google_rejects_bad_credential(client, monkeypatch):
    def boom(*_a, **_kw):
        raise vercel_index.auth_module.AuthError("bad")
    monkeypatch.setattr(vercel_index.auth_module, "verify_google_credential", boom)
    monkeypatch.setattr(vercel_index, "_get_engine", lambda: _fake_engine_with(_capture_conn()))

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

    res = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["email"] == "a@b.com"
    assert body["user"]["housing_profile"]["city"] == "Curitiba"
    assert body["saved"] == [1, 2]
    assert body["viewed"][0]["property_id"] == 5


def test_update_housing_profile_requires_auth_and_returns_account(client, monkeypatch):
    payload = {"city": " Curitiba ", "property_type": "Apartamento", "budget": "400000"}
    assert client.put("/api/me/housing-profile", json=payload).status_code == 401

    user = {"id": 12, "email": "a@b.com", "name": "A", "avatar_url": None}
    token = vercel_index.auth_module.issue_session_token(
        user, secret="s" * 32, ttl_days=30,
    )
    captured = {}

    def save(_conn, user_id, profile):
        captured.update({"user_id": user_id, "profile": profile})
        return {**user, "housing_profile": profile}

    monkeypatch.setattr(vercel_index.users_db_module, "set_housing_profile", save)
    monkeypatch.setattr(vercel_index, "_get_engine", lambda: _fake_engine_with(_capture_conn()))

    res = client.put(
        "/api/me/housing-profile",
        headers={"Authorization": f"Bearer {token}"},
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
        headers={"Authorization": f"Bearer {token}"},
        json={"city": "São Paulo", "property_type": "Casa", "budget": "above-1000000"},
    )
    assert res.status_code == 200
    assert captured["profile"]["budget"] == "above-1000000"


def test_update_housing_profile_respects_preview_write_guard(client, monkeypatch):
    user = {"id": 12, "email": "a@b.com", "name": "A", "avatar_url": None}
    token = vercel_index.auth_module.issue_session_token(
        user, secret="s" * 32, ttl_days=30,
    )
    monkeypatch.setenv("VERCEL_ENV", "preview")
    monkeypatch.delenv("ARREMATE_PREVIEW_ALLOW_WRITES", raising=False)

    res = client.put(
        "/api/me/housing-profile",
        headers={"Authorization": f"Bearer {token}"},
        json={"city": "Curitiba", "property_type": "Casa", "budget": None},
    )
    assert res.status_code == 403
