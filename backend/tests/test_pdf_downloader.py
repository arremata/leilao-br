import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from pathlib import Path

from tools.pdf_downloader import download_pdfs, _resolve_url, _filename_from_response


def test_resolve_url_absolute():
    """Absolute URLs should be returned unchanged."""
    result = _resolve_url("https://example.com/doc.pdf", "https://other.com/page")
    assert result == "https://example.com/doc.pdf"


def test_resolve_url_relative():
    """Relative URLs should be resolved against the page URL."""
    result = _resolve_url("/docs/edital.pdf", "https://example.com/leilao/123")
    assert result == "https://example.com/docs/edital.pdf"


def test_resolve_url_relative_with_path():
    """Relative URLs without leading slash should resolve against page path."""
    result = _resolve_url("edital.pdf", "https://example.com/leilao/123")
    assert result == "https://example.com/leilao/edital.pdf"


def test_resolve_url_protocol_relative():
    """Protocol-relative URLs should be resolved correctly."""
    result = _resolve_url("//cdn.example.com/docs/edital.pdf", "https://example.com/leilao/123")
    assert result == "https://cdn.example.com/docs/edital.pdf"


def test_filename_from_response_with_content_disposition():
    """Extract filename from Content-Disposition header."""
    mock_response = MagicMock()
    mock_response.headers = {"content-disposition": 'attachment; filename="edital_123.pdf"'}
    result = _filename_from_response("https://example.com/doc.pdf", mock_response)
    assert result == "edital_123.pdf"


def test_filename_from_response_fallback_to_url():
    """Fall back to URL path basename when no Content-Disposition."""
    mock_response = MagicMock()
    mock_response.headers = {}
    result = _filename_from_response("https://example.com/docs/edital.pdf", mock_response)
    assert result == "edital.pdf"


def test_filename_from_response_url_without_extension():
    """Fall back to 'document.pdf' when URL has no .pdf extension."""
    mock_response = MagicMock()
    mock_response.headers = {}
    result = _filename_from_response("https://example.com/download?id=123", mock_response)
    assert result == "document.pdf"


@pytest.mark.asyncio
async def test_download_pdfs_success():
    """download_pdfs should download all PDFs and return local file paths."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.headers = {"content-disposition": 'attachment; filename="edital.pdf"'}
    mock_response.content = b"%PDF-1.4 fake content"

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("tools.pdf_downloader.httpx.AsyncClient", return_value=mock_client):
        result = await download_pdfs(
            pdf_urls=["https://example.com/edital.pdf"],
            page_url="https://example.com/leilao/123",
        )

    assert len(result) == 1
    assert result[0].endswith("edital.pdf")
    assert Path(result[0]).parent.name.startswith("leilao_pdfs_")


@pytest.mark.asyncio
async def test_download_pdfs_handles_failure():
    """download_pdfs should skip failed downloads and continue."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.headers = {}
    mock_response.content = b"%PDF-1.4 fake content"

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=[
        Exception("Network error"),
        mock_response,
    ])
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("tools.pdf_downloader.httpx.AsyncClient", return_value=mock_client):
        result = await download_pdfs(
            pdf_urls=["https://bad.com/fail.pdf", "https://ok.com/edital.pdf"],
            page_url="https://ok.com/leilao/1",
        )

    assert len(result) == 1
    assert result[0].endswith("edital.pdf")


@pytest.mark.asyncio
async def test_download_pdfs_empty_list():
    """download_pdfs with empty list should return empty list."""
    result = await download_pdfs(pdf_urls=[], page_url="https://example.com")
    assert result == []


@pytest.mark.asyncio
async def test_download_pdfs_skips_oversized():
    """download_pdfs should skip files exceeding MAX_FILE_SIZE."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.headers = {}
    mock_response.content = b"%PDF-1.4 " + b"x" * (50 * 1024 * 1024 + 1)

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("tools.pdf_downloader.httpx.AsyncClient", return_value=mock_client):
        result = await download_pdfs(
            pdf_urls=["https://example.com/huge.pdf"],
            page_url="https://example.com/page",
        )

    assert result == []


@pytest.mark.asyncio
async def test_download_pdfs_skips_non_pdf_content():
    """download_pdfs should skip responses that don't start with %PDF magic bytes."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.headers = {}
    mock_response.content = b"<html><body>Error page</body></html>"

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("tools.pdf_downloader.httpx.AsyncClient", return_value=mock_client):
        result = await download_pdfs(
            pdf_urls=["https://example.com/not-a-pdf"],
            page_url="https://example.com/page",
        )

    assert result == []
