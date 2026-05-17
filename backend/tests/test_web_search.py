import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tools.web_search import web_search


def _mock_settings():
    """Create a mock settings object with tavily_api_key."""
    settings = MagicMock()
    settings.tavily_api_key = "test-tavily-key"
    return settings


@pytest.mark.asyncio
async def test_web_search_returns_results():
    mock_response = {
        "results": [
            {
                "title": "Preço m² Centro São Paulo",
                "url": "https://example.com/price",
                "content": "O preço médio do m² no Centro de SP é R$ 12.000",
            }
        ]
    }
    with patch("tools.web_search.TavilyClient") as MockClient, \
         patch("tools.web_search.get_settings", return_value=_mock_settings()):
        client_instance = MockClient.return_value
        client_instance.search.return_value = mock_response

        result = await web_search("preço m² Centro São Paulo")

        assert len(result) == 1
        assert "R$ 12.000" in result[0]["content"]


@pytest.mark.asyncio
async def test_web_search_handles_empty_results():
    with patch("tools.web_search.TavilyClient") as MockClient, \
         patch("tools.web_search.get_settings", return_value=_mock_settings()):
        client_instance = MockClient.return_value
        client_instance.search.return_value = {"results": []}

        result = await web_search("nonexistent query")

        assert result == []


@pytest.mark.asyncio
async def test_web_search_retry_on_failure():
    with patch("tools.web_search.TavilyClient") as MockClient, \
         patch("tools.web_search.get_settings", return_value=_mock_settings()):
        client_instance = MockClient.return_value
        client_instance.search.side_effect = [Exception("Rate limit"), {"results": [{"title": "ok", "url": "http://x", "content": "ok"}]}]

        result = await web_search("test query", max_retries=3)

        assert len(result) == 1
        assert client_instance.search.call_count == 2
