"""Contract tests for the vercel-backend auth module."""

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
    """Return a live SQLite connection with the schema pre-created.

    Returns a generator that yields exactly one open connection. Callers use
    ``next(_fresh_conn())``; the generator object is intentionally leaked so
    the connection stays open for the duration of the test (Python reclaims
    both when the test process moves on).
    """
    def _gen():
        engine = create_engine("sqlite://")
        conn = engine.connect()
        conn = conn.execution_options(isolation_level="AUTOCOMMIT")
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
        conn.close()
        engine.dispose()
    gen = _gen()
    conn = next(gen)
    # Attach the generator to the connection so it isn't GC'd (which would
    # close the connection mid-test via the `finally`-equivalent cleanup).
    conn._argos_schema_gen = gen  # type: ignore[attr-defined]
    return iter([conn])


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
        {"id": 20, "snapshot": {"title": "t"}},
        {"id": 20, "snapshot": {"title": "t2"}},
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
