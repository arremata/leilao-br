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


def test_run_structured_enrichment_skips_discovery_planner(monkeypatch):
    # Stub the three heavy nodes so no LLM/network runs.
    monkeypatch.setattr(enrich, "market_node", lambda state: {
        "market_result": MarketResult(price_per_m2_neighborhood=4000.0, liquidity_days=60,
                                      discount_percentage=40.0)
    })
    monkeypatch.setattr(enrich, "legal_node", lambda state: {
        "legal_result": LegalResult(risk_level="low", occupation_status="desocupado")
    })
    monkeypatch.setattr(enrich, "scoring_node", lambda state: {
        "scoring_result": ScoringResult(risk=RiskFlags(j="good", f="good", l="good", o="good"),
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
