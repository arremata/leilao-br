"""Contract tests for the lightweight Vercel catalog API."""

import json
from datetime import datetime
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient


MODULE_PATH = Path(__file__).parents[2] / "vercel-backend" / "index.py"
SPEC = spec_from_file_location("vercel_catalog_api", MODULE_PATH)
vercel_api = module_from_spec(SPEC)
SPEC.loader.exec_module(vercel_api)


def test_catalog_card_matches_frontend_contract():
    row = {
        "id": 7, "source_id": "123", "source": "caixa", "uf": "PR",
        "city": "Curitiba", "neighborhood": "Centro", "address": "Rua A",
        "property_type": "Apartamento", "area_m2": 80.0, "beds": 2,
        "preco": 200000.0, "avaliacao": 400000.0,
        "desconto_oficial": 50.0, "modalidade": "Leilão SFI",
        "first_auction_at": datetime(2099, 8, 4, 10, tzinfo=ZoneInfo("America/Sao_Paulo")),
        "second_auction_at": None, "first_auction_price": 300000.0,
        "second_auction_price": None, "lat": -25.4, "lng": -49.2,
        "photo_url": "https://example.com/photo.jpg",
        "detail_url": "https://example.com/property", "status": "active", "descricao_raw": "",
    }

    card = vercel_api._catalog_card(row)

    assert card["id"] == 7
    assert card["sourceId"] == "123"
    assert card["title"] == "Apartamento 80 m², Centro"
    assert card["auctionDiscount"] == 50.0
    assert card["endsAt"] == "2099-08-04T10:00:00-03:00"
    assert card["photoUrl"] == "https://example.com/photo.jpg"
    assert card["auctionUrl"] == "https://example.com/property"
    assert card["canAnalyze"] is True


def test_stale_land_enrichment_is_suppressed():
    stale = json.dumps({
        "market": 185_533_656, "discount": 99, "roi": 1000,
        "marketDetail": {"indicators": [], "comparables": []},
    })

    result = vercel_api._safe_enrichment(stale, "Terreno")

    assert result["market"] == 0
    assert result["discount"] == 0
    assert result["roi"] == 0
    assert result["marketDetail"] is None


def test_catalog_requires_database_configuration(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    vercel_api._engine = None
    response = TestClient(vercel_api.app).get("/catalog")
    assert response.status_code == 503
    assert response.json()["detail"] == "Catalog database is not configured"
