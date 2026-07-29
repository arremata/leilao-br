import json
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

import api
from db.base import get_engine, init_db, make_session_factory
from db.models import Property, Enrichment


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
    api.app.dependency_overrides.clear()


def test_catalog_card_has_title_and_auction_discount():
    client, factory = _client_with_db()
    with factory() as s:
        s.add(Property(source="caixa", source_id="9", uf="PR", city="Curitiba",
                       neighborhood="Batel", address="Rua X, 100",
                       property_type="Apartamento", area_m2=72.0,
                       preco=150000.0, avaliacao=300000.0,
                       desconto_oficial=50.0, status="active"))
        s.commit()

    card = client.get("/catalog?uf=PR").json()[0]
    assert card["auctionDiscount"] == 50.0
    assert card["title"] == "Apartamento 72 m², Batel"
    api.app.dependency_overrides.clear()


def test_catalog_card_exposes_both_auction_dates_as_iso_strings():
    client, factory = _client_with_db()
    tz = ZoneInfo("America/Sao_Paulo")
    with factory() as s:
        s.add(Property(
            source="caixa", source_id="date-1", uf="PR", address="Rua X",
            preco=100000.0, status="active",
            first_auction_at=datetime(2026, 8, 4, 10, 0, tzinfo=tz),
            second_auction_at=datetime(2026, 8, 10, 10, 0, tzinfo=tz),
            first_auction_price=140000.0, second_auction_price=94464.41,
        ))
        s.commit()

    card = client.get("/catalog?uf=PR").json()[0]
    assert card["firstAuctionAt"] == "2026-08-04T10:00:00-03:00"
    assert card["secondAuctionAt"] == "2026-08-10T10:00:00-03:00"
    assert card["endsAt"] == "2026-08-04T10:00:00-03:00"
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


def test_catalog_analyze_runs_enrichment_and_persists(monkeypatch):
    client, factory = _client_with_db()
    with factory() as s:
        s.add(Property(source="caixa", source_id="1", uf="PR", city="Curitiba",
                       neighborhood="Centro", address="Rua A", property_type="Casa",
                       area_m2=50.0, preco=100000.0, avaliacao=200000.0,
                       modalidade="Venda Direta Online", status="active"))
        s.commit()
        prop_id = s.query(Property).filter_by(source_id="1").one().id

    from graph.contracts import AuctionPropertyResult, RiskFlags

    def _fake_enrich(metadata, pdf_texts="", auction_url=""):
        return AuctionPropertyResult(
            id="abc", photo_label="", title="Casa", address="Rua A", type="Casa",
            neighborhood="Centro", city="Curitiba, PR", auction_type="Extrajudicial",
            auctioneer="—", court="—", discount=40.0, min_bid=100000.0, market=180000.0,
            roi=20.0, appraisal=200000.0, auction_discount=50.0, area=50.0, ends_at="",
            occupancy="desocupado", risk=RiskFlags(j="good", f="good", l="good", o="good"),
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
        s.commit()
        prop_id = s.query(Property).filter_by(source_id="1").one().id

    from graph.contracts import AuctionPropertyResult, RiskFlags

    captured = {}

    def _fake_enrich(metadata, pdf_texts="", auction_url=""):
        captured["pdf_texts"] = pdf_texts
        return AuctionPropertyResult(
            id="abc", photo_label="", title="Casa", address="Rua A", type="Casa",
            neighborhood="Centro", city="Curitiba, PR", auction_type="Extrajudicial",
            auctioneer="—", court="—", discount=40.0, min_bid=100000.0, market=180000.0,
            roi=20.0, appraisal=200000.0, auction_discount=50.0, area=50.0, ends_at="",
            occupancy="desocupado", risk=RiskFlags(j="good", f="good", l="good", o="good"),
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
        s.commit()
        prop_id = s.query(Property).filter_by(source_id="1").one().id

    from graph.contracts import AuctionPropertyResult, RiskFlags

    def _fake_enrich(metadata, pdf_texts="", auction_url=""):
        return AuctionPropertyResult(
            id="abc", photo_label="", title="Casa", address="Rua A", type="Casa",
            neighborhood="Centro", city="Curitiba, PR", auction_type="Extrajudicial",
            auctioneer="—", court="—", discount=40.0, min_bid=100000.0, market=180000.0,
            roi=20.0, appraisal=200000.0, auction_discount=50.0, area=50.0, ends_at="",
            occupancy="desocupado", risk=RiskFlags(j="good", f="good", l="good", o="good"),
            viability=None, market_detail=None, costs=None, edital=None, auction_url=None,
        )

    async def _fake_fetch_detail(detail_url, base_url="https://venda-imoveis.caixa.gov.br"):
        return {"photo_url": "https://venda-imoveis.caixa.gov.br/fotos/F1.jpg",
                "full_description": "Casa ampla", "document_urls": []}

    monkeypatch.setattr(api, "run_structured_enrichment", _fake_enrich)
    monkeypatch.setattr(api, "fetch_detail", _fake_fetch_detail)

    resp = client.post(f"/catalog/{prop_id}/analyze")
    assert resp.status_code == 200
    with factory() as s:
        prop = s.get(Property, prop_id)
        assert prop.photo_url == "https://venda-imoveis.caixa.gov.br/fotos/F1.jpg"
        assert prop.detail_fetched is True
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
