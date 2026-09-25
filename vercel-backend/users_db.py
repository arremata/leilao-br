"""Raw-SQL user persistence for the Argos session flow."""

from __future__ import annotations

from datetime import datetime, timezone
import json
from typing import Iterable

from sqlalchemy import text


def _user_dict(row) -> dict:
    user = dict(row)
    profile = user.get("housing_profile")
    if isinstance(profile, str):
        profile = json.loads(profile)
    user["housing_profile"] = profile if isinstance(profile, dict) else None
    return user


def upsert_user(conn, profile: dict, *, login_at: datetime | None = None) -> dict:
    login_at = login_at or datetime.now(timezone.utc)
    row = conn.execute(
        text(
            """
            INSERT INTO users (google_sub, email, name, avatar_url, last_login_at)
            VALUES (:sub, :email, :name, :avatar, :login_at)
            ON CONFLICT (google_sub) DO UPDATE SET
              email = EXCLUDED.email,
              name = EXCLUDED.name,
              avatar_url = EXCLUDED.avatar_url,
              last_login_at = EXCLUDED.last_login_at
            RETURNING id, email, name, avatar_url, housing_profile
            """
        ),
        {
            "sub": profile["google_sub"],
            "email": profile["email"],
            "name": profile.get("name"),
            "avatar": profile.get("avatar_url"),
            "login_at": login_at,
        },
    ).mappings().one()
    return _user_dict(row)


def create_session(
    conn,
    user_id: int,
    session_id: str,
    expires_at: datetime,
    *,
    created_at: datetime | None = None,
) -> None:
    created_at = created_at or datetime.now(timezone.utc)
    conn.execute(
        text("DELETE FROM user_sessions WHERE user_id = :u AND expires_at <= :now"),
        {"u": user_id, "now": created_at},
    )
    conn.execute(
        text(
            "INSERT INTO user_sessions (id, user_id, created_at, expires_at)"
            " VALUES (:id, :u, :created_at, :expires_at)"
        ),
        {
            "id": session_id,
            "u": user_id,
            "created_at": created_at,
            "expires_at": expires_at,
        },
    )


def session_is_active(
    conn,
    user_id: int,
    session_id: str,
    *,
    now: datetime | None = None,
) -> bool:
    now = now or datetime.now(timezone.utc)
    value = conn.execute(
        text(
            "SELECT 1 FROM user_sessions"
            " WHERE id = :id AND user_id = :u"
            " AND revoked_at IS NULL AND expires_at > :now"
        ),
        {"id": session_id, "u": user_id, "now": now},
    ).scalar_one_or_none()
    return value == 1


def revoke_session(
    conn,
    user_id: int,
    session_id: str,
    *,
    revoked_at: datetime | None = None,
) -> None:
    revoked_at = revoked_at or datetime.now(timezone.utc)
    conn.execute(
        text(
            "UPDATE user_sessions SET revoked_at = :revoked_at"
            " WHERE id = :id AND user_id = :u AND revoked_at IS NULL"
        ),
        {"id": session_id, "u": user_id, "revoked_at": revoked_at},
    )


def get_user(conn, user_id: int) -> dict | None:
    row = conn.execute(
        text(
            "SELECT id, email, name, avatar_url, housing_profile"
            " FROM users WHERE id = :u"
        ),
        {"u": user_id},
    ).mappings().one_or_none()
    return _user_dict(row) if row else None


def set_housing_profile(conn, user_id: int, profile: dict) -> dict:
    profile_json = json.dumps(profile)
    if conn.dialect.name == "postgresql":
        statement = text(
            "UPDATE users SET housing_profile = CAST(:profile AS JSONB) WHERE id = :u"
        )
    else:
        statement = text(
            "UPDATE users SET housing_profile = :profile WHERE id = :u"
        )
    result = conn.execute(statement, {"u": user_id, "profile": profile_json})
    if result.rowcount != 1:
        raise ValueError("Usuário não encontrado")
    return get_user(conn, user_id)


def get_saved_ids(conn, user_id: int) -> list[int]:
    rows = conn.execute(
        text(
            "SELECT property_id FROM user_saved_properties"
            " WHERE user_id = :u ORDER BY saved_at, property_id"
        ),
        {"u": user_id},
    ).all()
    return [r[0] for r in rows]


