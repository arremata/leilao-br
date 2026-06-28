"""Lightweight Vercel API for the Arremate demo frontend.

The full AI pipeline depends on Playwright, OCR, PDF parsing, and LLM tooling,
which exceeds Vercel's Python function bundle limits. This service keeps the
public demo API online while the heavy analyzer remains a separate worker/API.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

SEED_FILE = Path(__file__).with_name("seed.json")

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


def _load_properties() -> list[dict]:
    if not SEED_FILE.exists():
        return []
    return json.loads(SEED_FILE.read_text(encoding="utf-8"))


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
    return _load_properties()


@app.get("/dashboard")
def get_dashboard() -> dict:
    properties = _load_properties()
    now = datetime.now(timezone.utc)
    active = [p for p in properties if _is_active(p.get("endsAt"), now)]
    active_count = len(active)
    closing_soon = sum(1 for p in active if _closing_within_24h(p.get("endsAt"), now))
    avg_discount = round(sum(p.get("discount", 0) for p in properties) / max(len(properties), 1))
    avg_auction_discount = round(sum(p.get("auctionDiscount", 0) for p in properties) / max(len(properties), 1))

    return {
        "greeting": {
            "name": "Felipe",
            "subtitle": f"{len(properties)} imóveis analisados no seu portfólio.",
        },
        "kpis": [
            {"lbl": "Leilões ativos", "val": str(active_count), "delta": "seu portfólio", "pos": True},
            {"lbl": "Encerrando em 24h", "val": str(closing_soon) if closing_soon > 0 else "—", "delta": "em breve"},
            {"lbl": "Desconto IA médio", "val": f"{avg_discount}%", "delta": "vs. mercado IA", "pos": avg_discount >= 15},
            {"lbl": "Desconto oficial médio", "val": f"{avg_auction_discount}%", "delta": "vs. avaliação do edital", "pos": False},
        ],
        "citySignals": [
            {"city": "São Paulo / SP", "volume": "412", "delta": "+8.2%", "trend": [8.4, 8.5, 8.6, 8.7, 8.8, 9.0, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7], "pos": True},
            {"city": "Rio de Janeiro / RJ", "volume": "218", "delta": "−2.1%", "trend": [11, 10.9, 10.8, 10.9, 10.7, 10.6, 10.5, 10.5, 10.4, 10.3, 10.4, 10.3], "pos": False},
            {"city": "Belo Horizonte / MG", "volume": "134", "delta": "+3.7%", "trend": [6.2, 6.3, 6.4, 6.4, 6.5, 6.6, 6.6, 6.7, 6.7, 6.8, 6.8, 6.9], "pos": True},
            {"city": "Curitiba / PR", "volume": "96", "delta": "+1.4%", "trend": [7.4, 7.4, 7.5, 7.4, 7.5, 7.5, 7.6, 7.6, 7.6, 7.7, 7.7, 7.8], "pos": True},
            {"city": "Porto Alegre / RS", "volume": "78", "delta": "−0.4%", "trend": [6.8, 6.8, 6.7, 6.7, 6.8, 6.7, 6.7, 6.6, 6.7, 6.7, 6.6, 6.7], "pos": False},
        ],
        "activity": [
            {"time": "há 2h", "type": "price", "title": "Apto. 78 m², Vila Madalena", "text": "Lance mínimo reduzido em R$ 18.000 — agora R$ 312.000 (2ª praça)", "tone": "good"},
            {"time": "há 5h", "type": "risk", "title": "Casa 220 m², Ipanema", "text": "Novo processo detectado: ação anulatória em curso (1ª instância)", "tone": "bad"},
            {"time": "ontem", "type": "closing", "title": "Apto. 110 m², Savassi", "text": "Leilão encerra em 6h22 — você ainda não decidiu", "tone": "warn"},
            {"time": "ontem", "type": "new", "title": "3 novos imóveis match com seu perfil", "text": "Itaim Bibi, Pinheiros e Vila Olímpia — score médio 84", "tone": "neutral"},
            {"time": "2 dias", "type": "legal", "title": "Sala 64 m², Faria Lima", "text": "Pesquisa jurídica completa entregue — 0 ressalvas", "tone": "good"},
        ],
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
