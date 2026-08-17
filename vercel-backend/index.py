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
from statistics import median
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool

PIPELINE_VERSION = "v3-no-land"

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


def _build_persisted_enrichment(row, reference, comparable_rows) -> dict:
    """Build the public result without importing the worker/LLM package."""
    p = dict(row)
    area = float(p.get("area_m2") or 0)
    min_bid = float(p.get("preco") or 0)
    appraisal = float(p.get("avaliacao") or min_bid)
    is_land = _is_land_property_type(p.get("property_type"))
    usable = [dict(item) for item in comparable_rows if (
        float(item["price"] or 0) > 0 and float(item["area_m2"] or 0) > 0
        and float(item["price_per_m2"] or 0) > 0
        and (area <= 0 or area * 0.65 <= float(item["area_m2"]) <= area * 1.35)
        and not any(term in f'{item["address"]} {item["url"]}'.lower() for term in ("leilao", "leilão", "hasta"))
    )]
    prices = [float(item["price_per_m2"]) for item in usable]
    price_per_m2 = 0 if is_land else float(median(prices) if prices else reference["price_per_m2"])
    market = round(price_per_m2 * area, 2)
    discount = round((market - min_bid) / market * 100, 2) if market > 0 else 0
    itbi_rate = {("PR", "CURITIBA"): 0.027, ("PR", "LONDRINA"): 0.02}.get(
        ((p.get("uf") or "").upper(), (p.get("city") or "").upper())
    )
    fee_rate = itbi_rate or 0
    roi = round((market - min_bid * (1 + fee_rate)) / (min_bid * (1 + fee_rate)) * 100, 2) if min_bid else 0
    market_detail = None if is_land else {
        "indicators": ([{
            "lbl": f"Preço/m² · {'bairro' if reference.get('scope') == 'neighborhood' else 'cidade'}",
            "val": f"R$ {price_per_m2:,.0f}".replace(",", "."),
            "delta": "mediana das referências persistidas", "pos": True,
        }] if price_per_m2 else []),
        "comparables": [{
            "address": item["address"], "areaM2": item["area_m2"], "beds": None,
            "pricePerM2": item["price_per_m2"], "salePrice": item["price"],
            "source": item["source"], "url": item["url"],
        } for item in usable],
    }
    costs = [{
        "label": "Lance de arremate", "value": min_bid,
        "hint": "Valor declarado como mínimo no edital.", "kind": "price",
    }]
    if itbi_rate is not None:
        costs.append({
            "label": f"ITBI · {p.get('city') or ''} ({itbi_rate * 100:g}%)",
            "value": round(min_bid * itbi_rate), "hint": "Alíquota municipal cadastrada.", "kind": "tax",
        })
    costs.extend([
        {"label": "Reforma estimada", "value": 0, "hint": "Calculada no simulador por área e faixa regional.", "kind": "reno"},
        {"label": "Imposto sobre ganho de capital", "value": 0, "hint": "Calculado conforme o cenário de venda.", "kind": "tax"},
    ])
    property_type = p.get("property_type") or ""
    neighborhood = p.get("neighborhood") or ""
    return {
        "id": str(p["id"]), "photoLabel": f"{property_type.upper()} · {neighborhood.upper()} · {p.get('uf') or ''}",
        "title": f"{property_type} {area:.0f} m², {neighborhood}", "address": p.get("address") or "",
        "type": property_type, "neighborhood": neighborhood,
        "city": f"{p.get('city') or ''}, {p.get('uf') or ''}", "auctionType": "Extrajudicial",
        "praca": None, "modalidade": p.get("modalidade"), "auctioneer": "—", "court": "—",
        "discount": discount, "minBid": min_bid, "market": market, "roi": roi,
        "appraisal": appraisal,
        "auctionDiscount": round((appraisal - min_bid) / appraisal * 100, 2) if appraisal else 0,
        "area": area, "beds": p.get("beds"), "endsAt": "", "risk": {"j": "bad", "f": "good"},
        "viability": {"riskDimensions": [], "alerts": [], "description": "", "features": {}},
        "marketDetail": market_detail, "costs": costs, "edital": None,
        "auctionUrl": p.get("detail_url"), "photoUrl": p.get("photo_url"),
        "monthlyCondo": None, "monthlyIptu": None,
    }


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
        "canAnalyze": True,
    }

