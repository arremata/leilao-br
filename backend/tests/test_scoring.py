# tests/test_scoring.py
from graph.state import AuctionState, PropertyMetadata, MarketResult, LegalResult
from graph.scoring import scoring_node, compute_score, compute_risk_flags, compute_roi


def _make_state(**overrides):
    defaults = dict(
        pdf_texts="Edital text",
        pdf_sources=["edital.pdf"],
        property_metadata=PropertyMetadata(
            address="Rua das Flores, 123, Centro, Sao Paulo - SP",
            property_type="Apartamento",
            area_m2=80.0,
            auction_price=350000.0,
            market_value_estimate=500000.0,
            auction_date="15/06/2025",
            auction_type="Judicial",
            court_or_leiloeiro="Zukerman Leilões",
            city="Sao Paulo",
            neighborhood="Centro",
            state="SP",
        ),
        market_result=MarketResult(
            price_per_m2_neighborhood=12000.0,
            price_per_m2_city=9500.0,
            reform_estimate=25000.0,
            discount_percentage=30.0,
            market_score=7,
            liquidity_days=45,
        ),
        legal_result=LegalResult(
            risk_level="low",
            risk_details="No significant risks",
            occupation_status="Desocupado",
            tax_debts_iptu="Nenhum débito",
            condominium_debts="N/A",
            federal_state_debts="Nenhum débito",
        ),
    )
    defaults.update(overrides)
    return AuctionState(**defaults)


class TestComputeScore:
    def test_score_neutral_inputs(self):
        """With market_score=0, discount=0, medium risk, ocupado, mid liquidity, adjustments net to -5."""
        score = compute_score(
            market_score=0, discount_percentage=0.0,
            risk_level="medium", occupation="ocupado", liquidity_days=90,
        )
        # 50 + 0 + 0 + 0 + (-5) + 0 = 45
        assert score == 45

    def test_score_high_market_good_legal(self):
        score = compute_score(
            market_score=8, discount_percentage=42.0,
            risk_level="low", occupation="desocupado", liquidity_days=45,
        )
        # 50 + 24 + 12.6 + 15 + 10 + 5 = 116.6 -> 100
        assert score == 100

    def test_score_critical_legal_disputado(self):
        score = compute_score(
            market_score=2, discount_percentage=10.0,
            risk_level="critical", occupation="disputado", liquidity_days=150,
        )
        # 50 + 6 + 3 - 30 - 15 - 5 = 9
        assert score == 9

    def test_score_clamped_to_0(self):
        score = compute_score(
            market_score=1, discount_percentage=0.0,
            risk_level="critical", occupation="disputado", liquidity_days=150,
        )
        assert score >= 0

    def test_score_clamped_to_100(self):
        score = compute_score(
            market_score=10, discount_percentage=50.0,
            risk_level="low", occupation="desocupado", liquidity_days=30,
        )
        assert score == 100


