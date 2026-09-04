# tests/test_output.py
import json

import pytest

from graph.state import AuctionState, PropertyMetadata, MarketResult, LegalResult
from graph.contracts import ScoringResult, RiskFlags
from graph.output import output_node, build_result


def _make_full_state():
    return AuctionState(
        pdf_texts="Edital text",
        pdf_sources=["edital.pdf"],
        property_metadata=PropertyMetadata(
            address="R. Harmonia, 412, Vila Madalena, São Paulo - SP",
            property_type="Apartamento",
            area_m2=78.0,
            auction_price=312000.0,
            auction_price_2nd=270000.0,
            market_value_estimate=540000.0,
            auction_date="15/05/2026",
            auction_date_2nd="29/05/2026",
            auction_type="1ª praça",
            matricula="87.412",
            process_number="1024778-32.2024.8.26.0100",
            court_or_leiloeiro="Zukerman Leilões",
            auctioneer_name="Zukerman Leilões",
            court_name="7ª Vara Cível SP",
            city="São Paulo",
            neighborhood="Vila Madalena",
            state="SP",
        ),
        market_result=MarketResult(
            price_per_m2_neighborhood=6923.0,
            discount_percentage=42.0,
        ),
        legal_result=LegalResult(
            risk_level="low",
            occupation_status="Desocupado",
        ),
        scoring_result=ScoringResult(
            risk=RiskFlags(j="good", f="good"),
            roi=38.0,
        ),
    )


class TestBuildResult:
    def test_build_result_maps_all_fields(self):
        state = _make_full_state()
        result = build_result(state)

        assert result.id  # non-empty
        # score field has been removed from the contract
        assert not hasattr(result, "score")
        assert result.photo_label == "APARTAMENTO · VILA MADALENA · SP"
        assert "Harmonia" in result.title
        assert result.address == "R. Harmonia, 412, Vila Madalena, São Paulo - SP"
        assert result.type == "Apartamento"
        assert result.neighborhood == "Vila Madalena"
        assert result.city == "São Paulo, SP"
        assert result.auction_type == "Extrajudicial"
        assert result.praca == "1ª praça"
        assert result.auctioneer == "Zukerman Leilões"
        assert result.discount == 42.0
        assert result.min_bid == 312000.0
        # market comes from IA (price_per_m2 * area), not the edital appraisal
        assert result.market == 6923.0 * 78.0
        # appraisal carries the edital value
        assert result.appraisal == 540000.0
        assert result.roi == 38.0
        assert result.area == 78.0
        assert not hasattr(result, "occupancy")
        assert result.risk.j == "good"

    def test_build_result_court_judicial(self):
        state = _make_full_state()
        state.property_metadata.auction_type = "Judicial"
        result = build_result(state)
        assert result.auctioneer == "Zukerman Leilões"
        assert result.court == "7ª Vara Cível SP"

    def test_build_result_court_extrajudicial(self):
        state = _make_full_state()
        state.property_metadata.auction_type = "Extrajudicial"
        result = build_result(state)
        assert result.court == "—"

    def test_build_result_market_from_price_per_m2(self):
        state = _make_full_state()
        state.property_metadata.market_value_estimate = None
        result = build_result(state)
        assert result.market == 6923.0 * 78.0

    def test_land_has_no_market_detail_or_estimated_market(self):
        state = _make_full_state()
        state.property_metadata.property_type = "Terreno"
        state.market_result = MarketResult()
        state.scoring_result.roi = 0
        result = build_result(state)
        assert result.market == 0
        assert result.discount == 0
        assert result.roi == 0
        assert result.market_detail is None

    def test_build_result_beds_baths_parking_floor_are_none(self):
        state = _make_full_state()
        result = build_result(state)
        assert result.beds is None
        assert result.baths is None
        assert result.parking is None
        assert result.floor is None

    def test_build_result_ends_at_is_iso8601(self):
        state = _make_full_state()
        result = build_result(state)
        assert "T" in result.ends_at or "/" in result.ends_at


