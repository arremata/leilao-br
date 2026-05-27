"""Lightweight Vercel API for the Arremate demo frontend.

The full AI pipeline depends on Playwright, OCR, PDF parsing, and LLM tooling,
which exceeds Vercel's Python function bundle limits. This service keeps the
public demo API online while the heavy analyzer remains a separate worker/API.
"""

from __future__ import annotations

import json
from pathlib import Path

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


@app.get("/properties")
def get_properties() -> list[dict]:
    return _load_properties()


@app.get("/dashboard")
def get_dashboard() -> dict:
    properties = _load_properties()
    count = len(properties)
    avg_score = round(sum(p.get("score", 0) for p in properties) / max(count, 1))

    return {
        "greeting": {
            "name": "Felipe",
            "subtitle": f"{count} imóveis analisados no seu portfólio.",
        },
        "kpis": [
            {"lbl": "Leilões ativos", "val": str(count), "delta": "seu portfólio", "pos": True},
            {"lbl": "Encerrando em 24h", "val": "—", "delta": "em breve"},
            {"lbl": "Análises restantes", "val": "3", "delta": "plano grátis"},
            {"lbl": "Score médio · feed", "val": str(avg_score), "delta": "do portfólio", "pos": avg_score >= 70},
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
