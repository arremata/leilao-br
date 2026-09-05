from datetime import datetime, timezone

import enrichment.run as enrich
from db.models import Property
from graph.state import MarketResult, LegalResult
from graph.contracts import ScoringResult, RiskFlags
from enrichment.run import metadata_from_property, run_structured_enrichment


def test_metadata_from_property_maps_fields():
    p = Property(
        source="caixa", source_id="1", uf="PR", city="Curitiba",
        neighborhood="Centro", address="Rua XV, 100", property_type="Apartamento",
        area_m2=65.0, beds=2, preco=150000.0, avaliacao=250000.0,
        modalidade="Venda Direta Online", photo_url="http://p.jpg",
        matricula="91.048", first_auction_price=175000.0,
        second_auction_price=150000.0,
        first_auction_at=datetime(2026, 9, 1, 13, tzinfo=timezone.utc),
        second_auction_at=datetime(2026, 9, 3, 13, tzinfo=timezone.utc),
        edital_url="https://example.com/edital.pdf",
        matricula_url="https://example.com/matricula.pdf",
        edital_data={
            "auctionNumber": "0027/0326", "lotNumber": "175",
            "commissionRate": 0.05,
        },
    )
    meta = metadata_from_property(p)
    assert meta.address == "Rua XV, 100"
    assert meta.property_type == "Apartamento"
    assert meta.area_m2 == 65.0
    assert meta.auction_price == 150000.0
    assert meta.market_value_estimate == 250000.0
    assert meta.city == "Curitiba"
    assert meta.state == "PR"
    assert meta.beds == 2
    assert meta.matricula == "91.048"
    assert meta.auction_price_1st == 175000.0
    assert meta.auction_price_2nd == 150000.0
    assert meta.auction_date == "2026-09-01T13:00:00+00:00"
    assert meta.auction_date_2nd == "2026-09-03T13:00:00+00:00"
    assert meta.edital_url == "https://example.com/edital.pdf"
    assert meta.matricula_url == "https://example.com/matricula.pdf"
    assert meta.edital_data["lotNumber"] == "175"
    assert meta.commission_rate is None

    result = run_structured_enrichment(meta, auction_url="http://x")
    assert result.edital.first_bid_date == "2026-09-01T13:00:00+00:00"
    assert result.edital.first_bid_price == 175000.0
    assert result.edital.second_bid_date == "2026-09-03T13:00:00+00:00"
    assert result.edital.second_bid_price == 150000.0
    assert result.edital_url == "https://example.com/edital.pdf"
    assert result.matricula_url == "https://example.com/matricula.pdf"
    assert result.edital_data["commissionRate"] == 0.05
    commission = next(item for item in result.costs if item.id == "auctioneer_commission")
    assert commission.label == "Comissão isenta"
    assert commission.value == 0


def test_run_structured_enrichment_skips_discovery_planner(monkeypatch):
    # Stub the three heavy nodes so no LLM/network runs.
    monkeypatch.setattr(enrich, "market_node", lambda state, regional=None, comparables=None: {
        "market_result": MarketResult(price_per_m2_neighborhood=4000.0,
                                      discount_percentage=40.0)
    })
    monkeypatch.setattr(enrich, "legal_node", lambda state: {
        "legal_result": LegalResult(risk_level="low", occupation_status="desocupado")
    })
    monkeypatch.setattr(enrich, "scoring_node", lambda state: {
        "scoring_result": ScoringResult(risk=RiskFlags(j="good", f="good"),
                                        roi=25.0)
    })

    p = Property(source="caixa", source_id="1", uf="PR", city="Curitiba",
                 neighborhood="Centro", address="Rua XV, 100",
                 property_type="Apartamento", area_m2=65.0, preco=150000.0,
                 avaliacao=250000.0, modalidade="Venda Direta Online")
    result = run_structured_enrichment(metadata_from_property(p), auction_url="http://x")
    # market = price_per_m2_neighborhood * area (IA), not appraisal
    assert result.market == 4000.0 * 65.0
    assert result.appraisal == 250000.0
    assert result.roi == 25.0
    assert result.min_bid == 150000.0


def test_run_structured_enrichment_skips_legal_when_disabled(monkeypatch):
    # Legal is temporarily disabled (proxy 502s). The node must not be called
    # at all — skipping the ~90s of doomed retries — while the rest of the
    # pipeline still produces a full result.
    monkeypatch.setattr(enrich, "LEGAL_NODE_ENABLED", False)
    called = {"legal": False}

    def _legal_spy(state):
        called["legal"] = True
        return {"legal_result": LegalResult()}

    monkeypatch.setattr(enrich, "market_node", lambda state, regional=None, comparables=None: {
        "market_result": MarketResult(price_per_m2_neighborhood=4000.0,
                                      discount_percentage=40.0)
    })
    monkeypatch.setattr(enrich, "legal_node", _legal_spy)
    monkeypatch.setattr(enrich, "scoring_node", lambda state: {
        "scoring_result": ScoringResult(risk=RiskFlags(j="good", f="good"),
                                        roi=25.0)
    })

    p = Property(source="caixa", source_id="1", uf="PR", city="Curitiba",
                 neighborhood="Centro", address="Rua XV, 100",
                 property_type="Apartamento", area_m2=65.0, preco=150000.0,
                 avaliacao=250000.0, modalidade="Venda Direta Online")
    result = run_structured_enrichment(metadata_from_property(p), auction_url="http://x")
    assert called["legal"] is False
    assert result.market == 4000.0 * 65.0
    assert result.roi == 25.0


def test_run_structured_enrichment_tolerates_legal_failure(monkeypatch):
    # When legal IS enabled, a transient failure (e.g. proxy 502) must degrade
    # gracefully — falling back to a default LegalResult — instead of failing
    # the whole analysis.
    monkeypatch.setattr(enrich, "LEGAL_NODE_ENABLED", True)
    monkeypatch.setattr(enrich, "market_node", lambda state, regional=None, comparables=None: {
        "market_result": MarketResult(price_per_m2_neighborhood=4000.0,
                                      discount_percentage=40.0)
    })

    def _legal_boom(state):
        raise RuntimeError("proxy 502 Bad Gateway")

    monkeypatch.setattr(enrich, "legal_node", _legal_boom)
    monkeypatch.setattr(enrich, "scoring_node", lambda state: {
        "scoring_result": ScoringResult(risk=RiskFlags(j="good", f="good"),
                                        roi=25.0)
    })

    p = Property(source="caixa", source_id="1", uf="PR", city="Curitiba",
                 neighborhood="Centro", address="Rua XV, 100",
                 property_type="Apartamento", area_m2=65.0, preco=150000.0,
                 avaliacao=250000.0, modalidade="Venda Direta Online")
    # Should not raise; market + scoring results survive.
    result = run_structured_enrichment(metadata_from_property(p), auction_url="http://x")
    assert result.market == 4000.0 * 65.0
    assert result.roi == 25.0
