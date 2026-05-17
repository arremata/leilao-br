import json
from unittest.mock import patch, MagicMock, AsyncMock

from graph.state import AuctionState, PropertyMetadata
from graph.legal import legal_node


def _make_state(**overrides):
    """Helper to build an AuctionState with sensible defaults."""
    defaults = dict(
        pdf_texts="Edital de Leilao Judicial\nMatricula: 123.456\nPenhora: Nenhuma",
        pdf_sources=["edital.pdf"],
        property_metadata=PropertyMetadata(
            address="Rua das Flores, 123, Centro, Sao Paulo - SP",
            property_type="Apartamento",
            area_m2=80.0,
            auction_price=350000.0,
            auction_date="15/06/2025",
            auction_type="Judicial",
            matricula="123.456",
            city="Sao Paulo",
            neighborhood="Centro",
            state="SP",
        ),
        research_plan="Check legal status of matricula 123.456",
    )
    defaults.update(overrides)
    return AuctionState(**defaults)


def _mock_llm_response(parsed_dict: dict) -> MagicMock:
    """Build a mock LiteLLM response whose content is the JSON of parsed_dict."""
    mock = MagicMock()
    mock.choices = [
        MagicMock(
            message=MagicMock(content=json.dumps(parsed_dict))
        )
    ]
    return mock


LOW_RISK_RESPONSE = {
    "registration_status": "Registrado",
    "liens": [],
    "judicial_disputes": [],
    "tax_debts_iptu": "Nenhum debito",
    "tax_debts_itbi": "Nenhum debito",
    "condominium_debts": "N/A",
    "federal_state_debts": "Nenhum debito",
    "zoning_compliance": "Residencial conforme",
    "construction_permits": "Habite-se OK",
    "occupation_status": "Desocupado",
    "usufruct_rights": "Nenhum",
    "risk_level": "low",
    "risk_details": "Nenhum risco significativo",
    "raw_findings": "Property clean",
}

HIGH_RISK_RESPONSE = {
    "registration_status": "Registrado com pendencias",
    "liens": ["Penhora judicial R$ 200.000", "Hipoteca bancaria"],
    "judicial_disputes": ["Execucao fiscal", "Acao reivindicatoria"],
    "tax_debts_iptu": "Debito de R$ 15.000",
    "tax_debts_itbi": "Pendente",
    "condominium_debts": "Debito R$ 8.000",
    "federal_state_debts": "Divida Ativa Federal",
    "zoning_compliance": "Irregular",
    "construction_permits": "Sem habite-se",
    "occupation_status": "Posseiro",
    "usufruct_rights": "Usufruto vitalicio",
    "risk_level": "critical",
    "risk_details": "Multiplos onus e acoes judiciais",
    "raw_findings": "Multiple issues found",
}


def test_legal_node_returns_legal_result_with_low_risk():
    """legal_node should return a LegalResult with correct fields for a clean property."""
    state = _make_state()
    mock_search_results = [
        {"title": "Certidao", "url": "http://x", "content": "Matricula 123.456 - Sem onus"}
    ]

    with patch("graph.legal._run_legal_searches", new_callable=AsyncMock, return_value=mock_search_results), \
         patch("graph.legal._call_legal_llm", return_value=_mock_llm_response(LOW_RISK_RESPONSE)):
        result = legal_node(state)

    assert "legal_result" in result
    legal = result["legal_result"]
    assert legal.risk_level == "low"
    assert legal.registration_status == "Registrado"
    assert legal.liens == []
    assert legal.judicial_disputes == []
    assert legal.occupation_status == "Desocupado"


