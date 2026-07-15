"""FastAPI endpoint for auction property analysis."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from pydantic import BaseModel
from dataclasses import asdict

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.base import get_engine, init_db, make_session_factory
from db.models import Property, Enrichment
from enrichment.run import metadata_from_property, run_structured_enrichment, PIPELINE_VERSION
from ingestion.run import run_cli

DATA_DIR = Path(__file__).parent / "data"
RESULTS_FILE = DATA_DIR / "results.json"
SEED_FILE = Path(__file__).parent / "data" / "seed.json"


class AnalyzeRequest(BaseModel):
    url: Optional[str] = None
    pdf_texts: Optional[str] = None


class IngestRequest(BaseModel):
    source: str = "caixa"
    uf: str = "PR"
    file: Optional[str] = None


def _load_results() -> list[dict]:
    results = []
    if RESULTS_FILE.exists():
        results = json.loads(RESULTS_FILE.read_text(encoding="utf-8"))

    if SEED_FILE.exists():
        existing_ids = {r.get("id") for r in results}
        seed_data = json.loads(SEED_FILE.read_text(encoding="utf-8"))
        results.extend(s for s in seed_data if s.get("id") not in existing_ids)

    return results


def _save_results(results: list[dict]) -> None:
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        RESULTS_FILE.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError as e:
        logger.warning(f"Skipping JSON persistence: {e}")


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


def _merge_seed() -> None:
    """Merge seed data into results.json, adding any missing entries by id."""
    if RESULTS_FILE.exists():
        _save_results(_load_results())


app = FastAPI(title="Leilao AI API")


@app.on_event("startup")
def _startup():
    _merge_seed()
    engine = get_engine()
    init_db(engine)
    app.state.session_factory = make_session_factory(engine)


def get_session():
    factory = app.state.session_factory
    with factory() as session:
        yield session


def _property_card(p: Property) -> dict:
    return {
        "id": p.id,
        "sourceId": p.source_id,
        "source": p.source,
        "uf": p.uf,
        "city": p.city,
        "neighborhood": p.neighborhood,
        "address": p.address,
        "type": p.property_type,
        "area": p.area_m2,
        "beds": p.beds,
        "minBid": p.preco,
        "appraisal": p.avaliacao,
        "desconto": p.desconto_oficial,
        "modalidade": p.modalidade,
        "lat": p.lat,
        "lng": p.lng,
        "photoUrl": p.photo_url,
        "detailUrl": p.detail_url,
        "status": p.status,
    }


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/properties")
def get_properties() -> list[dict]:
    return _load_results()


@app.get("/dashboard")
def get_dashboard() -> dict:
    from datetime import datetime, timezone

    properties = _load_results()
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
        "greeting": {
            "name": "Felipe",
            "subtitle": f"{len(properties)} imóveis analisados no seu portfólio.",
        },
        "kpis": [
            {"lbl": "Leilões ativos", "val": str(active_count), "delta": "seu portfólio", "pos": True},
            {"lbl": "Encerrando em 24h", "val": str(closing_soon) if closing_soon > 0 else "—", "delta": "em breve"},
            {"lbl": "Análises restantes", "val": "3", "delta": "plano grátis"},
            {"lbl": "ROI médio · feed", "val": f"{avg_roi}%", "delta": "do portfólio", "pos": avg_roi >= 10},
        ],
        "citySignals": [
            {"city": "São Paulo / SP", "volume": "412", "delta": "+8.2%", "trend": [8.4, 8.5, 8.6, 8.7, 8.8, 9.0, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7], "pos": True},
            {"city": "Rio de Janeiro / RJ", "volume": "218", "delta": "\u22122.1%", "trend": [11, 10.9, 10.8, 10.9, 10.7, 10.6, 10.5, 10.5, 10.4, 10.3, 10.4, 10.3], "pos": False},
            {"city": "Belo Horizonte / MG", "volume": "134", "delta": "+3.7%", "trend": [6.2, 6.3, 6.4, 6.4, 6.5, 6.6, 6.6, 6.7, 6.7, 6.8, 6.8, 6.9], "pos": True},
            {"city": "Curitiba / PR", "volume": "96", "delta": "+1.4%", "trend": [7.4, 7.4, 7.5, 7.4, 7.5, 7.5, 7.6, 7.6, 7.6, 7.7, 7.7, 7.8], "pos": True},
            {"city": "Porto Alegre / RS", "volume": "78", "delta": "\u22120.4%", "trend": [6.8, 6.8, 6.7, 6.7, 6.8, 6.7, 6.7, 6.6, 6.7, 6.7, 6.6, 6.7], "pos": False},
        ],
        "activity": [
            {"time": "há 2h", "type": "price", "title": "Apto. 78 m², Vila Madalena", "text": "Lance mínimo reduzido em R$ 18.000 — agora R$ 312.000 (2ª praça)", "tone": "good"},
            {"time": "há 5h", "type": "risk", "title": "Casa 220 m², Ipanema", "text": "Novo processo detectado: ação anulatória em curso (1ª instância)", "tone": "bad"},
            {"time": "ontem", "type": "closing", "title": "Apto. 110 m², Savassi", "text": "Leilão encerra em 6h22 — você ainda não decidiu", "tone": "warn"},
            {"time": "ontem", "type": "new", "title": "3 novos imóveis match com seu perfil", "text": "Itaim Bibi, Pinheiros e Vila Olímpia — ROI médio 18%", "tone": "neutral"},
            {"time": "2 dias", "type": "legal", "title": "Sala 64 m², Faria Lima", "text": "Pesquisa jurídica completa entregue — 0 ressalvas", "tone": "good"},
        ],
    }


@app.post("/analyze")
def analyze(req: AnalyzeRequest) -> dict:
    if not req.url and not req.pdf_texts:
        raise HTTPException(status_code=400, detail="Provide either 'url' or 'pdf_texts'.")

    try:
        from graph.state import AuctionState
        from graph.workflow import run_analysis

        if req.url:
            initial_state = AuctionState(auction_url=req.url.strip())
        else:
            initial_state = AuctionState(pdf_texts=req.pdf_texts)

        result = run_analysis(initial_state)

        result_json = (
            result.get("result_json", "")
            if isinstance(result, dict)
            else getattr(result, "result_json", "")
        )

        if not result_json:
            raise HTTPException(status_code=500, detail="Analysis completed but no result was generated.")

        result_data = json.loads(result_json)

        # Persist: prepend if new id, update if existing
        results = _load_results()
        existing_ids = {r.get("id") for r in results}
        if result_data.get("id") in existing_ids:
            results = [result_data if r.get("id") == result_data["id"] else r for r in results]
        else:
            results.insert(0, result_data)
        _save_results(results)

        return result_data

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"Analysis failed: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")


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
    card["enrichment"] = json.loads(enr.result_json) if enr else None
    return card


@app.post("/catalog/{prop_id}/analyze")
def analyze_catalog_item(prop_id: int, session: Session = Depends(get_session)) -> dict:
    prop = session.get(Property, prop_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    metadata = metadata_from_property(prop)
    result = run_structured_enrichment(metadata, auction_url=prop.detail_url)
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
