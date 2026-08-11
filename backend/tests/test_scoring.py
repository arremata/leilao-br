from graph.state import AuctionState, LegalResult, MarketResult, PropertyMetadata
from graph.scoring import compute_risk_flags, compute_roi, scoring_node


def _make_state(**overrides):
    defaults = dict(
        property_metadata=PropertyMetadata(
            address="Rua das Flores, 123", area_m2=80.0,
            auction_price=350_000.0, itbi_rate=0.03, commission_rate=0.05,
        ),
        market_result=MarketResult(price_per_m2_neighborhood=12_000.0),
        legal_result=LegalResult(
            risk_level="low", tax_debts_iptu="Nenhum débito",
            condominium_debts="N/A", federal_state_debts="Nenhum débito",
        ),
    )
    defaults.update(overrides)
    return AuctionState(**defaults)


class TestComputeRiskFlags:
    def test_good_flags(self):
        flags = compute_risk_flags("low", "", "", "")
        assert flags.j == "good"
        assert flags.f == "good"

    def test_juridico_levels(self):
        assert compute_risk_flags("medium", "", "", "").j == "warn"
        assert compute_risk_flags("high", "", "", "").j == "bad"
        assert compute_risk_flags("critical", "", "", "").j == "bad"

    def test_financeiro_warn_for_iptu(self):
        flags = compute_risk_flags("low", "R$ 4.200 em aberto", "N/A", "")
        assert flags.f == "warn"

    def test_financeiro_bad_for_condo_or_federal_debt(self):
        assert compute_risk_flags("low", "", "R$ 18.400", "").f == "bad"
        assert compute_risk_flags("low", "", "N/A", "Dívida ativa R$ 50.000").f == "bad"


class TestComputeROI:
    def test_roi_uses_only_evidence_backed_fees(self):
        roi = compute_roi(min_bid=100_000.0, market_value=150_000.0, fee_rate=0.08)
        assert roi == 38.89

    def test_roi_without_known_fees(self):
        assert compute_roi(min_bid=100_000.0, market_value=150_000.0) == 50.0

    def test_roi_zero_min_bid(self):
        assert compute_roi(min_bid=0.0, market_value=500_000.0) == 0.0


class TestScoringNode:
    def test_scoring_node_returns_scoring_result(self):
        result = scoring_node(_make_state())
        assert result["scoring_result"].risk.j == "good"
        assert result["scoring_result"].roi > 0

    def test_scoring_node_no_metadata(self):
        result = scoring_node(_make_state(property_metadata=None))
        assert result["scoring_result"].risk.j == "bad"
        assert result["scoring_result"].roi == 0.0

    def test_scoring_node_no_market_or_legal(self):
        result = scoring_node(_make_state(market_result=None, legal_result=None))
        assert result["scoring_result"].risk.j == "bad"
        assert result["scoring_result"].roi == -100.0
