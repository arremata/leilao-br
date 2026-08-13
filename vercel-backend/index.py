"""Lightweight Vercel API for the Arremate demo frontend.

The full AI pipeline depends on Playwright, OCR, PDF parsing, and LLM tooling,
which exceeds Vercel's Python function bundle limits. This service keeps the
public demo API online while the heavy analyzer remains a separate worker/API.
"""

from __future__ import annotations

import json
import os
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool

SAO_PAULO = ZoneInfo("America/Sao_Paulo")
_engine = None

app = FastAPI(title="Arremate Demo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    url: str | None = None
    pdf_texts: str | None = None


def _is_land_property_type(property_type: str | None) -> bool:
    normalized = unicodedata.normalize("NFKD", property_type or "").encode("ascii", "ignore").decode()
    return bool(re.search(r"\b(terreno|lote|gleba)\b", normalized.lower()))


def _safe_enrichment(enrichment: str | None, property_type: str | None) -> dict | None:
    result = json.loads(enrichment) if enrichment else None
    if result and _is_land_property_type(property_type):
        result.update(market=0.0, discount=0.0, roi=0.0, marketDetail=None)
    return result


def _get_engine():
    """Return the cached Supabase engine without opening a connection eagerly."""
    global _engine
    if _engine is None:
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            raise HTTPException(status_code=503, detail="Catalog database is not configured")
        # Supabase supplies the pool; avoid retaining serverless client-side
        # connections between invocations.
        _engine = create_engine(database_url, poolclass=NullPool, pool_pre_ping=True)
    return _engine


def _iso(value) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        value = value.replace(tzinfo=SAO_PAULO)
    return value.isoformat()


def _catalog_card(row) -> dict:
    p = dict(row)
    auction_dates = [
        value for value in (p.get("first_auction_at"), p.get("second_auction_at"))
        if value is not None
    ]
    comparable_dates = [
        value.replace(tzinfo=SAO_PAULO) if value.tzinfo is None else value
        for value in auction_dates
    ]
    now = datetime.now(timezone.utc)
    next_auction = next(
        (value for value in comparable_dates if value.astimezone(timezone.utc) >= now),
        comparable_dates[-1] if comparable_dates else None,
    )
    modalidade = p.get("modalidade") or ""
    modalidade_normalized = modalidade.lower()
    auction_type = (
        "Extrajudicial"
        if any(term in modalidade_normalized for term in (
            "leilão sfi", "leilao sfi", "licitação aberta", "licitacao aberta", "venda direta",
        )) else None
    )
    praca = None
    if "sfi" in modalidade_normalized:
        first = p.get("first_auction_at")
        if first is not None and first.tzinfo is None:
            first = first.replace(tzinfo=SAO_PAULO)
        if first and first.astimezone(timezone.utc) >= now:
            praca = "1ª praça"
        elif p.get("second_auction_at") is not None:
            praca = "2ª praça"
        elif p.get("first_auction_at") is not None:
            praca = "1ª praça"
    property_type = p.get("property_type")
    if property_type:
        title = f"{property_type} {p.get('area_m2') or 0:.0f} m²"
        if p.get("neighborhood"):
            title += f", {p['neighborhood']}"
    else:
        title = p.get("address") or ""

    return {
        "id": p["id"],
        "sourceId": p.get("source_id"),
        "source": p.get("source"),
        "uf": p.get("uf"),
        "city": p.get("city"),
        "neighborhood": p.get("neighborhood"),
        "address": p.get("address"),
        "title": title,
        "type": property_type,
        "area": p.get("area_m2"),
        "beds": p.get("beds"),
        "minBid": p.get("preco"),
        "appraisal": p.get("avaliacao"),
        "desconto": p.get("desconto_oficial"),
        "auctionDiscount": p.get("desconto_oficial"),
        "modalidade": p.get("modalidade"),
        "auctionType": auction_type,
        "praca": praca,
        "firstAuctionAt": _iso(p.get("first_auction_at")),
        "secondAuctionAt": _iso(p.get("second_auction_at")),
        "firstAuctionPrice": p.get("first_auction_price"),
        "secondAuctionPrice": p.get("second_auction_price"),
        "endsAt": _iso(next_auction),
        "lat": p.get("lat"),
        "lng": p.get("lng"),
        "photoUrl": p.get("photo_url"),
        "auctionUrl": p.get("detail_url"),
        "status": p.get("status"),
        # Heavy analysis runs only on the dedicated FastAPI backend. Expose the
        # capability explicitly so the public Vercel UI never offers a broken
        # action.
        "canAnalyze": False,
    }


_CATALOG_COLUMNS = """
    id, source_id, source, uf, city, neighborhood, address, property_type,
    area_m2, beds, preco, avaliacao, desconto_oficial, modalidade,
    first_auction_at, second_auction_at, first_auction_price,
    second_auction_price, lat, lng, photo_url, detail_url, status
"""


def _parse_ends_at(value) -> Optional[datetime]:
    """Parse endsAt (ISO string or epoch ms) into a timezone-aware datetime."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    try:
        s = str(value).strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def _is_active(ends_at, now) -> bool:
    dt = _parse_ends_at(ends_at)
    return dt is None or dt > now


def _closing_within_24h(ends_at, now) -> bool:
    dt = _parse_ends_at(ends_at)
    if dt is None:
        return False
    return now < dt <= now + timedelta(hours=24)


@app.get("/properties")
def get_properties() -> list[dict]:
    """Compatibility alias backed by the production catalog."""
    return get_catalog()


@app.get("/catalog")
def get_catalog(uf: Optional[str] = None) -> list[dict]:
    query = f"SELECT {_CATALOG_COLUMNS} FROM properties WHERE status = 'active'"
    params = {}
    if uf:
        query += " AND uf = :uf"
        params["uf"] = uf.upper()
    query += " ORDER BY last_seen_at DESC, id DESC"
    try:
        with _get_engine().connect() as connection:
            rows = connection.execute(text(query), params).mappings().all()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Catalog database unavailable") from exc
    return [_catalog_card(row) for row in rows]


@app.get("/catalog/{property_id}")
def get_catalog_item(property_id: int) -> dict:
    query = f"SELECT {_CATALOG_COLUMNS} FROM properties WHERE id = :id"
    try:
        with _get_engine().connect() as connection:
            row = connection.execute(text(query), {"id": property_id}).mappings().one_or_none()
            if row is None:
                raise HTTPException(status_code=404, detail="Property not found")
            enrichment = connection.execute(
                text("SELECT result_json FROM enrichments WHERE property_id = :id"),
                {"id": property_id},
            ).scalar_one_or_none()
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Catalog database unavailable") from exc

    card = _catalog_card(row)
    card["enrichment"] = _safe_enrichment(enrichment, row["property_type"])
    return card


@app.get("/dashboard")
def get_dashboard() -> dict:
    properties = get_catalog()
    now = datetime.now(timezone.utc)
    active = [p for p in properties if _is_active(p.get("endsAt"), now)]
    active_count = len(active)
    closing_soon = sum(1 for p in active if _closing_within_24h(p.get("endsAt"), now))
    avg_discount = round(sum(p.get("discount", 0) for p in properties) / max(len(properties), 1))
    avg_auction_discount = round(sum(p.get("auctionDiscount", 0) for p in properties) / max(len(properties), 1))

    return {
        "kpis": [
            {"lbl": "Leilões ativos", "val": str(active_count), "delta": "no catálogo", "pos": True},
            {"lbl": "Encerrando em 24h", "val": str(closing_soon) if closing_soon > 0 else "—", "delta": "em breve"},
            {"lbl": "Desconto IA médio", "val": f"{avg_discount}%", "delta": "vs. mercado IA", "pos": avg_discount >= 15},
            {"lbl": "Desconto oficial médio", "val": f"{avg_auction_discount}%", "delta": "vs. avaliação do edital", "pos": False},
        ],
        "activity": [],
    }


@app.post("/analyze")
def analyze(_: AnalyzeRequest) -> dict:
    raise HTTPException(
        status_code=501,
        detail=(
            "A análise ao vivo usa Playwright, OCR, PDF parsing e LLMs, "
            "e precisa rodar em um backend dedicado fora da Vercel."
        ),
    )