class TestOutputNode:
    def test_output_node_returns_result_json(self):
        state = _make_full_state()
        result = output_node(state)
        assert "result_json" in result
        parsed = json.loads(result["result_json"])
        # score field removed from contract
        assert "score" not in parsed
        assert parsed["risk"]["j"] == "good"

    def test_output_node_no_metadata(self):
        state = AuctionState()
        result = output_node(state)
        assert "result_json" in result
        parsed = json.loads(result["result_json"])
        # No score field; default risk flags are all bad
        assert "score" not in parsed
        assert parsed["risk"]["j"] == "bad"

    def test_output_node_no_scoring_result(self):
        state = _make_full_state()
        state.scoring_result = None
        result = output_node(state)
        assert "result_json" in result
        parsed = json.loads(result["result_json"])
        # No score field; default risk flags are all bad when scoring_result is None
        assert "score" not in parsed
        assert parsed["risk"]["j"] == "bad"


class TestBuildResultDetails:
    def test_viability_populated_from_state(self):
        state = _make_full_state()
        result = build_result(state)
        assert result.viability is not None
        # No debt text means no evidence-backed financial risk dimension.
        assert result.viability.risk_dimensions == []
        assert result.viability.description != ""

    def test_market_detail_populated_from_state(self):
        state = _make_full_state()
        result = build_result(state)
        assert result.market_detail is not None
        assert len(result.market_detail.indicators) > 0
        assert len(result.market_detail.comparables) >= 0
        assert result.market_detail.confidence_level == "low"

    def test_costs_populated_from_state(self):
        state = _make_full_state()
        result = build_result(state)
        assert result.costs is not None
        assert len(result.costs) > 0
        assert result.costs[0].kind in ("price", "tax", "fee", "debt", "reno")

    def test_costs_include_editable_platform_estimates(self):
        state = _make_full_state()
        result = build_result(state)
        costs = {item.id: item for item in result.costs}

        assert costs["auctioneer_commission"].rate == 0.05
        assert costs["property_registration"].rate == 0.009
        assert costs["occupant_removal"].value == 5000

    def test_direct_sale_uses_sale_price_and_has_no_auctioneer_commission(self):
        state = _make_full_state()
        state.property_metadata.auction_type = "Venda Direta Online"

        costs = {item.id: item for item in build_result(state).costs}

        assert costs["auction_bid"].label == "Preço de venda"
        assert "auctioneer_commission" not in costs

    def test_edital_populated_from_state(self):
        state = _make_full_state()
        result = build_result(state)
        assert result.edital is not None
        assert result.edital.process != ""
        assert result.edital.matricula == "87.412"
        assert result.matricula == "87.412"

    def test_details_none_when_no_metadata(self):
        state = AuctionState()
        result = build_result(state)
        assert result.viability is None
        assert result.market_detail is None
        assert result.costs is None
        assert result.edital is None

    def test_edital_no_2nd_price_fallback_is_zero(self):
        state = _make_full_state()
        state.property_metadata.auction_price_2nd = 0
        result = build_result(state)
        assert result.edital.second_bid_price == 0

    def test_details_serialized_to_camel_case_json(self):
        state = _make_full_state()
        result = output_node(state)
        parsed = json.loads(result["result_json"])
        assert "viability" in parsed
        assert "marketDetail" in parsed
        assert parsed["marketDetail"]["confidenceLevel"] == "low"
        assert "confidenceScore" not in parsed["marketDetail"]
        assert "costs" in parsed
        assert "edital" in parsed
        assert "riskDimensions" in parsed["viability"]


def test_build_result_market_is_ia_not_appraisal():
    """market field must be IA (comparables), not the edital appraisal."""
    state = AuctionState(
        auction_url="http://x",
        pdf_texts="",
        property_metadata=PropertyMetadata(
            address="Rua X, 100",
            property_type="Apartamento",
            area_m2=50.0,
            auction_price=100000.0,        # lance mínimo
            market_value_estimate=180000.0,  # avaliação do edital
            city="Curitiba", state="PR",
            neighborhood="Centro",
        ),
        market_result=MarketResult(
            price_per_m2_neighborhood=3000.0,  # IA: 3000 * 50 = 150000
        ),
        legal_result=LegalResult(occupation_status="desocupado"),
        scoring_result=ScoringResult(
            risk=RiskFlags(j="good", f="good"),
            roi=10.0,
        ),
    )

    result = build_result(state)
    # market must come from IA (price_per_m2 * area), not appraisal
    assert result.market == 150000.0
    # appraisal carries the edital value
    assert result.appraisal == 180000.0
    # auction_discount: (180000 - 100000) / 180000 * 100 = 44.44
    assert result.auction_discount == pytest.approx(44.44, abs=0.1)
