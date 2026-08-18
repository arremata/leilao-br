"""FastAPI endpoint for auction property analysis."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from pydantic import BaseModel
from dataclasses import asdict

from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from db.base import get_engine, init_db, make_session_factory
from db.models import (
    Property, Enrichment, RegionalMarketComparable, CityExpenseReference,
)
from enrichment.property_expenses import apply_property_expenses
from enrichment.market_coverage import queue_city_reference, resolve_market_reference
from enrichment.run import metadata_from_property, run_structured_enrichment, PIPELINE_VERSION
from ingestion.adapters.caixa_detail import fetch_detail
from ingestion.run import run_cli
from graph.state import ComparableProperty

class IngestRequest(BaseModel):
    source: str = "caixa"
    uf: str = "PR"
    file: Optional[str] = None


def _parse_ends_at(value) -> Optional["datetime"]:
    """Parse endsAt (ISO string or epoch ms) into a timezone-aware datetime."""
    from datetime import datetime, timezone
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    try:
        s = str(value).strip()
        # ISO 8601 — FastAPI/seed format. Accept trailing Z or offset.
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def _is_active(ends_at, now) -> bool:
    """A property is active when endsAt is missing or still in the future."""
    dt = _parse_ends_at(ends_at)
    return dt is None or dt > now


def _closing_within_24h(ends_at, now) -> bool:
    """Active and ending within the next 24 hours."""
    from datetime import timedelta
    dt = _parse_ends_at(ends_at)
    if dt is None:
        return False
    return now < dt <= now + timedelta(hours=24)


app = FastAPI(title="Leilao AI API")


@app.on_event("startup")
def _startup():
    engine = get_engine()
    init_db(engine)
    app.state.session_factory = make_session_factory(engine)


def get_session():
    factory = app.state.session_factory
    with factory() as session:
        yield session


def _card_title(p: Property) -> str:
    """Human-readable card title from ingested fields.

    Mirrors build_result's title shape ("{type} {area} m²") but keyed on the
    neighborhood we have at ingestion time; falls back to the raw address when
    the source gave us no property type.
    """
    if p.property_type:
        title = f"{p.property_type} {p.area_m2 or 0:.0f} m²"
        if p.neighborhood:
            title += f", {p.neighborhood}"
        return title
    return p.address or ""


def _catalog_auction_type(modalidade: str | None) -> str | None:
    """Classify only Caixa modalities with an unambiguous legal nature."""
    value = (modalidade or "").lower()
    if any(term in value for term in ("leilão sfi", "leilao sfi", "licitação aberta", "licitacao aberta", "venda direta")):
        return "Extrajudicial"
    return None


def _property_card(p: Property) -> dict:
    def _iso(value):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=ZoneInfo("America/Sao_Paulo"))
        return value.isoformat()

    auction_dates = [
        value for value in (p.first_auction_at, p.second_auction_at)
        if value is not None
    ]
    now = datetime.now(timezone.utc)
    comparable_dates = [
        value.replace(tzinfo=ZoneInfo("America/Sao_Paulo"))
        if value.tzinfo is None else value
        for value in auction_dates
    ]
    next_auction_at = next(
        (value for value in comparable_dates if value.astimezone(timezone.utc) >= now),
        comparable_dates[-1] if comparable_dates else None,
    )
    modalidade = p.modalidade or ""
    praca = None
    if "sfi" in modalidade.lower():
        first = p.first_auction_at
        if first is not None and first.tzinfo is None:
            first = first.replace(tzinfo=ZoneInfo("America/Sao_Paulo"))
        if first and first.astimezone(timezone.utc) >= now:
            praca = "1ª praça"
        elif p.second_auction_at is not None:
            praca = "2ª praça"
        elif p.first_auction_at is not None:
            praca = "1ª praça"

    return {
        "id": p.id,
        "sourceId": p.source_id,
        "source": p.source,
        "uf": p.uf,
        "city": p.city,
        "neighborhood": p.neighborhood,
        "address": p.address,
        "title": _card_title(p),
        "type": p.property_type,
        "area": p.area_m2,
        "beds": p.beds,
        "minBid": p.preco,
        "appraisal": p.avaliacao,
        "desconto": p.desconto_oficial,
        "auctionDiscount": p.desconto_oficial,
        "modalidade": p.modalidade,
        "auctionType": _catalog_auction_type(p.modalidade),
        "praca": praca,
        "firstAuctionAt": _iso(p.first_auction_at),
        "secondAuctionAt": _iso(p.second_auction_at),
        "firstAuctionPrice": p.first_auction_price,
        "secondAuctionPrice": p.second_auction_price,
        "endsAt": _iso(next_auction_at),
        "lat": p.lat,
        "lng": p.lng,
        "photoUrl": p.photo_url,
        "auctionUrl": p.detail_url,
        "detailUrl": p.detail_url,
        "status": p.status,
        "canAnalyze": True,
    }


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/properties")
def get_properties(session: Session = Depends(get_session)) -> list[dict]:
    """Compatibility alias backed by the real catalog, never fixture data."""
    props = session.execute(
        select(Property).where(Property.status == "active")
    ).scalars().all()
    return [_property_card(prop) for prop in props]


@app.get("/dashboard")
def get_dashboard(session: Session = Depends(get_session)) -> dict:
    from datetime import datetime, timezone

    properties = [
        _property_card(prop) for prop in session.execute(
            select(Property).where(Property.status == "active")
        ).scalars().all()
    ]
    # Active = endsAt in the future (or missing). Closed auctions don't count.
    now = datetime.now(timezone.utc)
    active = [
        p for p in properties
        if _is_active(p.get("endsAt"), now)
    ]
    active_count = len(active)
    closing_soon = sum(1 for p in active if _closing_within_24h(p.get("endsAt"), now))
    # Score field removed — use ROI average as the portfolio health KPI
    avg_roi = round(sum(p.get("roi", 0) for p in properties) / max(len(properties), 1))

    return {
        "kpis": [
            {"lbl": "Leilões ativos", "val": str(active_count), "delta": "no catálogo", "pos": True},
            {"lbl": "Encerrando em 24h", "val": str(closing_soon) if closing_soon > 0 else "—", "delta": "em breve"},
            {"lbl": "Análises restantes", "val": "3", "delta": "plano grátis"},
            {"lbl": "ROI médio · feed", "val": f"{avg_roi}%", "delta": "do portfólio", "pos": avg_roi >= 10},
        ],
        "activity": [],
    }


@app.get("/catalog")
def list_catalog(uf: Optional[str] = None, session: Session = Depends(get_session)) -> list[dict]:
    stmt = select(Property).where(Property.status == "active")
    if uf:
        stmt = stmt.where(Property.uf == uf.upper())
    props = session.execute(stmt).scalars().all()
    return [_property_card(p) for p in props]


@app.get("/catalog/{prop_id}")
def get_catalog_item(prop_id: int, session: Session = Depends(get_session)) -> dict:
    prop = session.get(Property, prop_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    card = _property_card(prop)
    enr = session.execute(
        select(Enrichment).where(Enrichment.property_id == prop_id)
    ).scalar_one_or_none()
    enrichment = json.loads(enr.result_json) if enr else None
    # Suppress invalid estimates stored by older pipeline versions. Those
    # multiplied a neighborhood R$/m² reference by the entire land area.
    from graph.market import is_land_property_type
    if enrichment and is_land_property_type(prop.property_type):
        enrichment.update(market=0.0, discount=0.0, roi=0.0, marketDetail=None)
    card["enrichment"] = enrichment
    return card


def _maybe_fetch_detail(prop: Property) -> None:
    """Lazily scrape the Caixa detail page once to fill photo_url.

    The CSV feed has no photo; the picture only exists on the per-property
    detail page. We scrape it on first analyze (best-effort): a failure leaves
    detail_fetched False so a later analyze retries.
    """
    import asyncio

    if prop.detail_fetched or not prop.detail_url:
        return
    try:
        detail = asyncio.run(fetch_detail(prop.detail_url))
    except Exception as e:
        logger.warning(f"Detail fetch failed for property {prop.id}: {e}")
        return
    if detail.get("photo_url"):
        prop.photo_url = detail["photo_url"]
    prop.detail_fetched = True


@app.post("/catalog/{prop_id}/analyze")
def analyze_catalog_item(prop_id: int, session: Session = Depends(get_session)) -> dict:
    prop = session.get(Property, prop_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    _maybe_fetch_detail(prop)
    session.flush()

    metadata = metadata_from_property(prop)
    regional = resolve_market_reference(session, prop)
    if regional is None:
        queue_city_reference(session, prop)
        session.commit()
        raise HTTPException(
            status_code=409,
            detail=(
                "Referência de mercado ainda indisponível. A coleta foi priorizada "
                "e normalmente fica disponível em até 90 minutos."
            ),
        )
    regional_comparables = []
    if regional:
        regional_comparables = [
            ComparableProperty(
                address=comp.address, price=comp.price, area_m2=comp.area_m2,
                price_per_m2=comp.price_per_m2, source=comp.source, url=comp.url,
            )
            for comp in session.execute(
                select(RegionalMarketComparable).where(
                    RegionalMarketComparable.reference_id.in_(regional.reference_ids),
                ).order_by(RegionalMarketComparable.price_per_m2)
            ).scalars().all()
        ]
    # Reuse the ingested description as the legal node's document text so it
    # analyzes real source data instead of running blind on empty input.
    result = run_structured_enrichment(
        metadata, pdf_texts=prop.descricao_raw or "", auction_url=prop.detail_url,
        regional_price_per_m2=regional.price_per_m2,
        regional_comparables=regional_comparables,
    )
    expense_reference = session.execute(select(CityExpenseReference).where(
        CityExpenseReference.uf == (prop.uf or "").upper(),
        func.lower(CityExpenseReference.city) == (prop.city or "").casefold(),
    )).scalar_one_or_none()
    apply_property_expenses(result, prop, expense_reference)
    result_json = result.model_dump_json(by_alias=True)

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    enr = session.execute(
        select(Enrichment).where(Enrichment.property_id == prop_id)
    ).scalar_one_or_none()
    if enr:
        enr.result_json = result_json
        enr.pipeline_version = PIPELINE_VERSION
        enr.computed_at = now
    else:
        session.add(Enrichment(
            property_id=prop_id, result_json=result_json,
            pipeline_version=PIPELINE_VERSION, computed_at=now,
        ))
    session.commit()
    return json.loads(result_json)


@app.post("/ingest")
def trigger_ingest(req: IngestRequest) -> dict:
    argv = ["--source", req.source, "--uf", req.uf]
    if req.file:
        argv += ["--file", req.file]
    summary = run_cli(argv, session_factory=app.state.session_factory)
    return asdict(summary)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
