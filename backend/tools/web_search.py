import asyncio

from loguru import logger
from tavily import TavilyClient

from config import get_settings


async def web_search(query: str, max_retries: int = 3) -> list[dict]:
    """Search the web using Tavily API with exponential backoff retry.

    Args:
        query: Search query string.
        max_retries: Maximum number of retries on failure.

    Returns:
        List of result dicts with keys: title, url, content
    """
    settings = get_settings()
    client = TavilyClient(api_key=settings.tavily_api_key)

    for attempt in range(max_retries):
        try:
            response = client.search(query=query, search_depth="advanced")
            return response.get("results", [])
        except Exception as e:
            if attempt < max_retries - 1:
                wait_time = 2 ** (attempt + 1)
                logger.warning(f"Search failed (attempt {attempt + 1}/{max_retries}): {e}. Retrying in {wait_time}s")
                await asyncio.sleep(wait_time)
            else:
                logger.error(f"Search failed after {max_retries} attempts: {e}")
                return []


async def web_search_multiple(queries: list[str]) -> list[dict]:
    """Run multiple search queries and combine results.

    Args:
        queries: List of search query strings.

    Returns:
        Combined list of all results.
    """
    all_results = []
    for query in queries:
        results = await web_search(query)
        all_results.extend(results)
    return all_results
