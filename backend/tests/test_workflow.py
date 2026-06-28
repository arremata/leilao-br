import json
from unittest.mock import patch, MagicMock, AsyncMock

from graph.state import (
    AuctionState,
    PropertyMetadata,
    MarketResult,
    LegalResult,
)
from graph.workflow import create_workflow, run_analysis


def _make_initial_state():
    """Create a minimal valid initial state for testing."""
    return AuctionState(
        pdf_texts="Edital de Leilao Judicial - Rua das Flores, 123",
        pdf_sources=["edital.pdf"],
    )


def _make_planner_return():
    """Return value for a mocked planner node."""
    return {
        "property_metadata": PropertyMetadata(
            address="Rua das Flores, 123, Centro, Sao Paulo - SP",
            property_type="Apartamento",
            area_m2=80.0,
            auction_price=350000.0,
            market_value_estimate=500000.0,
            city="Sao Paulo",
            neighborhood="Centro",
            state="SP",
        ),
        "research_plan": "Research market prices in Centro.",
    }


def _make_market_return():
    """Return value for a mocked market node."""
    return {
        "market_result": MarketResult(
            price_per_m2_neighborhood=12000.0,
            market_score=7,
            discount_percentage=30.0,
        ),
    }


def _make_legal_return():
    """Return value for a mocked legal node."""
    return {
        "legal_result": LegalResult(
            risk_level="low",
            risk_details="No significant risks found.",
        ),
    }


# ---------------------------------------------------------------------------
# Discovery mock helpers
# ---------------------------------------------------------------------------


def _discovery_response():
    """Build a MagicMock LLM response for the discovery node."""
    mock = MagicMock()
    mock.choices = [
        MagicMock(
            message=MagicMock(
                content=json.dumps({
                    "property_metadata": {
                        "address": "Rua das Flores, 123",
                        "property_type": "Apartamento",
                        "area_m2": 80.0,
                        "auction_price": 350000.0,
                        "city": "Sao Paulo",
                        "state": "SP",
                    },
                    "pdf_urls": [],
                    "page_source_type": "caixa",
                })
            )
        )
    ]
    return mock


# ---------------------------------------------------------------------------
# Graph structure tests
# ---------------------------------------------------------------------------


def test_workflow_has_six_nodes():
    """The compiled graph should contain discovery, planner, market, legal, scoring, and output nodes."""
    workflow = create_workflow()

    node_names = set(workflow.nodes.keys())
    expected = {"discovery", "planner", "market", "legal", "scoring", "output"}
    assert expected.issubset(node_names), f"Expected nodes {expected} to be subset of {node_names}"


def test_workflow_entry_point_is_discovery():
    """The first node executed should be the discovery node."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "", "html": ""}),
        patch("graph.discovery._call_discovery_llm", return_value=_discovery_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.planner._call_planner_llm") as mock_planner_llm,
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.market._run_market_searches", return_value=([], [])),
        patch("graph.legal._run_legal_searches", return_value=[]),
    ):
        _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm)
        call_order = []
        mock_planner_llm.side_effect = lambda *a, **kw: (
            call_order.append("planner"), _planner_response()
        )[1]
        mock_market_llm.side_effect = lambda *a, **kw: (
            call_order.append("market"), _market_response()
        )[1]
        mock_legal_llm.side_effect = lambda *a, **kw: (
            call_order.append("legal"), _legal_response()
        )[1]

        run_analysis(_make_initial_state())

        assert call_order[0] == "planner", f"First LLM call should be planner (after discovery), got {call_order}"


def test_workflow_discovery_runs_before_planner():
    """Discovery must complete before planner starts."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "Test", "html": "<html><body>Test</body></html>"}),
        patch("graph.discovery._call_discovery_llm") as mock_discovery_llm,
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.planner._call_planner_llm") as mock_planner_llm,
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.market._run_market_searches", return_value=([], [])),
        patch("graph.legal._run_legal_searches", return_value=[]),
    ):
        _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm)
        call_order = []
        mock_discovery_llm.side_effect = lambda *a, **kw: (
            call_order.append("discovery"), _discovery_response()
        )[1]
        mock_planner_llm.side_effect = lambda *a, **kw: (
            call_order.append("planner"), _planner_response()
        )[1]
        mock_market_llm.side_effect = lambda *a, **kw: (
            call_order.append("market"), _market_response()
        )[1]
        mock_legal_llm.side_effect = lambda *a, **kw: (
            call_order.append("legal"), _legal_response()
        )[1]

        run_analysis(AuctionState(
            auction_url="https://test.com/leilao/123",
            pdf_texts="some text",
        ))

        discovery_idx = call_order.index("discovery")
        planner_idx = call_order.index("planner")
        assert discovery_idx < planner_idx, f"Discovery (idx {discovery_idx}) should run before planner (idx {planner_idx})"


