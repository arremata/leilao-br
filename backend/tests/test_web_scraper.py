import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from tools.web_scraper import scrape_page


@pytest.mark.asyncio
async def test_scrape_page_returns_content():
    mock_page = AsyncMock()
    mock_page.content.return_value = "<html><body><h1>Apartamento Centro SP</h1><p>R$ 500.000</p></body></html>"
    mock_page.title.return_value = "Test Page"
    mock_page.goto = AsyncMock()
    mock_page.close = AsyncMock()

    mock_context = AsyncMock()
    mock_context.new_page.return_value = mock_page

    mock_browser = AsyncMock()
    mock_browser.new_context.return_value = mock_context
    mock_browser.close = AsyncMock()

    mock_playwright_instance = AsyncMock()
    mock_playwright_instance.chromium.launch.return_value = mock_browser
    mock_playwright_instance.stop = AsyncMock()

    mock_pw_context = AsyncMock()
    mock_pw_context.start.return_value = mock_playwright_instance

    with patch("tools.web_scraper.async_playwright", return_value=mock_pw_context):
        result = await scrape_page("https://example.com")

        assert result["title"] == "Test Page"
        assert "Apartamento Centro SP" in result["html"]
        assert result["url"] == "https://example.com"


@pytest.mark.asyncio
async def test_scrape_page_handles_failure():
    mock_playwright_instance = AsyncMock()
    mock_playwright_instance.chromium.launch.side_effect = Exception("Browser failed")
    mock_playwright_instance.stop = AsyncMock()

    mock_pw_context = AsyncMock()
    mock_pw_context.start.return_value = mock_playwright_instance

    with patch("tools.web_scraper.async_playwright", return_value=mock_pw_context):
        result = await scrape_page("https://example.com")

        assert result["html"] == ""
        assert result["title"] == ""