def get_viewed(conn, user_id: int) -> list[dict]:
    rows = conn.execute(
        text(
            "SELECT property_id, snapshot, viewed_at FROM user_viewed_properties"
            " WHERE user_id = :u ORDER BY viewed_at DESC, property_id DESC"
        ),
        {"u": user_id},
    ).mappings().all()
    out = []
    for r in rows:
        snapshot = r["snapshot"]
        if isinstance(snapshot, str):
            snapshot = json.loads(snapshot)
        out.append({
            "property_id": r["property_id"],
            "snapshot": snapshot,
            "viewed_at": r["viewed_at"],
        })
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
            text(
                "DELETE FROM user_saved_properties"
                " WHERE user_id = :u AND property_id = :p"
            ),
            {"u": user_id, "p": property_id},
        )


def sync_saved(conn, user_id: int, property_ids: Iterable[int]) -> None:
    ids = [int(p) for p in dict.fromkeys(property_ids)]
    if not ids:
        return
    conn.execute(
        text(
            "INSERT INTO user_saved_properties (user_id, property_id)"
            " VALUES (:u, :p) ON CONFLICT (user_id, property_id) DO NOTHING"
        ),
        [{"u": user_id, "p": pid} for pid in ids],
    )


def sync_viewed(conn, user_id: int, entries: Iterable[dict]) -> None:
    for entry in entries:
        _upsert_viewed(conn, user_id, int(entry["id"]), entry["snapshot"])


def clear_viewed(conn, user_id: int) -> None:
    conn.execute(
        text("DELETE FROM user_viewed_properties WHERE user_id = :u"),
        {"u": user_id},
    )


def get_step_progress(conn, user_id: int, property_id: int) -> list[str]:
    value = conn.execute(
        text(
            "SELECT completed_steps FROM user_property_progress"
            " WHERE user_id = :u AND property_id = :p"
        ),
        {"u": user_id, "p": property_id},
    ).scalar_one_or_none()
    if isinstance(value, str):
        value = json.loads(value)
    return [str(step) for step in value] if isinstance(value, list) else []


def set_step_progress(
    conn, user_id: int, property_id: int, completed: Iterable[str],
) -> list[str]:
    steps = sorted(dict.fromkeys(str(step) for step in completed))
    if not steps:
        # No completed step is the same as never having started this guide.
        conn.execute(
            text(
                "DELETE FROM user_property_progress"
                " WHERE user_id = :u AND property_id = :p"
            ),
            {"u": user_id, "p": property_id},
        )
        return []
    steps_json = json.dumps(steps)
    if conn.dialect.name == "postgresql":
        statement = text(
            """
            INSERT INTO user_property_progress (user_id, property_id, completed_steps)
            VALUES (:u, :p, CAST(:s AS JSONB))
            ON CONFLICT (user_id, property_id) DO UPDATE SET
              completed_steps = CAST(:s AS JSONB), updated_at = CURRENT_TIMESTAMP
            """
        )
    else:
        statement = text(
            """
            INSERT INTO user_property_progress (user_id, property_id, completed_steps)
            VALUES (:u, :p, :s)
            ON CONFLICT (user_id, property_id) DO UPDATE SET
              completed_steps = :s, updated_at = CURRENT_TIMESTAMP
            """
        )
    conn.execute(statement, {"u": user_id, "p": property_id, "s": steps_json})
    return steps


def _upsert_viewed(conn, user_id: int, property_id: int, snapshot: dict) -> None:
    snapshot_json = json.dumps(snapshot)
    if conn.dialect.name == "postgresql":
        statement = text(
            """
            INSERT INTO user_viewed_properties (user_id, property_id, snapshot)
            VALUES (:u, :p, CAST(:s AS JSONB))
            ON CONFLICT (user_id, property_id) DO UPDATE SET
              viewed_at = CURRENT_TIMESTAMP, snapshot = CAST(:s AS JSONB)
            """
        )
    else:
        statement = text(
            """
            INSERT INTO user_viewed_properties (user_id, property_id, snapshot)
            VALUES (:u, :p, :s)
            ON CONFLICT (user_id, property_id) DO UPDATE SET
              viewed_at = CURRENT_TIMESTAMP, snapshot = :s
            """
        )
    conn.execute(statement, {"u": user_id, "p": property_id, "s": snapshot_json})
