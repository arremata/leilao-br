import json

import litellm
from loguru import logger

from config import get_settings
from graph.state import AuctionState, PropertyMetadata

PLANNER_SYSTEM_PROMPT = """You are a real estate auction analyst in Brazil. Your job is to:

1. Extract property metadata from the provided PDF text (edital/matricula/laudo/certidões)
2. Create a focused research plan for the market and legal analysis agents

Extract the following fields as JSON:
- address: full property address
- property_type: type (Apartamento, Casa, Terreno, Comercial, etc.)
- area_m2: area in square meters (float)
- auction_price: 1st bid price (valor de 1ª praça) as float
- market_value_estimate: appraised value (valor de avaliação) as float, if available
- auction_date: auction date string
- auction_type: Judicial, Extrajudicial, Caixa, etc.
- matricula: matrícula number
- court_or_leiloeiro: court name or auctioneer
- city: city name
- neighborhood: neighborhood/bairro
- state: state abbreviation (SP, RJ, etc.)

Also provide a "research_plan" string describing what the market and legal agents should focus on.

Respond ONLY with a JSON object containing "property_metadata" and "research_plan" keys."""


def _call_planner_llm(pdf_texts: str) -> object:
    """Call Claude Opus via LiteLLM/OpenRouter to extract metadata and create research plan."""
    settings = get_settings()

    return litellm.completion(
        model="openai/claude-opus-4.6",
        api_key=settings.openrouter_api_key,
        api_base=settings.api_base,
        max_tokens=4096,
        messages=[
            {"role": "system", "content": PLANNER_SYSTEM_PROMPT},
            {"role": "user", "content": f"Extract property data from these documents:\n\n{pdf_texts}"},
        ],
    )


def planner_node(state: AuctionState) -> dict:
    """LangGraph node: Extract property metadata and create research plan from PDF text."""
    pdf_texts = state.pdf_texts if hasattr(state, 'pdf_texts') else state.get("pdf_texts", "")

    if not pdf_texts.strip():
        logger.warning("No PDF text to analyze")
        return {
            "property_metadata": PropertyMetadata(),
            "research_plan": "No documents provided. Limited research possible.",
            "errors": ["No PDF text available for analysis"],
        }

    logger.info("Planner: extracting property metadata and creating research plan")

    response = _call_planner_llm(pdf_texts)
    response_text = response.choices[0].message.content

    try:
        # Strip markdown code block wrappers if present
        text = response_text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            text = text.rsplit("```", 1)[0]
        parsed = json.loads(text.strip())
        # Filter to only known PropertyMetadata fields to avoid TypeError from unexpected LLM keys
        from dataclasses import fields as _fields
        _known = {f.name for f in _fields(PropertyMetadata)}
        metadata = PropertyMetadata(**{k: v for k, v in parsed.get("property_metadata", {}).items() if k in _known})
        research_plan = parsed.get("research_plan", "")
    except (json.JSONDecodeError, TypeError) as e:
        logger.error(f"Failed to parse planner response: {e}")
        metadata = PropertyMetadata()
        research_plan = "Could not parse property data. Proceeding with limited research."

    logger.info(f"Planner: identified property at {metadata.address or 'unknown address'}")

    return {
        "property_metadata": metadata,
        "research_plan": research_plan,
    }