def test_legal_node_returns_critical_risk():
    """legal_node should return a LegalResult with critical risk for a problematic property."""
    state = _make_state()
    mock_search_results = [
        {"title": "Onus", "url": "http://y", "content": "Penhora e hipoteca encontradas"}
    ]

    with patch("graph.legal._run_legal_searches", new_callable=AsyncMock, return_value=mock_search_results), \
         patch("graph.legal._call_legal_llm", return_value=_mock_llm_response(HIGH_RISK_RESPONSE)):
        result = legal_node(state)

    legal = result["legal_result"]
    assert legal.risk_level == "critical"
    assert len(legal.liens) == 2
    assert len(legal.judicial_disputes) == 2
    assert legal.occupation_status == "Posseiro"


def test_legal_node_no_metadata():
    """legal_node should return critical risk when no property metadata is available."""
    state = AuctionState(
        pdf_texts="Some text",
        pdf_sources=["doc.pdf"],
        property_metadata=None,
    )

    with patch("graph.legal._run_legal_searches", new_callable=AsyncMock), \
         patch("graph.legal._call_legal_llm"):
        result = legal_node(state)

    assert "legal_result" in result
    assert result["legal_result"].risk_level == "critical"
    assert "errors" in result
    assert len(result["errors"]) > 0


def test_legal_node_invalid_json_response():
    """legal_node should handle invalid JSON from the LLM gracefully."""
    state = _make_state()
    mock_search_results = []

    bad_response = MagicMock()
    bad_response.choices = [MagicMock(message=MagicMock(content="This is not valid JSON"))]

    with patch("graph.legal._run_legal_searches", new_callable=AsyncMock, return_value=mock_search_results), \
         patch("graph.legal._call_legal_llm", return_value=bad_response):
        result = legal_node(state)

    legal = result["legal_result"]
    assert legal.risk_level == "critical"
    assert "Parse error" in legal.risk_details
    assert legal.raw_findings == "This is not valid JSON"


def test_legal_node_calls_searches_with_metadata():
    """legal_node should pass property metadata to search queries."""
    state = _make_state()
    mock_search_results = [{"title": "t", "url": "http://u", "content": "c"}]

    with patch("graph.legal._run_legal_searches", new_callable=AsyncMock, return_value=mock_search_results) as mock_search, \
         patch("graph.legal._call_legal_llm", return_value=_mock_llm_response(LOW_RISK_RESPONSE)):
        legal_node(state)

    mock_search.assert_called_once_with(state.property_metadata)


def test_legal_node_passes_pdf_texts_to_llm():
    """legal_node should include pdf_texts in the LLM call."""
    state = _make_state(pdf_texts="Important legal text about penhoras")
    mock_search_results = []

    with patch("graph.legal._run_legal_searches", new_callable=AsyncMock, return_value=mock_search_results), \
         patch("graph.legal._call_legal_llm", return_value=_mock_llm_response(LOW_RISK_RESPONSE)) as mock_llm:
        legal_node(state)

    call_args = mock_llm.call_args
    # The second positional arg is pdf_texts
    assert call_args[0][1] == "Important legal text about penhoras"


def test_legal_node_search_results_passed_to_llm():
    """legal_node should pass search results to the LLM call."""
    state = _make_state()
    search_results = [
        {"title": "Certidao Onus", "url": "http://example.com", "content": "Sem onus encontrado"}
    ]

    with patch("graph.legal._run_legal_searches", new_callable=AsyncMock, return_value=search_results), \
         patch("graph.legal._call_legal_llm", return_value=_mock_llm_response(LOW_RISK_RESPONSE)) as mock_llm:
        legal_node(state)

    call_args = mock_llm.call_args
    # Third positional arg is search_results
    assert call_args[0][2] == search_results


def test_legal_node_empty_pdf_texts():
    """legal_node should work even with empty pdf_texts."""
    state = _make_state(pdf_texts="")
    mock_search_results = [
        {"title": "Result", "url": "http://z", "content": "Some data"}
    ]

    with patch("graph.legal._run_legal_searches", new_callable=AsyncMock, return_value=mock_search_results), \
         patch("graph.legal._call_legal_llm", return_value=_mock_llm_response(LOW_RISK_RESPONSE)):
        result = legal_node(state)

    assert result["legal_result"].risk_level == "low"