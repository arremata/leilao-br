import json
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

import api
from db.base import get_engine, init_db, make_session_factory
from db.models import (
    Enrichment, MarketReferenceJob, Property,
    RegionalMarketComparable, RegionalMarketPrice,
)


def _client_with_db():
    engine = get_engine("sqlite://")
    init_db(engine)
    factory = make_session_factory(engine)
    api.app.state.session_factory = factory

    def _override():
        with factory() as s:
            yield s

    api.app.dependency_overrides[api.get_session] = _override
    return TestClient(api.app), factory


def _add_city_reference(session, city="Curitiba", property_type="Casa"):
    session.add(RegionalMarketPrice(
        uf="PR", city=city, neighborhood="", property_type=property_type,
        price_per_m2=5_000, sample_size=3,
    ))


def test_catalog_lists_active_properties_filtered_by_uf():
    client, factory = _client_with_db()
    with factory() as s:
        s.add(Property(source="caixa", source_id="1", uf="PR", city="Curitiba",
                       address="Rua A", preco=100000.0, avaliacao=200000.0,
                       desconto_oficial=50.0, status="active"))
        s.add(Property(source="caixa", source_id="2", uf="SP", city="São Paulo",
                       address="Rua B", preco=50000.0, status="active"))
        s.commit()

    resp = client.get("/catalog?uf=PR")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["sourceId"] == "1"
    assert body[0]["desconto"] == 50.0
    assert body[0]["canAnalyze"] is True
    api.app.dependency_overrides.clear()


def test_catalog_card_has_title_and_auction_discount():
    client, factory = _client_with_db()
    with factory() as s:
        s.add(Property(source="caixa", source_id="9", uf="PR", city="Curitiba",
                       neighborhood="Batel", address="Rua X, 100",
                       property_type="Apartamento", area_m2=72.0,
                       preco=150000.0, avaliacao=300000.0,
                       desconto_oficial=50.0, status="active",
                       detail_url="https://example.com/leilao/9",
                       matricula="91.048",
                       edital_url="https://example.com/edital.pdf",
                       matricula_url="https://example.com/matricula.pdf",
                       edital_data={"lotNumber": "175", "registryOffice": "02"}))
        s.commit()

    card = client.get("/catalog?uf=PR").json()[0]
    assert card["auctionDiscount"] == 50.0
    assert card["title"] == "Apartamento 72 m², Batel"
    assert card["auctionUrl"] == "https://example.com/leilao/9"
    assert card["matricula"] == "91.048"
    assert card["editalUrl"] == "https://example.com/edital.pdf"
    assert card["matriculaUrl"] == "https://example.com/matricula.pdf"
    assert "editalData" not in card

    detail = client.get(f"/catalog/{card['id']}").json()
    assert detail["editalData"] == {"lotNumber": "175", "registryOffice": "02"}
    api.app.dependency_overrides.clear()


def test_catalog_card_exposes_both_auction_dates_as_iso_strings():
    client, factory = _client_with_db()
    tz = ZoneInfo("America/Sao_Paulo")
    with factory() as s:
        s.add(Property(
            source="caixa", source_id="date-1", uf="PR", address="Rua X",
            preco=100000.0, status="active",
            first_auction_at=datetime(2099, 8, 4, 10, 0, tzinfo=tz),
            second_auction_at=datetime(2099, 8, 10, 10, 0, tzinfo=tz),
            first_auction_price=140000.0, second_auction_price=94464.41,
        ))
        s.commit()

    card = client.get("/catalog?uf=PR").json()[0]
    assert card["firstAuctionAt"] == "2099-08-04T10:00:00-03:00"
    assert card["secondAuctionAt"] == "2099-08-10T10:00:00-03:00"
    assert card["endsAt"] == "2099-08-04T10:00:00-03:00"
    assert card["firstAuctionPrice"] == 140000.0
    assert card["secondAuctionPrice"] == 94464.41
    api.app.dependency_overrides.clear()


def test_catalog_card_title_falls_back_to_address_without_type():
    client, factory = _client_with_db()
    with factory() as s:
        s.add(Property(source="caixa", source_id="10", uf="PR", city="Curitiba",
                       address="Rua Y, 200", preco=50000.0, status="active"))
        s.commit()

    card = client.get("/catalog?uf=PR").json()[0]
    assert card["title"] == "Rua Y, 200"
    api.app.dependency_overrides.clear()


