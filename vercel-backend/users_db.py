"""Raw-SQL user persistence for the Argos session flow."""

from __future__ import annotations

import json
from typing import Iterable

from sqlalchemy import text


def upsert_user(conn, profile: dict) -> dict:
    row = conn.execute(
        text(
            """
            INSERT INTO users (google_sub, email, name, avatar_url, last_login_at)
            VALUES (:sub, :email, :name, :avatar, CURRENT_TIMESTAMP)
            ON CONFLICT (google_sub) DO UPDATE SET
              email = EXCLUDED.email,
              name = EXCLUDED.name,
              avatar_url = EXCLUDED.avatar_url,
              last_login_at = CURRENT_TIMESTAMP
            RETURNING id, email, name, avatar_url
            """
        ),
        {
            "sub": profile["google_sub"],
            "email": profile["email"],
            "name": profile.get("name"),
            "avatar": profile.get("avatar_url"),
        },
    ).mappings().one()
    return dict(row)


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