_CATALOG_COLUMNS = """
    id, source_id, source, uf, city, neighborhood, address, property_type,
    area_m2, beds, preco, avaliacao, desconto_oficial, modalidade,
    first_auction_at, second_auction_at, first_auction_price,
    second_auction_price, lat, lng, photo_url, detail_url, status, descricao_raw
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


@app.post("/catalog/{property_id}/analyze")
def analyze_catalog_item(property_id: int) -> dict:
    """Build and persist an analysis using only the cached regional reference."""
    property_query = f"SELECT {_CATALOG_COLUMNS} FROM properties WHERE id = :id"
    reference_query = """
        SELECT id, neighborhood, price_per_m2
        FROM regional_market_prices
        WHERE uf = :uf AND city = :city AND property_type = :property_type
          AND price_per_m2 > 0
    """
    try:
        with _get_engine().begin() as connection:
            row = connection.execute(text(property_query), {"id": property_id}).mappings().one_or_none()
            if row is None:
                raise HTTPException(status_code=404, detail="Property not found")

            is_land = _is_land_property_type(row["property_type"])
            references = connection.execute(text(reference_query), {
                "uf": row["uf"] or "", "city": row["city"] or "",
                "property_type": row["property_type"] or "",
            }).mappings().all()
            wanted_neighborhood = (row["neighborhood"] or "").strip().casefold()
            exact = next((item for item in references if (
                item["neighborhood"] or ""
            ).strip().casefold() == wanted_neighborhood), None)
            if exact:
                reference = {**dict(exact), "scope": "neighborhood"}
            elif references:
                reference = {
                    "id": None, "scope": "city",
                    "price_per_m2": float(median(item["price_per_m2"] for item in references)),
                }
            else:
                reference = None
            if not is_land and reference is None:
                raise HTTPException(
                    status_code=422,
                    detail="Não há referência de mercado persistida para esta cidade e tipo de imóvel.",
                )

            comparables = []
            if reference is not None:
                if reference["scope"] == "neighborhood":
                    comparable_query = """
                        SELECT address, price, area_m2, price_per_m2, source, url
                        FROM regional_market_comparables
                        WHERE reference_id = :reference_id ORDER BY price_per_m2
                    """
                    comparable_params = {"reference_id": reference["id"]}
                else:
                    comparable_query = """
                        SELECT c.address, c.price, c.area_m2, c.price_per_m2, c.source, c.url
                        FROM regional_market_comparables c
                        JOIN regional_market_prices r ON r.id = c.reference_id
                        WHERE r.uf = :uf AND r.city = :city AND r.property_type = :property_type
                        ORDER BY c.price_per_m2
                    """
                    comparable_params = {
                        "uf": row["uf"] or "", "city": row["city"] or "",
                        "property_type": row["property_type"] or "",
                    }
                comparables = connection.execute(text(comparable_query), comparable_params).mappings().all()
            result_json = json.dumps(
                _build_persisted_enrichment(row, reference or {"price_per_m2": 0}, comparables),
                ensure_ascii=False,
            )
            connection.execute(text("""
                INSERT INTO enrichments (property_id, result_json, pipeline_version, computed_at)
                VALUES (:property_id, :result_json, :pipeline_version, :computed_at)
                ON CONFLICT (property_id) DO UPDATE SET
                    result_json = EXCLUDED.result_json,
                    pipeline_version = EXCLUDED.pipeline_version,
                    computed_at = EXCLUDED.computed_at
            """), {
                "property_id": property_id, "result_json": result_json,
                "pipeline_version": PIPELINE_VERSION, "computed_at": datetime.now(timezone.utc),
            })
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Catalog database unavailable") from exc

    return _safe_enrichment(result_json, row["property_type"])


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
