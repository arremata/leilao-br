import json
from unittest.mock import AsyncMock, patch, MagicMock

from graph.state import AuctionState, PropertyMetadata
from graph.discovery import discovery_node, _extract_pdf_urls, _clean_html


def _mock_scrape_result():
    return {
        "url": "https://leiloes.caixa.gov.br/leilao/123",
        "title": "Leilao Caixa - Apartamento Centro SP",
        "html": """
        <html><body>
            <h1>Apartamento - Rua das Flores, 123, Centro, Sao Paulo - SP</h1>
            <p>Area: 80m2 | Valor 1a praca: R$ 350.000,00</p>
            <a href="/docs/edital_123.pdf">Edital</a>
            <a href="/docs/matricula_123.pdf">Matricula</a>
            <a href="/docs/laudo_123.pdf">Laudo de Avaliacao</a>
        </body></html>
        """,
    }


def _mock_discovery_llm_response():
    mock = MagicMock()
    mock.choices = [
        MagicMock(
            message=MagicMock(
                content=json.dumps({
                    "property_metadata": {
                        "address": "Rua das Flores, 123, Centro, Sao Paulo - SP",
                        "property_type": "Apartamento",
                        "area_m2": 80.0,
                        "auction_price": 350000.0,
                        "city": "Sao Paulo",
                        "neighborhood": "Centro",
                        "state": "SP",
                    },
                    "page_source_type": "caixa",
                })
            )
        )
    ]
    return mock


# ---------------------------------------------------------------------------
# PDF URL extraction tests
# ---------------------------------------------------------------------------


def test_extract_pdf_urls_finds_href_pdfs():
    """_extract_pdf_urls should find all .pdf hrefs in the HTML."""
    html = '<a href="/docs/edital.pdf">Edital</a><a href="/docs/laudo.pdf">Laudo</a>'
    result = _extract_pdf_urls(html)
    assert result == ["/docs/edital.pdf", "/docs/laudo.pdf"]


def test_extract_pdf_urls_deduplicates():
    """_extract_pdf_urls should not return duplicate URLs."""
    html = '<a href="/docs/edital.pdf">Edital</a><a href="/docs/edital.pdf">Edital Again</a>'
    result = _extract_pdf_urls(html)
    assert result == ["/docs/edital.pdf"]


def test_extract_pdf_urls_handles_query_params():
    """_extract_pdf_urls should handle URLs with query parameters after .pdf."""
    html = '<a href="/download?file=edital.pdf&id=123">Edital</a>'
    result = _extract_pdf_urls(html)
    assert len(result) == 1
    assert "edital.pdf" in result[0]


def test_extract_pdf_urls_no_pdfs():
    """_extract_pdf_urls should return empty list when no PDFs are found."""
    html = '<a href="/about">About</a><a href="/contact">Contact</a>'
    result = _extract_pdf_urls(html)
    assert result == []


def test_extract_pdf_urls_case_insensitive():
    """_extract_pdf_urls should find .PDF extension case-insensitively."""
    html = '<a href="/docs/EDITAL.PDF">Edital</a>'
    result = _extract_pdf_urls(html)
    assert result == ["/docs/EDITAL.PDF"]


# ---------------------------------------------------------------------------
# HTML cleaning tests
# ---------------------------------------------------------------------------


def test_clean_html_removes_scripts():
    """_clean_html should strip <script> blocks."""
    html = '<html><script>var x = 1;</script><p>Hello</p></html>'
    result = _clean_html(html)
    assert "var x" not in result
    assert "Hello" in result


def test_clean_html_removes_styles():
    """_clean_html should strip <style> blocks."""
    html = '<html><style>body { color: red; }</style><p>Hello</p></html>'
    result = _clean_html(html)
    assert "color" not in result
    assert "Hello" in result


def test_clean_html_strips_tags():
    """_clean_html should remove all HTML tags."""
    html = '<div><h1>Title</h1><p>Text</p></div>'
    result = _clean_html(html)
    assert "<div>" not in result
    assert "Title" in result
    assert "Text" in result


