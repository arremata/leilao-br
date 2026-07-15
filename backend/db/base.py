"""SQLAlchemy engine/session helpers and declarative Base.

Schema is created via init_db() (create_all) — no Alembic in v1.
Production points DATABASE_URL at Postgres; tests use in-memory SQLite.
"""

from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

DEFAULT_DATABASE_URL = "sqlite:///./leilao.db"


class Base(DeclarativeBase):
    pass


def get_engine(url: str | None = None) -> Engine:
    """Create an Engine. Uses DATABASE_URL env var, or the passed url, or a
    local sqlite file. In-memory sqlite ('sqlite://') uses a StaticPool so a
    single shared connection survives across sessions (needed for tests)."""
    resolved = url or os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)
    if resolved in ("sqlite://", "sqlite:///:memory:"):
        return create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    return create_engine(resolved)


def init_db(engine: Engine) -> None:
    """Create all tables registered on Base.metadata."""
    # Import models so they register on Base.metadata before create_all.
    from db import models  # noqa: F401

    Base.metadata.create_all(engine)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)