def test_catalog_detail_suppresses_stale_land_market_estimate():
    client, factory = _client_with_db()
    with factory() as s:
        prop = Property(
            source="caixa", source_id="land-old", uf="PR", city="Curitiba",
            address="Rodovia dos Minérios", property_type="Terreno",
            area_m2=72_600, preco=1_243_146.17, status="active",
        )
        s.add(prop)
        s.flush()
        s.add(Enrichment(
            property_id=prop.id,
            result_json=json.dumps({
                "market": 185_533_656, "discount": 99, "roi": 1000,
                "marketDetail": {"indicators": [], "comparables": []},
            }),
            pipeline_version="v2-market-calc",
        ))
        s.commit()
        prop_id = prop.id

    enrichment = client.get(f"/catalog/{prop_id}").json()["enrichment"]
    assert enrichment["market"] == 0
    assert enrichment["discount"] == 0
    assert enrichment["roi"] == 0
    assert enrichment["marketDetail"] is None
    api.app.dependency_overrides.clear()


def test_catalog_detail_refreshes_legacy_confidence_without_exposing_debug():
    client, factory = _client_with_db()
    with factory() as s:
        prop = Property(
            source="caixa", source_id="legacy-confidence", uf="PR", city="Curitiba",
            neighborhood="Centro", address="Rua A", property_type="Apartamento",
            area_m2=70, beds=2, lat=-25.4284, lng=-49.2733,
            preco=150_000, avaliacao=250_000, status="active",
        )
        reference = RegionalMarketPrice(
            uf="PR", city="Curitiba", neighborhood="", property_type="Apartamento",
            price_per_m2=5_000, sample_size=5,
        )
        s.add_all([prop, reference])
        s.flush()
        s.add(Enrichment(
            property_id=prop.id,
            result_json=json.dumps({
                "market": 350_000,
                "marketDetail": {
                    "indicators": [], "comparables": [], "confidenceLevel": "low",
                },
            }),
            pipeline_version="v10-cost-simulator",
        ))
        s.add_all([
            RegionalMarketComparable(
                reference_id=reference.id, address=f"Rua {index}",
                property_type="Apartamento", price=350_000, area_m2=70,
                beds=2, price_per_m2=5_000, source="Portal",
                url=f"https://portal/{index}", lat=-25.4284, lng=-49.2733,
            )
            for index in range(5)
        ])
        s.commit()
        prop_id = prop.id

    enrichment = client.get(f"/catalog/{prop_id}").json()["enrichment"]

    assert enrichment["marketDetail"]["confidenceLevel"] == "high"
    assert "confidenceDebug" not in enrichment["marketDetail"]
    api.app.dependency_overrides.clear()


def test_catalog_analyze_runs_enrichment_and_persists(monkeypatch):
    client, factory = _client_with_db()
    with factory() as s:
        s.add(Property(source="caixa", source_id="1", uf="PR", city="Curitiba",
                       neighborhood="Centro", address="Rua A", property_type="Casa",
                       area_m2=50.0, preco=100000.0, avaliacao=200000.0,
                       modalidade="Venda Direta Online", status="active"))
        _add_city_reference(s)
        s.commit()
        prop_id = s.query(Property).filter_by(source_id="1").one().id

    from graph.contracts import AuctionPropertyResult, RiskFlags

    def _fake_enrich(metadata, pdf_texts="", auction_url="", regional_price_per_m2=None, regional_comparables=None):
        return AuctionPropertyResult(
            id="abc", photo_label="", title="Casa", address="Rua A", type="Casa",
            neighborhood="Centro", city="Curitiba, PR", auction_type="Extrajudicial",
            auctioneer="—", court="—", discount=40.0, min_bid=100000.0, market=180000.0,
            roi=20.0, appraisal=200000.0, auction_discount=50.0, area=50.0, ends_at="",
            risk=RiskFlags(j="good", f="good"),
            viability=None, market_detail=None, costs=None, edital=None, auction_url=None,
        )

    monkeypatch.setattr(api, "run_structured_enrichment", _fake_enrich)

    resp = client.post(f"/catalog/{prop_id}/analyze")
    assert resp.status_code == 200
    assert resp.json()["roi"] == 20.0
    with factory() as s:
        enr = s.query(Enrichment).filter_by(property_id=prop_id).one()
        assert json.loads(enr.result_json)["roi"] == 20.0
    api.app.dependency_overrides.clear()


