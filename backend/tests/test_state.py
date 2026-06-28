from graph.state import AuctionState, PropertyMetadata, MarketResult, LegalResult


def test_auction_state_defaults():
    state = AuctionState()
    assert state.pdf_texts == ""
    assert state.pdf_sources == []
    assert state.property_metadata is None
    assert state.research_plan == ""
    assert state.market_result is None
    assert state.legal_result is None


def test_property_metadata_fields():
    meta = PropertyMetadata(
        address="Rua das Flores, 123, Centro, São Paulo - SP",
        property_type="Apartamento",
        area_m2=80.0,
        auction_price=350000.0,
        market_value_estimate=None,
        auction_date="15/06/2025",
        auction_type="Judicial",
        matricula="123.456",
        court_or_leiloeiro="João da Silva",
        city="São Paulo",
        neighborhood="Centro",
        state="SP",
    )
    assert meta.address == "Rua das Flores, 123, Centro, São Paulo - SP"
    assert meta.area_m2 == 80.0


def test_market_result_fields():
    result = MarketResult(
        price_per_m2_neighborhood=12000.0,
        price_per_m2_city=9500.0,
        comparable_properties=[],
        reform_estimate=25000.0,
        area_appreciation_1y=5.0,
        area_appreciation_3y=15.0,
        area_appreciation_5y=30.0,
        city_appreciation_1y=4.0,
        liquidity_days=45,
        tendencies="Mercado em alta com novos empreendimentos",
        discount_percentage=30.0,
        market_score=7,
        raw_findings="",
    )
    assert result.market_score == 7
    assert result.discount_percentage == 30.0


def test_legal_result_fields():
    result = LegalResult(
        registration_status="Registrado",
        liens=[],
        judicial_disputes=[],
        tax_debts_iptu="Nenhum débito encontrado",
        tax_debts_itbi="Nenhum débito encontrado",
        condominium_debts="N/A",
        federal_state_debts="Nenhum débito encontrado",
        zoning_compliance="Residencial - Conforme",
        construction_permits="Habite-se concedido",
        occupation_status="Desocupado",
        usufruct_rights="Nenhum",
        risk_level="low",
        risk_details="Nenhum risco significativo identificado",
        raw_findings="",
    )
    assert result.risk_level == "low"


def test_auction_state_has_discovery_fields():
    """AuctionState should include auction_url, downloaded_pdfs, and page_source_type."""
    state = AuctionState()
    assert state.auction_url == ""
    assert state.downloaded_pdfs == []
    assert state.page_source_type == ""


def test_auction_state_has_scoring_result_field():
    """AuctionState should include scoring_result (Optional[ScoringResult])."""
    from graph.contracts import ScoringResult, RiskFlags

    state = AuctionState()
    assert state.scoring_result is None

    # score field removed from ScoringResult — only risk + roi now
    scoring = ScoringResult(
        risk=RiskFlags(j="good", f="good", l="warn", o="good"),
        roi=38.0,
    )
    state = AuctionState(scoring_result=scoring)
    assert state.scoring_result.risk.j == "good"
    assert state.scoring_result.roi == 38.0
    assert not hasattr(state.scoring_result, "score")


def test_auction_state_has_result_json_field():
    """AuctionState should include result_json string."""
    state = AuctionState()
    assert state.result_json == ""

    state = AuctionState(result_json='{"risk": {"j": "good"}}')
    assert state.result_json == '{"risk": {"j": "good"}}'


def test_auction_state_no_report_html():
    """AuctionState should no longer have report_html field."""
    state = AuctionState()
    assert not hasattr(state, "report_html")

