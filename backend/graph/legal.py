import asyncio
import json

import litellm
from loguru import logger

from config import get_settings
from graph.state import AuctionState, LegalResult
from tools.web_search import web_search_multiple

LEGAL_SYSTEM_PROMPT = """You are a real estate legal analyst in Brazil specializing in auction property risks. Given property details, PDF document text, and web search results, produce a comprehensive legal viability assessment.

You MUST return a JSON object with these exact fields:
- registration_status: string (status of property registration)
- liens: array of strings (any penhoras, onus reais, gravames found)
- judicial_disputes: array of strings (any acoes judiciais, execucoes)
- tax_debts_iptu: string (IPTU debt status)
- tax_debts_itbi: string (ITBI debt status)
- condominium_debts: string (condominium debt status)
- federal_state_debts: string (Divida Ativa / federal-state debts)
- zoning_compliance: string (zoneamento status)
- construction_permits: string (habite-se, alvara status)
- occupation_status: string (occupied by owner/tenant/squatter/desocupado)
- usufruct_rights: string (any usufruct or right of use)
- risk_level: string - one of "low", "medium", "high", "critical"
- risk_details: string (detailed explanation of all risks found)
- raw_findings: string (summary of all sources used)

Risk level guidelines:
- low: Clean title, no debts, no disputes, unoccupied
- medium: Minor debts (IPTU), no judicial disputes, may need paperwork
- high: Significant debts, pending judicial actions, occupied property
- critical: Multiple liens, active lawsuits, squatters, irregular documentation

Pay special attention to the PDF text - editais often contain critical legal information about debts, penalties, and conditions.

Respond ONLY with the JSON object."""


async def _run_legal_searches(metadata) -> list[dict]:
    """Run targeted web searches for legal data."""
    def _get(attr):
        return getattr(metadata, attr, "") if hasattr(metadata, attr) else metadata.get(attr, "")

    queries = [
        f"certidao onus matricula {_get('matricula')} {_get('city')}",
        f"acoes judiciais {_get('address')} {_get('city')}",
        f"divida ativa {_get('address')} {_get('city')} {_get('state')}",
        f"IPTU debito {_get('address')} {_get('city')}",
        f"zoneamento {_get('neighborhood')} {_get('city')} {_get('state')}",
    ]

    return await web_search_multiple(queries)


def _call_legal_llm(metadata, pdf_texts: str, search_results: list[dict]) -> object:
    """Call Claude Sonnet via LiteLLM/OpenRouter for legal analysis."""
    settings = get_settings()

    search_text = "\n".join(
        f"[{r.get('title', '')}] {r.get('content', '')} (Source: {r.get('url', '')})"
        for r in search_results
    )

    def _get(attr):
        return getattr(metadata, attr, "") if hasattr(metadata, attr) else metadata.get(attr, "")

    property_info = (
        f"Property: {_get('property_type')} at {_get('address')}\n"
        f"Matricula: {_get('matricula') or 'N/A'}\n"
        f"Auction Type: {_get('auction_type') or 'N/A'}\n"
        f"Auction Price: R$ {_get('auction_price')}\n"
        f"Location: {_get('neighborhood')}, {_get('city')} - {_get('state')}\n"
    )

    return litellm.completion(
        model="openai/claude-sonnet-4.6",
        api_key=settings.openrouter_api_key,
        api_base=settings.api_base,
        max_tokens=4096,
        messages=[
            {"role": "system", "content": LEGAL_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Property Info:\n{property_info}\n\n"
                f"Document Text:\n{pdf_texts[:8000]}\n\n"
                f"Web Search Results:\n{search_text}",
            },
        ],
    )


def legal_node(state: AuctionState) -> dict:
    """LangGraph node: Assess legal viability and risks for the property."""
    metadata = state.property_metadata if hasattr(state, 'property_metadata') else state.get("property_metadata")
    pdf_texts = state.pdf_texts if hasattr(state, 'pdf_texts') else state.get("pdf_texts", "")

    if not metadata:
        logger.warning("Legal agent: no property metadata available")
        return {
            "legal_result": LegalResult(risk_level="critical", risk_details="No property metadata available"),
            "errors": ["No property metadata for legal analysis"],
        }

    logger.info(f"Legal agent: researching {getattr(metadata, 'address', 'unknown property')}")

    search_results = asyncio.run(_run_legal_searches(metadata))
    logger.info(f"Legal agent: collected {len(search_results)} search results")

    response = _call_legal_llm(metadata, pdf_texts, search_results)
    response_text = response.choices[0].message.content

    try:
        # Strip markdown code block wrappers if present
        text = response_text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            text = text.rsplit("```", 1)[0]
        parsed = json.loads(text.strip())
        # Filter to only known LegalResult fields to avoid TypeError from unexpected LLM keys
        from dataclasses import fields as _fields
        _known = {f.name for f in _fields(LegalResult)}
        _filtered = {k: v for k, v in parsed.items() if k in _known}
        legal_result = LegalResult(**_filtered)
    except (json.JSONDecodeError, TypeError) as e:
        logger.error(f"Failed to parse legal response: {e}")
        legal_result = LegalResult(risk_level="critical", risk_details=f"Parse error: {e}", raw_findings=response_text)

    logger.info(f"Legal agent: risk_level={legal_result.risk_level}")

    return {"legal_result": legal_result}