def test_catalog_analyze_feeds_ingested_description_as_pdf_texts(monkeypatch):
    client, factory = _client_with_db()
    with factory() as s:
        s.add(Property(source="caixa", source_id="1", uf="PR", city="Curitiba",
                       neighborhood="Centro", address="Rua A", property_type="Casa",
                       area_m2=50.0, preco=100000.0, avaliacao=200000.0,
                       modalidade="Venda Direta Online",
                       descricao_raw="Casa desocupada, IPTU em atraso.",
                       status="active"))
        _add_city_reference(s)
        s.commit()
        prop_id = s.query(Property).filter_by(source_id="1").one().id

    from graph.contracts import AuctionPropertyResult, RiskFlags

    captured = {}

    def _fake_enrich(metadata, pdf_texts="", auction_url="", regional_price_per_m2=None, regional_comparables=None):
        captured["pdf_texts"] = pdf_texts
        return AuctionPropertyResult(
            id="abc", photo_label="", title="Casa", address="Rua A", type="Casa",
            neighborhood="Centro", city="Curitiba, PR", auction_type="Extrajudicial",
            auctioneer="—", court="—", discount=40.0, min_bid=100000.0, market=180000.0,
            roi=20.0, appraisal=200000.0, auction_discount=50.0, area=50.0, ends_at="",
            risk=RiskFlags(j="good", f="good"),
            viability=None, market_detail=None, costs=None, edital=None, auction_url=None,
        )

    monkeypatch.setattr(api, "run_structured_enrichment", _fake_enrich)

    resp = client.post(f"/catalog/{prop_id}/analyze")
    assert resp.status_code == 200
    assert captured["pdf_texts"] == "Casa desocupada, IPTU em atraso."
    api.app.dependency_overrides.clear()


def test_catalog_analyze_lazily_fetches_detail(monkeypatch):
    client, factory = _client_with_db()
    with factory() as s:
        s.add(Property(source="caixa", source_id="1", uf="PR", city="Curitiba",
                       neighborhood="Centro", address="Rua A", property_type="Casa",
                       area_m2=50.0, preco=100000.0, avaliacao=200000.0,
                       modalidade="Venda Direta Online", status="active",
                       detail_url="https://venda-imoveis.caixa.gov.br/imovel/1",
                       detail_fetched=False))
        _add_city_reference(s)
        s.commit()
        prop_id = s.query(Property).filter_by(source_id="1").one().id

    from graph.contracts import AuctionPropertyResult, RiskFlags

    def _fake_enrich(metadata, pdf_texts="", auction_url="", regional_price_per_m2=None, regional_comparables=None):
        return AuctionPropertyResult(
            id="abc", photo_label="", title="Casa", address="Rua A", type="Casa",
            neighborhood="Centro", city="Curitiba, PR", auction_type="Extrajudicial",
            auctioneer="—", court="—", discount=40.0, min_bid=100000.0, market=180000.0,
            roi=20.0, appraisal=200000.0, auction_discount=50.0, area=50.0, ends_at="",
            risk=RiskFlags(j="good", f="good"),
            viability=None, market_detail=None, costs=None, edital=None, auction_url=None,
        )

    async def _fake_fetch_detail(detail_url, base_url="https://venda-imoveis.caixa.gov.br"):
        return {"photo_url": "https://venda-imoveis.caixa.gov.br/fotos/F1.jpg",
                "full_description": "Casa ampla", "document_urls": [],
                "matricula": "91.048",
                "edital_url": "https://venda-imoveis.caixa.gov.br/editais/EL1.PDF",
                "matricula_url": "https://venda-imoveis.caixa.gov.br/editais/matricula/PR/1.pdf"}

    monkeypatch.setattr(api, "run_structured_enrichment", _fake_enrich)
    monkeypatch.setattr(api, "fetch_detail", _fake_fetch_detail)

    resp = client.post(f"/catalog/{prop_id}/analyze")
    assert resp.status_code == 200
    with factory() as s:
        prop = s.get(Property, prop_id)
        assert prop.photo_url == "https://venda-imoveis.caixa.gov.br/fotos/F1.jpg"
        assert prop.matricula == "91.048"
        assert prop.edital_url.endswith("EL1.PDF")
        assert prop.matricula_url.endswith("/PR/1.pdf")
        assert prop.detail_fetched is True
    api.app.dependency_overrides.clear()


def test_catalog_analyze_prioritizes_missing_city_reference():
    client, factory = _client_with_db()
    with factory() as session:
        prop = Property(
            source="caixa", source_id="queued", uf="PR", city="Maringá",
            neighborhood="Parque Industrial", property_type="APTO", address="Rua A",
            area_m2=80, preco=330_000, status="active",
        )
        session.add(prop)
        session.commit()
        property_id = prop.id

    response = client.post(f"/catalog/{property_id}/analyze")
    assert response.status_code == 409
    assert "priorizada" in response.json()["detail"]
    with factory() as session:
        job = session.query(MarketReferenceJob).one()
        assert (job.city, job.neighborhood, job.property_type, job.priority) == (
            "Maringá", "", "Apartamento", 0,
        )
    api.app.dependency_overrides.clear()


def test_ingest_endpoint_uses_injected_file(monkeypatch, tmp_path):
    client, factory = _client_with_db()

    from ingestion.run import IngestSummary

    def _fake_run_cli(argv, session_factory=None):
        return IngestSummary(inserted=3)

    monkeypatch.setattr(api, "run_cli", _fake_run_cli)
    resp = client.post("/ingest", json={"source": "caixa", "uf": "PR"})
    assert resp.status_code == 200
    assert resp.json()["inserted"] == 3
    api.app.dependency_overrides.clear()
