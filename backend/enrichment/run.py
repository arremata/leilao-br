"""On-demand enrichment: reuse the existing market/legal/scoring/output nodes
on already-structured catalog data, skipping discovery and planner (which exist
only to extract structure from raw HTML/PDF)."""

from __future__ import annotations

import re
from loguru import logger

from graph.state import AuctionState, ComparableProperty, PropertyMetadata, LegalResult
from graph.market import market_node
from graph.scoring import scoring_node
from graph.output import build_result
from graph.contracts import AuctionPropertyResult
from fiscal import get_itbi

PIPELINE_VERSION = "v4-city-expenses"

# Legal analysis is temporarily disabled: the Tractian LLM proxy 502s on the
# legal call, wasting ~90s per analysis retrying a doomed request. Flip back to
# True once the proxy/legal issue is fixed — the node is wired up and best-effort
# (a transient failure falls back to an empty LegalResult, see below).
LEGAL_NODE_ENABLED = False


def legal_node(state):
    """Load the optional LLM-backed node only when legal analysis is enabled."""
    from graph.legal import legal_node as run_legal_node

    return run_legal_node(state)


def metadata_from_property(prop) -> PropertyMetadata:
    """Build the graph's PropertyMetadata directly from a catalog Property row."""
    itbi = get_itbi(prop.uf or "", prop.city or "")
    description = prop.descricao_raw or ""
    commission_match = re.search(
        r"comiss[aã]o[^%]{0,80}?(\d+(?:[.,]\d+)?)\s*%", description, re.IGNORECASE,
    )
    commission_rate = (
        float(commission_match.group(1).replace(",", ".")) / 100
        if commission_match else None
    )
    return PropertyMetadata(
        address=prop.address or "",
        property_type=prop.property_type or "",
        area_m2=prop.area_m2 or 0.0,
        auction_price=prop.preco or 0.0,
        market_value_estimate=prop.avaliacao,
        auction_type=prop.modalidade or "",
        matricula=prop.matricula or "",
        city=prop.city or "",
        neighborhood=prop.neighborhood or "",
        state=prop.uf or "",
        beds=prop.beds,
        photo_url=prop.photo_url or "",
        itbi_rate=itbi["rate"] if itbi else None,
        itbi_source=itbi["source"] if itbi else "",
        commission_rate=commission_rate,
    )


def run_structured_enrichment(
    metadata: PropertyMetadata, pdf_texts: str = "", auction_url: str = "",
    regional_price_per_m2: float | None = None,
    regional_comparables: list[ComparableProperty] | None = None,
) -> AuctionPropertyResult:
    state = AuctionState(
        property_metadata=metadata, pdf_texts=pdf_texts, auction_url=auction_url,
    )
    state.market_result = market_node(
        state, regional_price_per_m2, regional_comparables,
    )["market_result"]
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
