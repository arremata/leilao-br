"""On-demand enrichment: reuse the existing market/legal/scoring/output nodes
on already-structured catalog data, skipping discovery and planner (which exist
only to extract structure from raw HTML/PDF)."""

from __future__ import annotations

from loguru import logger

from graph.state import AuctionState, PropertyMetadata, LegalResult
from graph.market import market_node
from graph.legal import legal_node
from graph.scoring import scoring_node
from graph.output import build_result
from graph.contracts import AuctionPropertyResult

PIPELINE_VERSION = "v1"

# Legal analysis is temporarily disabled: the Tractian LLM proxy 502s on the
# legal call, wasting ~90s per analysis retrying a doomed request. Flip back to
# True once the proxy/legal issue is fixed — the node is wired up and best-effort
# (a transient failure falls back to an empty LegalResult, see below).
LEGAL_NODE_ENABLED = False


def metadata_from_property(prop) -> PropertyMetadata:
    """Build the graph's PropertyMetadata directly from a catalog Property row."""
    return PropertyMetadata(
        address=prop.address or "",
        property_type=prop.property_type or "",
        area_m2=prop.area_m2 or 0.0,
        auction_price=prop.preco or 0.0,
        market_value_estimate=prop.avaliacao,
        auction_type=prop.modalidade or "",
        city=prop.city or "",
        neighborhood=prop.neighborhood or "",
        state=prop.uf or "",
        beds=prop.beds,
        photo_url=prop.photo_url or "",
    )


def run_structured_enrichment(
    metadata: PropertyMetadata, pdf_texts: str = "", auction_url: str = "",
) -> AuctionPropertyResult:
    state = AuctionState(
        property_metadata=metadata, pdf_texts=pdf_texts, auction_url=auction_url,
    )
    state.market_result = market_node(state)["market_result"]
    if LEGAL_NODE_ENABLED:
        # Best-effort: a transient LLM/proxy failure must not sink the whole
        # analysis when market + scoring succeeded. Fall back to an empty
        # LegalResult so downstream nodes still run.
        try:
            state.legal_result = legal_node(state)["legal_result"]
        except Exception as exc:  # noqa: BLE001 — degrade gracefully on any legal failure
            logger.warning(f"Legal node failed, continuing without legal analysis: {exc}")
            state.legal_result = LegalResult()
    else:
        state.legal_result = LegalResult()
    state.scoring_result = scoring_node(state)["scoring_result"]
    return build_result(state)
