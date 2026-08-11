"""Canonical catalog models: Property, PropertyEvent, Enrichment."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    JSON, Float, ForeignKey, Integer, String, Text, UniqueConstraint, DateTime,
)
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Property(Base):
    __tablename__ = "properties"
    __table_args__ = (UniqueConstraint("source", "source_id", name="uq_source_source_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(32), index=True)
    source_id: Mapped[str] = mapped_column(String(64), index=True)

    uf: Mapped[Optional[str]] = mapped_column(String(2), index=True, default=None)
    city: Mapped[Optional[str]] = mapped_column(String(128), default=None)
    neighborhood: Mapped[Optional[str]] = mapped_column(String(128), default=None)
    address: Mapped[str] = mapped_column(Text, default="")

    lat: Mapped[Optional[float]] = mapped_column(Float, default=None)
    lng: Mapped[Optional[float]] = mapped_column(Float, default=None)
    geocode_status: Mapped[str] = mapped_column(String(16), default="pending")

    property_type: Mapped[Optional[str]] = mapped_column(String(64), default=None)
    area_m2: Mapped[Optional[float]] = mapped_column(Float, default=None)
    beds: Mapped[Optional[int]] = mapped_column(Integer, default=None)

    preco: Mapped[float] = mapped_column(Float, default=0.0)
    avaliacao: Mapped[Optional[float]] = mapped_column(Float, default=None)
    desconto_oficial: Mapped[Optional[float]] = mapped_column(Float, default=None)
    modalidade: Mapped[Optional[str]] = mapped_column(String(64), default=None)
    first_auction_price: Mapped[Optional[float]] = mapped_column(Float, default=None)
    second_auction_price: Mapped[Optional[float]] = mapped_column(Float, default=None)
    first_auction_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None
    )
    second_auction_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None
    )
    dates_fetched_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None
    )

    descricao_raw: Mapped[str] = mapped_column(Text, default="")
    detail_url: Mapped[str] = mapped_column(Text, default="")
    detail_fetched: Mapped[bool] = mapped_column(default=False)
    photo_url: Mapped[Optional[str]] = mapped_column(Text, default=None)

    status: Mapped[str] = mapped_column(String(16), default="active", index=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    raw_payload: Mapped[Optional[dict]] = mapped_column(JSON, default=None)


class PropertyEvent(Base):
    __tablename__ = "property_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(32))
    old_value: Mapped[Optional[str]] = mapped_column(Text, default=None)
    new_value: Mapped[Optional[str]] = mapped_column(Text, default=None)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Enrichment(Base):
    __tablename__ = "enrichments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), unique=True, index=True)
    result_json: Mapped[str] = mapped_column(Text)
    pipeline_version: Mapped[str] = mapped_column(String(16), default="v1")
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class RegionalMarketPrice(Base):
    """Cached neighborhood price/m² calculated from observed listings."""

    __tablename__ = "regional_market_prices"
    __table_args__ = (
        UniqueConstraint("uf", "city", "neighborhood", "property_type",
                         name="uq_regional_market_price"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    uf: Mapped[str] = mapped_column(String(2), index=True)
    city: Mapped[str] = mapped_column(String(128), index=True)
    neighborhood: Mapped[str] = mapped_column(String(128), index=True)
    property_type: Mapped[str] = mapped_column(String(64), default="")
    price_per_m2: Mapped[float] = mapped_column(Float)
    sample_size: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(64), default="listing_median")
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class RegionalMarketComparable(Base):
    """Listing snapshot used to calculate a regional market reference."""

    __tablename__ = "regional_market_comparables"
    __table_args__ = (
        UniqueConstraint("reference_id", "url", name="uq_market_comparable_url"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    reference_id: Mapped[int] = mapped_column(
        ForeignKey("regional_market_prices.id", ondelete="CASCADE"), index=True,
    )
    address: Mapped[str] = mapped_column(Text, default="")
    price: Mapped[float] = mapped_column(Float)
    area_m2: Mapped[float] = mapped_column(Float)
    price_per_m2: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(64))
    url: Mapped[str] = mapped_column(Text)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
