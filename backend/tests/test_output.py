# tests/test_output.py
import json

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
            reform_estimate=36000.0,
        ),
        legal_result=LegalResult(
            risk_level="low",
            occupation_status="Desocupado",
        ),
        scoring_result=ScoringResult(
            score=87,
            risk=RiskFlags(j="good", f="good", l="warn", o="good"),
            roi=38.0,
        ),
    )


class TestBuildResult:
    def test_build_result_maps_all_fields(self):
        state = _make_full_state()
        result = build_result(state)

        assert result.id  # non-empty
        assert result.score == 87
        assert result.photo_label == "APARTAMENTO · VILA MADALENA · SP"
        assert "Harmonia" in result.title
        assert result.address == "R. Harmonia, 412, Vila Madalena, São Paulo - SP"
        assert result.type == "Apartamento"
        assert result.neighborhood == "Vila Madalena"
        assert result.city == "São Paulo, SP"
        assert result.auction_type == "1ª praça"
        assert result.auctioneer == "Zukerman Leilões"
        assert result.discount == 42.0
        assert result.min_bid == 312000.0
        assert result.market == 540000.0
        assert result.roi == 38.0
        assert result.area == 78.0
        assert result.occupancy == "desocupado"
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
        assert parsed["score"] == 87
        assert parsed["risk"]["j"] == "good"

    def test_output_node_no_metadata(self):
        state = AuctionState()
        result = output_node(state)
        assert "result_json" in result
        parsed = json.loads(result["result_json"])
        assert parsed["score"] == 0

    def test_output_node_no_scoring_result(self):
        state = _make_full_state()
        state.scoring_result = None
        result = output_node(state)
        assert "result_json" in result
        parsed = json.loads(result["result_json"])
        assert parsed["score"] == 0


class TestBuildResultDetails:
    def test_viability_populated_from_state(self):
        state = _make_full_state()
        result = build_result(state)
        assert result.viability is not None
        assert len(result.viability.risk_dimensions) == 4
        assert result.viability.risk_dimensions[0].dim == "Jurídico"
        assert result.viability.risk_dimensions[0].state == "good"
        assert len(result.viability.alerts) > 0
        assert result.viability.description != ""

    def test_market_detail_populated_from_state(self):
        state = _make_full_state()
        result = build_result(state)
        assert result.market_detail is not None
        assert len(result.market_detail.indicators) > 0
        assert len(result.market_detail.comparables) >= 0

    def test_costs_populated_from_state(self):
        state = _make_full_state()
        result = build_result(state)
        assert result.costs is not None
        assert len(result.costs) > 0
        assert result.costs[0].kind in ("price", "tax", "fee", "debt", "reno")

    def test_edital_populated_from_state(self):
        state = _make_full_state()
        result = build_result(state)
        assert result.edital is not None
        assert result.edital.process != ""

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
        assert "costs" in parsed
        assert "edital" in parsed
        assert "riskDimensions" in parsed["viability"]
