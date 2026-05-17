# graph/workflow.py
"""LangGraph workflow assembly for auction property analysis.

Workflow:
    discovery -> planner -> [market, legal] (parallel) -> scoring -> output -> END
"""

from langgraph.graph import StateGraph, END

from loguru import logger

from graph.state import AuctionState
from graph.discovery import discovery_node
from graph.planner import planner_node
from graph.market import market_node
from graph.legal import legal_node
from graph.scoring import scoring_node
from graph.output import output_node


def create_workflow():
    """Create the LangGraph workflow for auction property analysis.

    Flow: discovery -> planner -> [market, legal] (parallel) -> scoring -> output -> END

    Returns:
        Compiled LangGraph StateGraph.
    """
    graph = StateGraph(AuctionState)

    # Add nodes
    graph.add_node("discovery", discovery_node)
    graph.add_node("planner", planner_node)
    graph.add_node("market", market_node)
    graph.add_node("legal", legal_node)
    graph.add_node("scoring", scoring_node)
    graph.add_node("output", output_node)

    # Set entry point
    graph.set_entry_point("discovery")

    # Discovery -> planner
    graph.add_edge("discovery", "planner")

    # Fan-out: planner -> market and planner -> legal (parallel)
    graph.add_edge("planner", "market")
    graph.add_edge("planner", "legal")

    # Fan-in: market -> scoring and legal -> scoring
    graph.add_edge("market", "scoring")
    graph.add_edge("legal", "scoring")

    # Scoring -> output
    graph.add_edge("scoring", "output")

    # Output -> END
    graph.add_edge("output", END)

    return graph.compile()


def run_analysis(initial_state):
    """Run the full analysis workflow.

    Args:
        initial_state: Starting state with pdf_texts and pdf_sources,
            or auction_url. Can be an AuctionState dataclass instance or a dict.

    Returns:
        Final state dict with all results including result_json.
    """
    workflow = create_workflow()

    logger.info("Starting auction analysis workflow")

    result = workflow.invoke(initial_state)

    logger.info("Workflow completed")

    return result
