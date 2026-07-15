"""On-demand enrichment: reuse the existing market/legal/scoring/output nodes
on already-structured catalog data, skipping discovery and planner (which exist
only to extract structure from raw HTML/PDF)."""

from __future__ import annotations

from graph.state import AuctionState, PropertyMetadata
from graph.market import market_node
from graph.legal import legal_node
from graph.scoring import scoring_node
from graph.output import build_result
from graph.contracts import AuctionPropertyResult

PIPELINE_VERSION = "v1"


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
    state.legal_result = legal_node(state)["legal_result"]
    state.scoring_result = scoring_node(state)["scoring_result"]
    return build_result(state)