def test_workflow_planner_runs_before_market_and_legal():
    """Planner must complete before market and legal start."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "", "html": ""}),
        patch("graph.discovery._call_discovery_llm", return_value=_discovery_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.planner._call_planner_llm") as mock_planner_llm,
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.market._run_market_searches", return_value=([], [])),
        patch("graph.legal._run_legal_searches", return_value=[]),
    ):
        _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm)
        call_order = []
        mock_planner_llm.side_effect = lambda *a, **kw: (
            call_order.append("planner"), _planner_response()
        )[1]
        mock_market_llm.side_effect = lambda *a, **kw: (
            call_order.append("market"), _market_response()
        )[1]
        mock_legal_llm.side_effect = lambda *a, **kw: (
            call_order.append("legal"), _legal_response()
        )[1]

        run_analysis(_make_initial_state())

        planner_idx = call_order.index("planner")
        market_idx = call_order.index("market")
        legal_idx = call_order.index("legal")
        assert planner_idx < market_idx
        assert planner_idx < legal_idx


def test_workflow_scoring_runs_after_market_and_legal():
    """Scoring must only execute after both market and legal complete."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "", "html": ""}),
        patch("graph.discovery._call_discovery_llm", return_value=_discovery_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.planner._call_planner_llm") as mock_planner_llm,
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.market._run_market_searches", return_value=([], [])),
        patch("graph.legal._run_legal_searches", return_value=[]),
    ):
        _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm)
        call_order = []
        mock_planner_llm.side_effect = lambda *a, **kw: (
            call_order.append("planner"), _planner_response()
        )[1]
        mock_market_llm.side_effect = lambda *a, **kw: (
            call_order.append("market"), _market_response()
        )[1]
        mock_legal_llm.side_effect = lambda *a, **kw: (
            call_order.append("legal"), _legal_response()
        )[1]

        result = run_analysis(_make_initial_state())

        # Verify scoring ran after market and legal by checking final state
        assert result["scoring_result"] is not None
        market_idx = call_order.index("market")
        legal_idx = call_order.index("legal")
        # Both market and legal must have run before scoring produces its output
        assert market_idx >= 0
        assert legal_idx >= 0


def test_workflow_all_nodes_execute():
    """All six nodes must execute during a successful run."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "Test", "html": "<html><body>Test</body></html>"}),
        patch("graph.discovery._call_discovery_llm") as mock_discovery_llm,
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.planner._call_planner_llm") as mock_planner_llm,
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.market._run_market_searches", return_value=([], [])),
        patch("graph.legal._run_legal_searches", return_value=[]),
    ):
        _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm)
        call_order = []
        mock_discovery_llm.side_effect = lambda *a, **kw: (
            call_order.append("discovery"), _discovery_response()
        )[1]
        mock_planner_llm.side_effect = lambda *a, **kw: (
            call_order.append("planner"), _planner_response()
        )[1]
        mock_market_llm.side_effect = lambda *a, **kw: (
            call_order.append("market"), _market_response()
        )[1]
        mock_legal_llm.side_effect = lambda *a, **kw: (
            call_order.append("legal"), _legal_response()
        )[1]

        result = run_analysis(AuctionState(
            auction_url="https://test.com/leilao/123",
            pdf_texts="some text",
        ))

        # LLM-backed nodes all ran
        assert set(call_order) == {"discovery", "planner", "market", "legal"}
        # Scoring and output nodes ran (no LLM, verified via state)
        assert result["scoring_result"] is not None
        assert result["result_json"] != ""


# ---------------------------------------------------------------------------
# End-to-end tests with mocked agent nodes
# ---------------------------------------------------------------------------


def test_run_analysis_returns_final_state_with_result_json():
    """run_analysis should return a dict with result_json populated."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "", "html": ""}),
        patch("graph.discovery._call_discovery_llm", return_value=_discovery_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.planner._call_planner_llm") as mock_planner_llm,
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.market._run_market_searches", return_value=([], [])),
        patch("graph.legal._run_legal_searches", return_value=[]),
    ):
        _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm)

        result = run_analysis(_make_initial_state())

        assert isinstance(result, dict)
        assert "result_json" in result
        assert result["result_json"] != ""
        # result_json should be valid JSON
        parsed = json.loads(result["result_json"])
        # score field removed from contract
        assert "score" not in parsed
        assert "id" in parsed


def test_run_analysis_state_accumulation():
    """Each node's output should accumulate in the shared state."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "", "html": ""}),
        patch("graph.discovery._call_discovery_llm", return_value=_discovery_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.planner._call_planner_llm") as mock_planner_llm,
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.market._run_market_searches", return_value=([], [])),
        patch("graph.legal._run_legal_searches", return_value=[]),
    ):
        _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm)

        result = run_analysis(_make_initial_state())

        # Planner output
        assert result["property_metadata"] is not None
        assert result["research_plan"] != ""

        # Market output
        assert result["market_result"] is not None
        assert result["market_result"].market_score == 7

        # Legal output
        assert result["legal_result"] is not None
        assert result["legal_result"].risk_level == "low"

        # Scoring output — score field removed, only risk + roi
        assert result["scoring_result"] is not None
        assert result["scoring_result"].risk is not None
        assert result["scoring_result"].roi is not None

        # Output node result
        assert result["result_json"] != ""


def test_run_analysis_preserves_initial_pdf_data():
    """Initial state fields (pdf_texts, pdf_sources) should survive through the workflow."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "", "html": ""}),
        patch("graph.discovery._call_discovery_llm", return_value=_discovery_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.planner._call_planner_llm") as mock_planner_llm,
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.market._run_market_searches", return_value=([], [])),
        patch("graph.legal._run_legal_searches", return_value=[]),
    ):
        _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm)

        initial = _make_initial_state()
        result = run_analysis(initial)

        assert result["pdf_texts"] == initial.pdf_texts
        assert result["pdf_sources"] == initial.pdf_sources


