"""FastAPI endpoint for auction property analysis."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from pydantic import BaseModel

DATA_DIR = Path(__file__).parent / "data"
RESULTS_FILE = DATA_DIR / "results.json"
SEED_FILE = Path(__file__).parent / "data" / "seed.json"


class AnalyzeRequest(BaseModel):
    url: Optional[str] = None
    pdf_texts: Optional[str] = None


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


def _merge_seed() -> None:
    """Merge seed data into results.json, adding any missing entries by id."""
    if RESULTS_FILE.exists():
        _save_results(_load_results())


app = FastAPI(title="Leilao AI API")


@app.on_event("startup")
def _startup():
    _merge_seed()

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
    properties = _load_results()
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
            {"city": "Rio de Janeiro / RJ", "volume": "218", "delta": "\u22122.1%", "trend": [11, 10.9, 10.8, 10.9, 10.7, 10.6, 10.5, 10.5, 10.4, 10.3, 10.4, 10.3], "pos": False},
            {"city": "Belo Horizonte / MG", "volume": "134", "delta": "+3.7%", "trend": [6.2, 6.3, 6.4, 6.4, 6.5, 6.6, 6.6, 6.7, 6.7, 6.8, 6.8, 6.9], "pos": True},
            {"city": "Curitiba / PR", "volume": "96", "delta": "+1.4%", "trend": [7.4, 7.4, 7.5, 7.4, 7.5, 7.5, 7.6, 7.6, 7.6, 7.7, 7.7, 7.8], "pos": True},
            {"city": "Porto Alegre / RS", "volume": "78", "delta": "\u22120.4%", "trend": [6.8, 6.8, 6.7, 6.7, 6.8, 6.7, 6.7, 6.6, 6.7, 6.7, 6.6, 6.7], "pos": False},
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
