"""SQLAlchemy engine/session helpers and declarative Base.

Schema is created via init_db() (create_all) — no Alembic in v1.
Production points DATABASE_URL at Postgres; tests use in-memory SQLite.
"""

from __future__ import annotations

import os

from sqlalchemy import create_engine, inspect, text
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
    # Hosting dashboards usually provide a driver-neutral URL. The project
    # installs psycopg v3, so select that SQLAlchemy dialect explicitly.
    if resolved.startswith("postgres://"):
        resolved = "postgresql+psycopg://" + resolved.removeprefix("postgres://")
    elif resolved.startswith("postgresql://"):
        resolved = "postgresql+psycopg://" + resolved.removeprefix("postgresql://")
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

    # v1 predates migrations and create_all() does not add columns to an
    # existing table. Keep this small compatibility migration here so deployed
    # SQLite/Postgres catalogs gain ingestion fields on next startup.
    existing = {column["name"] for column in inspect(engine).get_columns("properties")}
    date_columns = {
        "first_auction_at": "TIMESTAMP WITH TIME ZONE",
        "second_auction_at": "TIMESTAMP WITH TIME ZONE",
        "dates_fetched_at": "TIMESTAMP WITH TIME ZONE",
    }
    price_columns = {
        "first_auction_price": "DOUBLE PRECISION",
        "second_auction_price": "DOUBLE PRECISION",
    }
    document_columns = {
        "matricula": "VARCHAR(128)",
        "edital_url": "TEXT",
        "matricula_url": "TEXT",
    }
    with engine.begin() as connection:
        for name, postgres_type in date_columns.items():
            if name in existing:
                continue
            column_type = "DATETIME" if engine.dialect.name == "sqlite" else postgres_type
            connection.execute(text(
                f"ALTER TABLE properties ADD COLUMN {name} {column_type}"
            ))
        for name, postgres_type in price_columns.items():
            if name in existing:
                continue
            column_type = "FLOAT" if engine.dialect.name == "sqlite" else postgres_type
            connection.execute(text(
                f"ALTER TABLE properties ADD COLUMN {name} {column_type}"
            ))
        for name, column_type in document_columns.items():
            if name in existing:
                continue
            connection.execute(text(
                f"ALTER TABLE properties ADD COLUMN {name} {column_type}"
            ))


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)