def test_clean_html_collapses_whitespace():
    """_clean_html should collapse multiple spaces into one."""
    html = '<p>Hello    World</p>'
    result = _clean_html(html)
    assert "Hello World" in result


# ---------------------------------------------------------------------------
# Discovery node integration tests
# ---------------------------------------------------------------------------


def test_discovery_node_with_url():
    """discovery_node should scrape page, parse HTML, and download PDFs."""
    mock_downloaded = ["/tmp/leilao_pdfs_abc/edital_123.pdf", "/tmp/leilao_pdfs_abc/matricula_123.pdf"]
    mock_parsed = {
        "text": "Edital de Leilao Judicial - Rua das Flores, 123",
        "sources": mock_downloaded,
        "metadata": [],
    }

    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value=_mock_scrape_result()),
        patch("graph.discovery._call_discovery_llm", return_value=_mock_discovery_llm_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=mock_downloaded),
        patch("graph.discovery.parse_pdf", return_value=mock_parsed),
    ):
        state = AuctionState(auction_url="https://leiloes.caixa.gov.br/leilao/123")
        result = discovery_node(state)

    assert result["property_metadata"] is not None
    assert result["property_metadata"].address == "Rua das Flores, 123, Centro, Sao Paulo - SP"
    assert result["page_source_type"] == "caixa"
    assert result["downloaded_pdfs"] == mock_downloaded
    assert result["pdf_texts"] == "Edital de Leilao Judicial - Rua das Flores, 123"
    assert result["pdf_sources"] == mock_downloaded


def test_discovery_node_no_url():
    """discovery_node with no URL should return empty results with an error."""
    state = AuctionState(auction_url="")
    result = discovery_node(state)

    assert result["property_metadata"] is None
    assert "pdf_texts" not in result  # Should not overwrite existing state
    assert len(result["errors"]) > 0


def test_discovery_node_scrape_failure():
    """discovery_node should handle scrape failures gracefully."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={
            "url": "https://bad.url", "title": "", "html": ""
        }),
    ):
        state = AuctionState(auction_url="https://bad.url")
        result = discovery_node(state)

    assert len(result["errors"]) > 0
    assert "pdf_texts" not in result  # Should not overwrite existing state


def test_discovery_node_llm_parse_failure():
    """discovery_node should handle LLM parse failures gracefully."""
    bad_llm = MagicMock()
    bad_llm.choices = [MagicMock(message=MagicMock(content="not valid json{{{"))]

    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value=_mock_scrape_result()),
        patch("graph.discovery._call_discovery_llm", return_value=bad_llm),
    ):
        state = AuctionState(auction_url="https://leiloes.caixa.gov.br/leilao/123")
        result = discovery_node(state)

    assert result["property_metadata"] is not None  # Falls back to empty PropertyMetadata
    assert result["downloaded_pdfs"] == []  # No PDFs downloaded when parse fails
    assert len(result["errors"]) > 0


def test_discovery_node_no_pdfs_found():
    """discovery_node should proceed with page metadata when no PDFs are found in HTML."""
    no_pdf_html = """
    <html><body>
        <h1>Apartamento - Rua das Flores, 123</h1>
        <p>Area: 80m2 | Valor: R$ 350.000</p>
    </body></html>
    """
    no_pdf_response = MagicMock()
    no_pdf_response.choices = [
        MagicMock(
            message=MagicMock(
                content=json.dumps({
                    "property_metadata": {
                        "address": "Rua das Flores, 123",
                        "property_type": "Apartamento",
                        "area_m2": 80.0,
                        "auction_price": 350000.0,
                        "city": "Sao Paulo",
                        "state": "SP",
                    },
                    "page_source_type": "aggregator",
                })
            )
        )
    ]

    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={
            "url": "https://example.com/leilao/123", "title": "Test", "html": no_pdf_html,
        }),
        patch("graph.discovery._call_discovery_llm", return_value=no_pdf_response),
    ):
        state = AuctionState(auction_url="https://example.com/leilao/123")
        result = discovery_node(state)

    assert result["property_metadata"] is not None
    assert result["downloaded_pdfs"] == []
    assert "pdf_texts" not in result  # No PDFs found, should not overwrite existing state


def test_discovery_node_llm_call_failure():
    """discovery_node should handle LLM call failures (rate limit, timeout) gracefully."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value=_mock_scrape_result()),
        patch("graph.discovery._call_discovery_llm", side_effect=Exception("Rate limit exceeded")),
    ):
        state = AuctionState(auction_url="https://leiloes.caixa.gov.br/leilao/123")
        result = discovery_node(state)

    assert result["property_metadata"] is not None  # Empty PropertyMetadata fallback
    assert "pdf_texts" not in result  # Should not overwrite existing state
    assert len(result["errors"]) > 0
    assert "Rate limit" in result["errors"][0]


