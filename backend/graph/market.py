import asyncio
import json

import litellm
from loguru import logger

from config import get_settings
from graph.state import AuctionState, MarketResult, ComparableProperty
from tools.property_scraper import scrape_comparables

MARKET_SYSTEM_PROMPT = """You are a real estate market analyst in Brazil. Given property details and web search results, produce a comprehensive market analysis.

You MUST return a JSON object with these exact fields:
- price_per_m2_neighborhood: float (R$ per m² in the neighborhood)
- price_per_m2_city: float (R$ per m² in the city)
- comparable_properties: array of {address, price, area_m2, price_per_m2, source, url}
- reform_estimate: float (estimated cost in R$ for basic reform: floor + paint + essentials)
- area_appreciation_1y: float (% appreciation in last year)
- area_appreciation_3y: float (% appreciation in last 3 years)
- area_appreciation_5y: float (% appreciation in last 5 years)
- city_appreciation_1y: float (% city-wide appreciation last year)
- liquidity_days: int (average days on market in the area)
- tendencies: string (supply/demand trends, new developments, infrastructure)
- discount_percentage: float (% discount of auction price vs market value)
- market_score: int 1-10 (1=very bad deal, 10=excellent opportunity)
- raw_findings: string (summary of all search results used)

Calculate discount as: ((market_value - auction_price) / market_value) * 100
Where market_value = price_per_m2_neighborhood * area_m2

Respond ONLY with the JSON object."""


async def _run_market_searches(metadata) -> list[ComparableProperty]:
    """Run property scrapers and return the comparable listings found."""
    scraped_comps = await scrape_comparables(metadata)
    logger.info(f"Market agent: scrapers returned {len(scraped_comps)} comparable properties")
    return scraped_comps


def _call_market_llm(metadata, scraped_comps: list[ComparableProperty] | None = None) -> object:
    """Call Claude Sonnet via LiteLLM/Tractian proxy for market analysis."""
    settings = get_settings()

    # Build context from direct listing-source comparables.
    search_text = ""
    if scraped_comps:
        comp_lines = "\n".join(
            f"[Comparable Property] {c.address} | Price: R$ {c.price:,.0f} | Area: {c.area_m2} m² | "
            f"Price/m²: R$ {c.price_per_m2:,.0f} | Source: {c.source} | URL: {c.url}"
            for c in scraped_comps
        )
        search_text = f"SCRAPED COMPARABLE PROPERTIES (high confidence):\n{comp_lines}"

    def _get(attr):
        return getattr(metadata, attr, "") if hasattr(metadata, attr) else metadata.get(attr, "")

    property_info = (
        f"Property: {_get('property_type')} at {_get('address')}\n"
        f"Area: {_get('area_m2')} m²\n"
        f"Auction Price: R$ {_get('auction_price')}\n"
        f"Market Value Estimate: R$ {_get('market_value_estimate') or 'N/A'}\n"
        f"Neighborhood: {_get('neighborhood')}, {_get('city')} - {_get('state')}\n"
    )

    return litellm.completion(
        model="openai/claude-sonnet-4.6",
        api_key=settings.openrouter_api_key,
        api_base=settings.api_base,
        max_tokens=4096,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": MARKET_SYSTEM_PROMPT},
            {"role": "user", "content": f"Property Info:\n{property_info}\n\nSearch Results:\n{search_text}"},
        ],
    )


def _parse_market_result(parsed: dict) -> MarketResult:
    """Parse LLM JSON response into a MarketResult, converting comparable_properties dicts."""
    # Handle common LLM misspelling: tendences -> tendencies
    if "tendences" in parsed and "tendencies" not in parsed:
        parsed["tendencies"] = parsed.pop("tendences")

    comparable_raw = parsed.pop("comparable_properties", [])
    comparable_properties = [
        ComparableProperty(**cp) if isinstance(cp, dict) else cp
        for cp in comparable_raw
    ]

    # Only pass fields that exist on MarketResult to avoid TypeError from unknown keys
    from dataclasses import fields
    known_fields = {f.name for f in fields(MarketResult)}
    filtered = {k: v for k, v in parsed.items() if k in known_fields}

    return MarketResult(comparable_properties=comparable_properties, **filtered)


def market_node(state: AuctionState) -> dict:
    """LangGraph node: Analyze market conditions for the property."""
    metadata = state.property_metadata if hasattr(state, 'property_metadata') else state.get("property_metadata")
    if not metadata:
        logger.warning("Market agent: no property metadata available")
        return {
            "market_result": MarketResult(market_score=0, raw_findings="No property metadata available"),
            "errors": ["No property metadata for market analysis"],
        }

    logger.info(f"Market agent: researching {getattr(metadata, 'address', 'unknown property')}")

    scraped_comps = asyncio.run(_run_market_searches(metadata))
    logger.info(f"Market agent: collected {len(scraped_comps)} scraped comps")

    response = _call_market_llm(metadata, scraped_comps)
    response_text = response.choices[0].message.content

    try:
        # Strip markdown code block wrappers if present
        text = response_text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            text = text.rsplit("```", 1)[0]
        parsed = json.loads(text.strip())
        market_result = _parse_market_result(parsed)
    except (json.JSONDecodeError, TypeError) as e:
        logger.error(f"Failed to parse market response: {e}")
        market_result = MarketResult(market_score=0, raw_findings=response_text)

    logger.info(f"Market agent: score={market_result.market_score}, discount={market_result.discount_percentage}%")

    return {"market_result": market_result}
