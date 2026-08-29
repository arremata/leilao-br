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
        "matricula": "91.048", "edital_url": "https://example.com/edital.pdf",
        "matricula_url": "https://example.com/matricula.pdf",
        "edital_data": {"lotNumber": "175", "registryOffice": "02"},
    }

    card = vercel_api._catalog_card(row)

    assert card["id"] == 7
    assert card["sourceId"] == "123"
    assert card["title"] == "Apartamento 80 m², Centro"
    assert card["auctionDiscount"] == 50.0
    assert card["endsAt"] == "2099-08-04T10:00:00-03:00"
    assert card["photoUrl"] == "https://example.com/photo.jpg"
    assert card["auctionUrl"] == "https://example.com/property"
    assert card["matricula"] == "91.048"
    assert card["editalUrl"] == "https://example.com/edital.pdf"
    assert card["matriculaUrl"] == "https://example.com/matricula.pdf"
    assert "editalData" not in card
    assert card["canAnalyze"] is True

    detail = vercel_api._catalog_card(row, include_edital_data=True)
    assert detail["editalData"] == {"lotNumber": "175", "registryOffice": "02"}


def test_edital_data_is_selected_only_for_catalog_detail():
    assert "edital_data" not in vercel_api._CATALOG_COLUMNS
    assert "edital_data" in vercel_api._CATALOG_DETAIL_COLUMNS


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


def test_persisted_city_reference_is_identified_in_market_detail():
    row = {
        "id": 7, "uf": "PR", "city": "Curitiba", "neighborhood": "Centro",
        "address": "Rua A", "property_type": "Apartamento", "area_m2": 50,
        "beds": 2, "preco": 150_000, "avaliacao": 250_000,
        "modalidade": "Venda Direta Online", "detail_url": "https://example.com/7",
        "photo_url": None,
    }

    result = vercel_api._build_persisted_enrichment(
        row, {"price_per_m2": 5_000, "scope": "city"}, [],
    )

    assert result["market"] == 250_000
    assert result["marketDetail"]["indicators"][0]["lbl"] == "Preço/m² · cidade"


def test_persisted_enrichment_includes_dynamic_editable_costs():
    row = {
        "id": 7, "uf": "PR", "city": "Curitiba", "neighborhood": "Centro",
        "address": "Rua A", "property_type": "Apartamento", "area_m2": 50,
        "beds": 2, "preco": 100_000, "avaliacao": 150_000,
        "modalidade": "Leilão SFI", "detail_url": "https://example.com/7",
        "photo_url": None, "descricao_raw": "Comissão do leiloeiro de 6% sobre o lance",
    }

    result = vercel_api._build_persisted_enrichment(
        row, {"price_per_m2": 5_000, "scope": "city"}, [],
    )
    costs = {item["id"]: item for item in result["costs"]}

    assert costs["auctioneer_commission"]["rate"] == 0.06
    assert costs["property_registration"]["rate"] == 0.008
    assert costs["occupant_removal"]["value"] == 5000


def test_persisted_enrichment_prefers_official_edital_commission():
    row = {
        "id": 7, "uf": "PR", "city": "Curitiba", "neighborhood": "Centro",
        "address": "Rua A", "property_type": "Apartamento", "area_m2": 50,
        "beds": 2, "preco": 100_000, "avaliacao": 150_000,
        "modalidade": "Leilão SFI", "detail_url": "https://example.com/7",
        "photo_url": None, "descricao_raw": "Comissão estimada de 6%",
        "edital_data": {"commissionRate": 0.05},
    }

    result = vercel_api._build_persisted_enrichment(
        row, {"price_per_m2": 5_000, "scope": "city"}, [],
    )
    commission = next(item for item in result["costs"] if item["id"] == "auctioneer_commission")

    assert commission["rate"] == 0.05
    assert "edital" in commission["label"]


def test_persisted_direct_sale_has_no_auctioneer_commission():
    row = {
        "id": 8, "uf": "PR", "city": "Curitiba", "neighborhood": "Tingui",
        "address": "Rua B", "property_type": "Casa", "area_m2": 100,
        "beds": 3, "preco": 200_000, "avaliacao": 300_000,
        "modalidade": "Venda Direta Online", "detail_url": "https://example.com/8",
        "photo_url": None, "descricao_raw": "",
    }

    result = vercel_api._build_persisted_enrichment(
        row, {"price_per_m2": 4_000, "scope": "city"}, [],
    )
    costs = {item["id"]: item for item in result["costs"]}

    assert costs["auction_bid"]["label"] == "Preço de venda"
    assert "auctioneer_commission" not in costs


def test_catalog_requires_database_configuration(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    vercel_api._engine = None
    response = TestClient(vercel_api.app).get("/catalog")
    assert response.status_code == 503
    assert response.json()["detail"] == "Catalog database is not configured"