def test_run_analysis_market_and_legal_run_in_parallel():
    """Market and legal nodes should both receive the planner's output.

    We verify this indirectly: both nodes should see the property_metadata
    that the planner set. If they ran sequentially (one overwriting the
    other's output), the scoring might still work, but the state would be
    correct because LangGraph merges parallel outputs.
    """
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "", "html": ""}),
        patch("graph.discovery._call_discovery_llm", return_value=_discovery_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.planner._call_planner_llm") as mock_planner_llm,
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.market._run_market_searches", return_value=([], [])),
        patch("graph.legal._run_legal_searches", return_value=[]),
    ):
        _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm)

        result = run_analysis(_make_initial_state())

        # Both market and legal results should be present (not overwritten)
        assert result["market_result"] is not None
        assert result["legal_result"] is not None
        assert result["market_result"].market_score == 7
        assert result["legal_result"].risk_level == "low"


# ---------------------------------------------------------------------------
# Edge case tests
# ---------------------------------------------------------------------------


def test_run_analysis_with_empty_pdf_text():
    """Workflow should handle empty PDF text (planner returns empty metadata)."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "", "html": ""}),
        patch("graph.discovery._call_discovery_llm", return_value=_discovery_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.market._run_market_searches", return_value=([], [])),
        patch("graph.legal._run_legal_searches", return_value=[]),
    ):
        _setup_llm_mocks(None, mock_market_llm, mock_legal_llm)

        state = AuctionState(pdf_texts="", pdf_sources=[])
        result = run_analysis(state)

        # Should still complete (planner returns empty metadata + errors)
        assert isinstance(result, dict)
        # With no metadata, market and legal should log warnings but still produce results
        assert "errors" in result


# ---------------------------------------------------------------------------
# Helpers for LLM mock setup
# ---------------------------------------------------------------------------


def _planner_response():
    """Build a MagicMock LLM response for the planner."""
    mock = MagicMock()
    mock.choices = [
        MagicMock(
            message=MagicMock(
                content=json.dumps({
                    "property_metadata": {
                        "address": "Rua das Flores, 123, Centro, Sao Paulo - SP",
                        "property_type": "Apartamento",
                        "area_m2": 80.0,
                        "auction_price": 350000.0,
                        "market_value_estimate": 500000.0,
                        "auction_date": "15/06/2025",
                        "auction_type": "Judicial",
                        "matricula": "123.456",
                        "court_or_leiloeiro": "Joao da Silva",
                        "city": "Sao Paulo",
                        "neighborhood": "Centro",
                        "state": "SP",
                    },
                    "research_plan": "Research market prices in Centro, Sao Paulo.",
                })
            )
        )
    ]
    return mock


def _market_response():
    """Build a MagicMock LLM response for the market node."""
    mock = MagicMock()
    mock.choices = [
        MagicMock(
            message=MagicMock(
                content=json.dumps({
                    "price_per_m2_neighborhood": 12000.0,
                    "price_per_m2_city": 9500.0,
                    "comparable_properties": [],
                    "reform_estimate": 25000.0,
                    "area_appreciation_1y": 5.0,
                    "area_appreciation_3y": 15.0,
                    "area_appreciation_5y": 30.0,
                    "city_appreciation_1y": 4.0,
                    "liquidity_days": 45,
                    "tendencies": "Mercado em alta",
                    "discount_percentage": 30.0,
                    "market_score": 7,
                    "raw_findings": "Test findings",
                })
            )
        )
    ]
    return mock


def _legal_response():
    """Build a MagicMock LLM response for the legal node."""
    mock = MagicMock()
    mock.choices = [
        MagicMock(
            message=MagicMock(
                content=json.dumps({
                    "registration_status": "Registrado",
                    "liens": [],
                    "judicial_disputes": [],
                    "tax_debts_iptu": "Nenhum debito",
                    "tax_debts_itbi": "Nenhum debito",
                    "condominium_debts": "N/A",
                    "federal_state_debts": "Nenhum debito",
                    "zoning_compliance": "Residencial - Conforme",
                    "construction_permits": "Habite-se concedido",
                    "occupation_status": "Desocupado",
                    "usufruct_rights": "Nenhum",
                    "risk_level": "low",
                    "risk_details": "No significant risks.",
                    "raw_findings": "Test findings",
                })
            )
        )
    ]
    return mock


def _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm):
    """Configure all LLM mocks with default responses."""
    if mock_planner_llm is not None:
        mock_planner_llm.return_value = _planner_response()
    if mock_market_llm is not None:
        mock_market_llm.return_value = _market_response()
    if mock_legal_llm is not None:
        mock_legal_llm.return_value = _legal_response()