# ---------------------------------------------------------------------------
# Dynamic PDF extraction fallback tests
# ---------------------------------------------------------------------------


def _mock_spa_scrape_result():
    """HTML where PDF filenames appear as text labels without href attributes."""
    return {
        "url": "https://www.kronleiloes.com.br/oferta/123",
        "title": "Kron Leiloes - Apartamento",
        "html": """
        <html><body>
            <h1>Apartamento - Rua Exemplo, 456</h1>
            <div id="Anexos">
                <li><a alt="la">matricula.pdf</a></li>
                <li><a alt="la">laudo-avaliacao.pdf</a></li>
                <li><a alt="la">termo-penhora.pdf</a></li>
            </div>
        </body></html>
        """,
    }


def test_discovery_node_dynamic_pdf_fallback():
    """discovery_node should use dynamic extraction when PDF labels lack href."""
    dynamic_urls = [
        "https://s.superbid.net/attachment/aaa.pdf",
        "https://s.superbid.net/attachment/bbb.pdf",
        "https://s.superbid.net/attachment/ccc.pdf",
    ]
    mock_downloaded = ["/tmp/aaa.pdf", "/tmp/bbb.pdf", "/tmp/ccc.pdf"]
    mock_parsed = {
        "text": "Edital text from 3 PDFs",
        "sources": mock_downloaded,
        "metadata": [],
    }

    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value=_mock_spa_scrape_result()),
        patch("graph.discovery.extract_dynamic_pdf_urls", new_callable=AsyncMock, return_value=dynamic_urls),
        patch("graph.discovery._call_discovery_llm", return_value=_mock_discovery_llm_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=mock_downloaded),
        patch("graph.discovery.parse_pdf", return_value=mock_parsed),
    ):
        state = AuctionState(auction_url="https://www.kronleiloes.com.br/oferta/123")
        result = discovery_node(state)

    assert len(result["downloaded_pdfs"]) == 3
    assert result["pdf_texts"] == "Edital text from 3 PDFs"


def test_discovery_node_dynamic_deduplicates_with_static():
    """Dynamic URLs already found via static extraction should not be duplicated."""
    spa_html_with_one_href = {
        "url": "https://example.com/oferta/1",
        "title": "Test",
        "html": """
        <html><body>
            <a href="https://cdn.example.com/a.pdf">Download</a>
            <li><a alt="la">extra.pdf</a></li>
        </body></html>
        """,
    }
    dynamic_urls = [
        "https://cdn.example.com/a.pdf",  # duplicate of static
        "https://cdn.example.com/b.pdf",  # new
    ]
    mock_downloaded = ["/tmp/a.pdf", "/tmp/b.pdf"]
    mock_parsed = {"text": "Combined text", "sources": mock_downloaded, "metadata": []}

    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value=spa_html_with_one_href),
        patch("graph.discovery.extract_dynamic_pdf_urls", new_callable=AsyncMock, return_value=dynamic_urls),
        patch("graph.discovery._call_discovery_llm", return_value=_mock_discovery_llm_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=mock_downloaded),
        patch("graph.discovery.parse_pdf", return_value=mock_parsed),
    ):
        state = AuctionState(auction_url="https://example.com/oferta/1")
        result = discovery_node(state)

    # Should have 2 unique URLs (static a.pdf + dynamic b.pdf), not 3
    assert len(result["downloaded_pdfs"]) == 2
