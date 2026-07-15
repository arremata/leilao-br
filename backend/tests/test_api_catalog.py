import json

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
