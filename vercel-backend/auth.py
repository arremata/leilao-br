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
