from unittest.mock import patch

from graph.contracts import RiskFlags, ScoringResult
from graph.state import AuctionState, LegalResult, MarketResult, PropertyMetadata
from graph.workflow import create_workflow, run_analysis


def test_workflow_has_expected_topology():
    graph = create_workflow().get_graph()
    edges = {(edge.source, edge.target) for edge in graph.edges}
    assert ("__start__", "discovery") in edges
    assert ("discovery", "planner") in edges
    assert ("planner", "market") in edges
    assert ("planner", "legal") in edges
    assert ("market", "scoring") in edges
    assert ("legal", "scoring") in edges
    assert ("scoring", "output") in edges
    assert ("output", "__end__") in edges


def test_run_analysis_accumulates_parallel_results():
    calls = []

    def discovery(state):
        calls.append("discovery")
        return {"pdf_texts": "edital"}

    def planner(state):
        calls.append("planner")
        return {"property_metadata": PropertyMetadata(
            address="Rua A", area_m2=50, auction_price=100_000,
        )}

    def market(state):
        calls.append("market")
        return {"market_result": MarketResult(price_per_m2_neighborhood=3_000)}

    def legal(state):
        calls.append("legal")
        return {"legal_result": LegalResult(risk_level="low")}

    def scoring(state):
        calls.append("scoring")
        assert state.market_result is not None
        assert state.legal_result is not None
        return {"scoring_result": ScoringResult(
            risk=RiskFlags(j="good", f="good"), roi=50,
        )}

    def output(state):
        calls.append("output")
        return {"result_json": '{"ok": true}'}

    with (
        patch("graph.workflow.discovery_node", discovery),
        patch("graph.workflow.planner_node", planner),
        patch("graph.workflow.market_node", market),
        patch("graph.workflow.legal_node", legal),
        patch("graph.workflow.scoring_node", scoring),
        patch("graph.workflow.output_node", output),
    ):
        result = run_analysis(AuctionState())

    assert result["result_json"] == '{"ok": true}'
    assert calls[0:2] == ["discovery", "planner"]
    assert set(calls[2:4]) == {"market", "legal"}
    assert calls[-2:] == ["scoring", "output"]


def test_run_analysis_preserves_initial_input():
    initial = AuctionState(auction_url="https://example.com", pdf_texts="original")
    with (
        patch("graph.workflow.discovery_node", lambda state: {}),
        patch("graph.workflow.planner_node", lambda state: {}),
        patch("graph.workflow.market_node", lambda state: {"market_result": MarketResult()}),
        patch("graph.workflow.legal_node", lambda state: {"legal_result": LegalResult()}),
        patch("graph.workflow.scoring_node", lambda state: {"scoring_result": ScoringResult(
            risk=RiskFlags(j="bad", f="good"), roi=0,
        )}),
        patch("graph.workflow.output_node", lambda state: {"result_json": "{}"}),
    ):
        result = run_analysis(initial)
    assert result["auction_url"] == "https://example.com"
    assert result["pdf_texts"] == "original"