class TestComputeRiskFlags:
    def test_good_flags(self):
        flags = compute_risk_flags(
            risk_level="low", tax_debts_iptu="", condominium_debts="",
            federal_state_debts="", liquidity_days=30, occupation_status="Desocupado",
        )
        assert flags.j == "good"
        assert flags.f == "good"
        assert flags.l == "good"
        assert flags.o == "good"

    def test_juridico_medium(self):
        flags = compute_risk_flags(
            risk_level="medium", tax_debts_iptu="", condominium_debts="",
            federal_state_debts="", liquidity_days=30, occupation_status="Desocupado",
        )
        assert flags.j == "warn"

    def test_juridico_high_or_critical(self):
        for level in ("high", "critical"):
            flags = compute_risk_flags(
                risk_level=level, tax_debts_iptu="", condominium_debts="",
                federal_state_debts="", liquidity_days=30, occupation_status="Desocupado",
            )
            assert flags.j == "bad"

    def test_financeiro_warn_iptu_only(self):
        flags = compute_risk_flags(
            risk_level="low", tax_debts_iptu="R$ 4.200 em aberto",
            condominium_debts="N/A", federal_state_debts="Nenhum débito",
            liquidity_days=30, occupation_status="Desocupado",
        )
        assert flags.f == "warn"

    def test_financeiro_bad_condominium(self):
        flags = compute_risk_flags(
            risk_level="low", tax_debts_iptu="",
            condominium_debts="R$ 18.400 conforme certidão",
            federal_state_debts="", liquidity_days=30, occupation_status="Desocupado",
        )
        assert flags.f == "bad"

    def test_financeiro_bad_federal_debts(self):
        flags = compute_risk_flags(
            risk_level="low", tax_debts_iptu="", condominium_debts="N/A",
            federal_state_debts="Dívida ativa R$ 50.000",
            liquidity_days=30, occupation_status="Desocupado",
        )
        assert flags.f == "bad"

    def test_liquidez_good(self):
        flags = compute_risk_flags(
            risk_level="low", tax_debts_iptu="", condominium_debts="",
            federal_state_debts="", liquidity_days=59, occupation_status="Desocupado",
        )
        assert flags.l == "good"

    def test_liquidez_warn(self):
        flags = compute_risk_flags(
            risk_level="low", tax_debts_iptu="", condominium_debts="",
            federal_state_debts="", liquidity_days=90, occupation_status="Desocupado",
        )
        assert flags.l == "warn"

    def test_liquidez_bad(self):
        flags = compute_risk_flags(
            risk_level="low", tax_debts_iptu="", condominium_debts="",
            federal_state_debts="", liquidity_days=121, occupation_status="Desocupado",
        )
        assert flags.l == "bad"

    def test_ocupacao_good(self):
        flags = compute_risk_flags(
            risk_level="low", tax_debts_iptu="", condominium_debts="",
            federal_state_debts="", liquidity_days=30, occupation_status="Desocupado",
        )
        assert flags.o == "good"

    def test_ocupacao_warn(self):
        flags = compute_risk_flags(
            risk_level="low", tax_debts_iptu="", condominium_debts="",
            federal_state_debts="", liquidity_days=30, occupation_status="Ocupado pelo proprietário",
        )
        assert flags.o == "warn"

    def test_ocupacao_bad(self):
        for status in ("Disputado", "Posseiro", "Invasor"):
            flags = compute_risk_flags(
                risk_level="low", tax_debts_iptu="", condominium_debts="",
                federal_state_debts="", liquidity_days=30, occupation_status=status,
            )
            assert flags.o == "bad"


class TestComputeROI:
    def test_roi_basic(self):
        roi = compute_roi(min_bid=312000.0, market_value=540000.0, reform_estimate=36000.0)
        # fees = 312000 * 0.078 = 24336
        # total_cost = 312000 + 36000 + 24336 = 372336
        # roi = ((540000 - 372336) / 372336) * 100 = 45.04...
        assert abs(roi - 45.04) < 0.1

    def test_roi_zero_min_bid(self):
        roi = compute_roi(min_bid=0.0, market_value=500000.0, reform_estimate=0.0)
        assert roi == 0.0


class TestScoringNode:
    def test_scoring_node_returns_scoring_result(self):
        state = _make_state()
        result = scoring_node(state)
        assert "scoring_result" in result
        assert result["scoring_result"].score > 0
        assert result["scoring_result"].risk is not None
        assert result["scoring_result"].roi > 0

    def test_scoring_node_no_metadata(self):
        state = _make_state(property_metadata=None)
        result = scoring_node(state)
        assert "scoring_result" in result
        assert result["scoring_result"].score == 0

    def test_scoring_node_no_market_or_legal(self):
        state = _make_state(market_result=None, legal_result=None)
        result = scoring_node(state)
        assert "scoring_result" in result
        assert result["scoring_result"].score < 50
