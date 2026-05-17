# Discovery Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Discovery agent that takes an auction URL, scrapes the page, downloads linked PDFs, and feeds them into the existing analysis pipeline.

**Architecture:** New `discovery` LangGraph node prepended before `planner`. Uses Playwright to scrape the auction page, an LLM call to extract metadata and PDF links from HTML, and httpx to download PDFs. Existing pipeline unchanged.

**Tech Stack:** Python, LangGraph, Playwright (existing), httpx (existing), LiteLLM (existing), PyMuPDF (existing)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `tools/pdf_downloader.py` | Create | Download PDFs from URLs to local temp dir |
| `graph/discovery.py` | Create | Discovery LangGraph node (scrape, LLM parse, download PDFs) |
| `graph/state.py` | Modify | Add `auction_url`, `downloaded_pdfs`, `page_source_type` to `AuctionState` |
| `graph/workflow.py` | Modify | Add discovery node as entry point, conditional start |
| `app.py` | Modify | Add URL input to Gradio UI, wire to discovery workflow |
| `tests/test_pdf_downloader.py` | Create | Unit tests for PDF downloader |
| `tests/test_discovery.py` | Create | Unit tests for discovery node |
| `tests/test_workflow.py` | Modify | Update workflow tests for new discovery node |

---

### Task 1: Add new fields to AuctionState

**Files:**
- Modify: `graph/state.py:69-78`

- [ ] **Step 1: Write the failing test**

Add a test to `tests/test_state.py` that checks the new fields exist:

```python
def test_auction_state_has_discovery_fields():
    """AuctionState should include auction_url, downloaded_pdfs, and page_source_type."""
    state = AuctionState()
    assert state.auction_url == ""
    assert state.downloaded_pdfs == []
    assert state.page_source_type == ""
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && .venv/bin/python -m pytest tests/test_state.py::test_auction_state_has_discovery_fields -v`
Expected: FAIL — `AuctionState` has no attribute `auction_url`

- [ ] **Step 3: Add the fields to AuctionState**

In `graph/state.py`, update the `AuctionState` dataclass to add three new fields:

```python
@dataclass
class AuctionState:
    pdf_texts: str = ""
    pdf_sources: list[str] = field(default_factory=list)
    property_metadata: Optional[PropertyMetadata] = None
    research_plan: str = ""
    market_result: Optional[MarketResult] = None
    legal_result: Optional[LegalResult] = None
    report_html: str = ""
    errors: list[str] = field(default_factory=list)
    auction_url: str = ""
    downloaded_pdfs: list[str] = field(default_factory=list)
    page_source_type: str = ""
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && .venv/bin/python -m pytest tests/test_state.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add graph/state.py tests/test_state.py
git commit -m "feat: add discovery fields to AuctionState"
```

---

### Task 2: Create PDF downloader tool

**Files:**
- Create: `tools/pdf_downloader.py`
- Create: `tests/test_pdf_downloader.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_pdf_downloader.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && .venv/bin/python -m pytest tests/test_pdf_downloader.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.pdf_downloader'`

- [ ] **Step 3: Write the implementation**

Create `tools/pdf_downloader.py`:

```python
"""Download PDF files from URLs to a local temp directory."""

import tempfile
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from loguru import logger

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
DOWNLOAD_TIMEOUT = 30  # seconds


def _resolve_url(url: str, page_url: str) -> str:
    """Resolve a potentially relative URL against the page URL.

    Args:
        url: The URL to resolve (may be relative or absolute).
        page_url: The base URL of the page where the link was found.

    Returns:
        Absolute URL string.
    """
    if url.startswith(("http://", "https://")):
        return url
    parsed_page = urlparse(page_url)
    base = f"{parsed_page.scheme}://{parsed_page.netloc}"
    if url.startswith("/"):
        return base + url
    # Relative path: resolve against page directory
    page_path = parsed_page.path
    if "/" in page_path:
        page_path = page_path.rsplit("/", 1)[0] + "/"
    else:
        page_path = "/"
    return base + page_path + url


def _filename_from_response(url: str, response: httpx.Response) -> str:
    """Extract filename from Content-Disposition header or fall back to URL path.

    Args:
        url: The request URL.
        response: The HTTP response.

    Returns:
        Filename string.
    """
    cd = response.headers.get("content-disposition", "")
    if "filename=" in cd:
        # Extract filename from Content-Disposition
        for part in cd.split(";"):
            part = part.strip()
            if part.startswith("filename="):
                name = part.split("=", 1)[1].strip().strip('"').strip("'")
                if name:
                    return name

    # Fall back to URL path basename
    path = urlparse(url).path
    basename = Path(path).name
    if basename and basename.endswith(".pdf"):
        return basename

    return "document.pdf"


async def download_pdfs(pdf_urls: list[str], page_url: str) -> list[str]:
    """Download PDF files from URLs to a local temp directory.

    Args:
        pdf_urls: List of PDF URLs to download (may be relative).
        page_url: Base URL for resolving relative URLs.

    Returns:
        List of local file paths for successfully downloaded PDFs.
    """
    if not pdf_urls:
        return []

    tmp_dir = tempfile.mkdtemp(prefix="leilao_pdfs_")
    downloaded = []

    async with httpx.AsyncClient(timeout=DOWNLOAD_TIMEOUT, follow_redirects=True) as client:
        for url in pdf_urls:
            resolved = _resolve_url(url, page_url)
            try:
                response = await client.get(resolved)
                response.raise_for_status()

                if len(response.content) > MAX_FILE_SIZE:
                    logger.warning(f"Skipping {resolved}: file too large ({len(response.content)} bytes)")
                    continue

                filename = _filename_from_response(resolved, response)
                local_path = Path(tmp_dir) / filename

                # Avoid overwriting files with same name
                counter = 1
                while local_path.exists():
                    stem = Path(filename).stem
                    local_path = Path(tmp_dir) / f"{stem}_{counter}.pdf"
                    counter += 1

                local_path.write_bytes(response.content)
                downloaded.append(str(local_path))
                logger.info(f"Downloaded {resolved} -> {local_path}")

            except Exception as e:
                logger.warning(f"Failed to download {resolved}: {e}")
                continue

    return downloaded
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && .venv/bin/python -m pytest tests/test_pdf_downloader.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add tools/pdf_downloader.py tests/test_pdf_downloader.py
git commit -m "feat: add PDF downloader tool with URL resolution and temp storage"
```

---

### Task 3: Create Discovery node

**Files:**
- Create: `graph/discovery.py`
- Create: `tests/test_discovery.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_discovery.py`:

```python
import json
from unittest.mock import AsyncMock, patch, MagicMock

from graph.state import AuctionState, PropertyMetadata
from graph.discovery import discovery_node, _call_discovery_llm


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
                    "pdf_urls": [
                        "/docs/edital_123.pdf",
                        "/docs/matricula_123.pdf",
                        "/docs/laudo_123.pdf",
                    ],
                    "page_source_type": "caixa",
                })
            )
        )
    ]
    return mock


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
    assert result["pdf_texts"] == ""
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
    assert result["pdf_texts"] == ""


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
    """discovery_node should proceed with page metadata when no PDFs are found."""
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
                    "pdf_urls": [],
                    "page_source_type": "aggregator",
                })
            )
        )
    ]

    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value=_mock_scrape_result()),
        patch("graph.discovery._call_discovery_llm", return_value=no_pdf_response),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
    ):
        state = AuctionState(auction_url="https://example.com/leilao/123")
        result = discovery_node(state)

    assert result["property_metadata"] is not None
    assert result["downloaded_pdfs"] == []
    assert result["pdf_texts"] == ""
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && .venv/bin/python -m pytest tests/test_discovery.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'graph.discovery'`

- [ ] **Step 3: Write the implementation**

Create `graph/discovery.py`:

```python
"""Discovery node: scrape an auction page, extract metadata and PDF links, download PDFs."""

import asyncio
import json

import litellm
from loguru import logger

from config import get_settings
from graph.state import AuctionState, PropertyMetadata
from tools.pdf_downloader import download_pdfs
from tools.pdf_parser import parse_pdf
from tools.web_scraper import scrape_page

DISCOVERY_SYSTEM_PROMPT = """You are a real estate auction page parser for Brazilian auction sites. Given the HTML of an auction listing page, extract:

1. property_metadata: Property details matching these fields:
   - address: full property address
   - property_type: type (Apartamento, Casa, Terreno, Comercial, etc.)
   - area_m2: area in square meters (float)
   - auction_price: 1st bid price / valor de 1a praca as float
   - market_value_estimate: appraised value if available (float or null)
   - auction_date: auction date string
   - auction_type: Judicial, Extrajudicial, Caixa, etc.
   - matricula: matricula number if shown
   - court_or_leiloeiro: court name or auctioneer
   - city: city name
   - neighborhood: neighborhood/bairro
   - state: state abbreviation (SP, RJ, etc.)
   Set any field you cannot find to an empty string or 0 for numbers.

2. pdf_urls: Array of all PDF download URLs found on the page (hrefs ending in .pdf or links labeled as Edital, Matricula, Laudo, Certidao, etc.). Include relative URLs as-is.

3. page_source_type: One of "caixa", "leiloeiro", "court", "aggregator", or "other"

Respond ONLY with a JSON object containing "property_metadata", "pdf_urls", and "page_source_type" keys."""

MAX_HTML_LENGTH = 15000


def _call_discovery_llm(html: str) -> object:
    """Call Claude Sonnet via LiteLLM to parse auction page HTML."""
    settings = get_settings()

    truncated = html[:MAX_HTML_LENGTH]

    return litellm.completion(
        model="openai/claude-sonnet-4.6",
        api_key=settings.openrouter_api_key,
        api_base=settings.api_base,
        max_tokens=4096,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": DISCOVERY_SYSTEM_PROMPT},
            {"role": "user", "content": f"Parse this auction page HTML:\n\n{truncated}"},
        ],
    )


def discovery_node(state: AuctionState) -> dict:
    """LangGraph node: Discover auction data from a URL.

    Scrapes the page, uses LLM to extract metadata and PDF links,
    downloads PDFs, and parses them for the planner.
    """
    url = state.auction_url if hasattr(state, 'auction_url') else state.get("auction_url", "")

    if not url:
        logger.warning("Discovery: no auction URL provided")
        return {
            "property_metadata": None,
            "pdf_texts": "",
            "pdf_sources": [],
            "downloaded_pdfs": [],
            "page_source_type": "",
            "errors": ["No auction URL provided"],
        }

    logger.info(f"Discovery: scraping {url}")

    # Step 1: Scrape the page
    scrape_result = asyncio.run(scrape_page(url))
    html = scrape_result.get("html", "")

    if not html:
        logger.error(f"Discovery: failed to scrape {url}")
        return {
            "property_metadata": None,
            "pdf_texts": "",
            "pdf_sources": [],
            "downloaded_pdfs": [],
            "page_source_type": "",
            "errors": [f"Failed to scrape page: {url}"],
        }

    # Step 2: LLM extracts metadata + PDF URLs from HTML
    logger.info("Discovery: parsing page HTML with LLM")
    response = _call_discovery_llm(html)
    response_text = response.choices[0].message.content

    try:
        text = response_text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            text = text.rsplit("```", 1)[0]
        parsed = json.loads(text.strip())

        metadata = PropertyMetadata(**parsed.get("property_metadata", {}))
        pdf_urls = parsed.get("pdf_urls", [])
        page_source_type = parsed.get("page_source_type", "other")
    except (json.JSONDecodeError, TypeError) as e:
        logger.error(f"Discovery: failed to parse LLM response: {e}")
        metadata = PropertyMetadata()
        pdf_urls = []
        page_source_type = "other"
        return {
            "property_metadata": metadata,
            "pdf_texts": "",
            "pdf_sources": [],
            "downloaded_pdfs": [],
            "page_source_type": page_source_type,
            "errors": [f"Failed to parse discovery response: {e}"],
        }

    logger.info(f"Discovery: found {len(pdf_urls)} PDF links, source type={page_source_type}")

    # Step 3: Download PDFs
    downloaded = []
    pdf_texts = ""
    pdf_sources = []

    if pdf_urls:
        logger.info(f"Discovery: downloading {len(pdf_urls)} PDFs")
        downloaded = asyncio.run(download_pdfs(pdf_urls, page_url=url))

        if downloaded:
            pdf_data = parse_pdf(downloaded)
            pdf_texts = pdf_data["text"]
            pdf_sources = pdf_data["sources"]

    logger.info(f"Discovery: complete — {len(downloaded)} PDFs downloaded, {len(pdf_texts)} chars of text")

    return {
        "property_metadata": metadata,
        "pdf_texts": pdf_texts,
        "pdf_sources": pdf_sources,
        "downloaded_pdfs": downloaded,
        "page_source_type": page_source_type,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && .venv/bin/python -m pytest tests/test_discovery.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add graph/discovery.py tests/test_discovery.py
git commit -m "feat: add discovery node for auction page scraping and PDF download"
```

---

### Task 4: Update workflow to include discovery node

**Files:**
- Modify: `graph/workflow.py`
- Modify: `tests/test_workflow.py`

- [ ] **Step 1: Write the failing tests**

Add these tests to `tests/test_workflow.py` (and update existing ones):

```python
# Add import at the top of the file
from graph.discovery import discovery_node


# Update test_workflow_has_four_nodes to test_workflow_has_five_nodes:
def test_workflow_has_five_nodes():
    """The compiled graph should contain discovery, planner, market, legal, and reporter nodes."""
    workflow = create_workflow()

    node_names = set(workflow.nodes.keys())
    expected = {"discovery", "planner", "market", "legal", "reporter"}
    assert expected.issubset(node_names), f"Expected nodes {expected} to be subset of {node_names}"


# Update test_workflow_entry_point_is_planner to test_workflow_entry_point_is_discovery:
def test_workflow_entry_point_is_discovery():
    """The first node executed should be the discovery node."""
    workflow = create_workflow()

    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "", "html": ""}),
        patch("graph.discovery._call_discovery_llm", return_value=_discovery_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.planner._call_planner_llm") as mock_planner_llm,
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.reporter._call_reporter_llm") as mock_reporter_llm,
        patch("graph.market._run_market_searches", return_value=[]),
        patch("graph.legal._run_legal_searches", return_value=[]),
        patch("graph.reporter.generate_report_html", return_value="<html></html>"),
    ):
        _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm, mock_reporter_llm)
        call_order = []
        mock_planner_llm.side_effect = lambda *a, **kw: (call_order.append("planner"), _planner_response())[1]
        mock_market_llm.side_effect = lambda *a, **kw: (call_order.append("market"), _market_response())[1]
        mock_legal_llm.side_effect = lambda *a, **kw: (call_order.append("legal"), _legal_response())[1]
        mock_reporter_llm.side_effect = lambda *a, **kw: (call_order.append("reporter"), _reporter_response())[1]

        initial = AuctionState(auction_url="https://leiloes.caixa.gov.br/leilao/123", pdf_texts="Some PDF text")
        run_analysis(initial)

        assert call_order[0] == "planner", f"First call after discovery should be planner, got {call_order}"


def test_workflow_discovery_runs_before_planner():
    """Discovery must complete before planner starts."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "", "html": ""}),
        patch("graph.discovery._call_discovery_llm", return_value=_discovery_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.planner._call_planner_llm") as mock_planner_llm,
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.reporter._call_reporter_llm") as mock_reporter_llm,
        patch("graph.market._run_market_searches", return_value=[]),
        patch("graph.legal._run_legal_searches", return_value=[]),
        patch("graph.reporter.generate_report_html", return_value="<html></html>"),
    ):
        _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm, mock_reporter_llm)
        call_order = []
        mock_planner_llm.side_effect = lambda *a, **kw: (call_order.append("planner"), _planner_response())[1]
        mock_market_llm.side_effect = lambda *a, **kw: (call_order.append("market"), _market_response())[1]
        mock_legal_llm.side_effect = lambda *a, **kw: (call_order.append("legal"), _legal_response())[1]
        mock_reporter_llm.side_effect = lambda *a, **kw: (call_order.append("reporter"), _reporter_response())[1]

        initial = AuctionState(auction_url="https://test.com", pdf_texts="text")
        run_analysis(initial)

        planner_idx = call_order.index("planner")
        market_idx = call_order.index("market")
        legal_idx = call_order.index("legal")
        assert planner_idx < market_idx
        assert planner_idx < legal_idx


# Add the discovery mock helper:
def _discovery_response():
    """Build a MagicMock LLM response for the discovery node."""
    mock = MagicMock()
    mock.choices = [
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
                    "pdf_urls": [],
                    "page_source_type": "caixa",
                })
            )
        )
    ]
    return mock
```

Also update existing tests (`test_workflow_has_four_nodes`, `test_workflow_entry_point_is_planner`) to reflect the new node, or remove/replace them with the new tests above.

**Important:** Add `from unittest.mock import AsyncMock` to the test file imports if not already present.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && .venv/bin/python -m pytest tests/test_workflow.py -v`
Expected: FAIL — `create_workflow` does not include discovery node, tests for 5 nodes fail

- [ ] **Step 3: Update the workflow**

Replace `graph/workflow.py` with:

```python
"""LangGraph workflow assembly for auction property analysis.

Workflow:
    discovery -> planner -> [market, legal] (parallel) -> reporter -> END
"""

from langgraph.graph import StateGraph, END

from loguru import logger

from graph.state import AuctionState
from graph.discovery import discovery_node
from graph.planner import planner_node
from graph.market import market_node
from graph.legal import legal_node
from graph.reporter import reporter_node


def create_workflow():
    """Create the LangGraph workflow for auction property analysis.

    Flow: discovery -> planner -> [market, legal] (parallel) -> reporter -> END

    If the initial state has an auction_url, discovery runs first.
    If only pdf_texts is provided (no URL), discovery is skipped.

    Returns:
        Compiled LangGraph StateGraph.
    """
    graph = StateGraph(AuctionState)

    # Add nodes
    graph.add_node("discovery", discovery_node)
    graph.add_node("planner", planner_node)
    graph.add_node("market", market_node)
    graph.add_node("legal", legal_node)
    graph.add_node("reporter", reporter_node)

    # Set entry point
    graph.set_entry_point("discovery")

    # Conditional: discovery -> planner (always, discovery is a no-op if no URL)
    graph.add_edge("discovery", "planner")

    # Fan-out: planner -> market and planner -> legal (parallel)
    graph.add_edge("planner", "market")
    graph.add_edge("planner", "legal")

    # Fan-in: market -> reporter and legal -> reporter
    graph.add_edge("market", "reporter")
    graph.add_edge("legal", "reporter")

    # Reporter -> END
    graph.add_edge("reporter", END)

    return graph.compile()


def run_analysis(initial_state):
    """Run the full analysis workflow.

    Args:
        initial_state: Starting state with auction_url or pdf_texts.
            Can be an AuctionState dataclass instance or a dict.

    Returns:
        Final state dict with all results including report_html.
    """
    workflow = create_workflow()

    logger.info("Starting auction analysis workflow")

    result = workflow.invoke(initial_state)

    logger.info("Workflow completed")

    return result
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && .venv/bin/python -m pytest tests/test_workflow.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add graph/workflow.py tests/test_workflow.py
git commit -m "feat: add discovery node to LangGraph workflow"
```

---

### Task 5: Update Gradio UI with URL input

**Files:**
- Modify: `app.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_workflow.py` or create `tests/test_app.py`:

```python
"""Tests for the Gradio app entry points."""


def test_analyze_url_calls_workflow():
    """analyze_url should build AuctionState with auction_url and call run_analysis."""
    from unittest.mock import patch, MagicMock
    from app import analyze_url

    with patch("app.run_analysis") as mock_run:
        mock_run.return_value = {"report_html": "<html>Report</html>"}
        result = analyze_url("https://leiloes.caixa.gov.br/leilao/123")

    mock_run.assert_called_once()
    call_args = mock_run.call_args[0][0]
    assert call_args.auction_url == "https://leiloes.caixa.gov.br/leilao/123"


def test_analyze_url_no_url():
    """analyze_url with empty URL should return an error message."""
    from app import analyze_url

    result = analyze_url("")
    assert "color:red" in result
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && .venv/bin/python -m pytest tests/test_app.py -v`
Expected: FAIL — `analyze_url` does not exist in `app.py`

- [ ] **Step 3: Update app.py**

Replace `app.py` with:

```python
"""Gradio UI for Leilao AI - paste a URL or drag-and-drop PDFs, get analysis report."""

import tempfile
from datetime import datetime
from pathlib import Path

import gradio as gr
from loguru import logger

from tools.pdf_parser import parse_pdf
from graph.state import AuctionState
from graph.workflow import run_analysis


def analyze_url(url: str) -> str:
    """Analyze an auction from a URL and return an HTML report."""
    if not url or not url.strip():
        return "<p style='color:red;'>Please enter an auction URL.</p>"

    url = url.strip()

    try:
        logger.info(f"Analyzing auction from URL: {url}")

        initial_state = AuctionState(auction_url=url)
        result = run_analysis(initial_state)

        report_html = result.get("report_html", "") if isinstance(result, dict) else getattr(result, "report_html", "")

        if not report_html:
            return "<p style='color:red;'>Analysis completed but no report was generated.</p>"

        # Save to file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_dir = Path("reports") / timestamp
        report_dir.mkdir(parents=True, exist_ok=True)
        report_path = report_dir / "report.html"
        report_path.write_text(report_html, encoding="utf-8")

        logger.info(f"Report saved to {report_path}")

        return report_html

    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        return f"<p style='color:red;'>Analysis failed: {e}</p>"


def analyze_pdfs(files):
    """Analyze uploaded PDFs and return an HTML report."""
    if not files:
        return "<p style='color:red;'>Please upload at least one PDF.</p>"

    try:
        pdf_paths = [f for f in files]

        logger.info(f"Analyzing {len(pdf_paths)} document(s)")

        pdf_data = parse_pdf(pdf_paths)

        if not pdf_data["text"].strip():
            return "<p style='color:red;'>Could not extract text from the uploaded PDFs. They may be scanned images without OCR.</p>"

        initial_state = AuctionState(
            pdf_texts=pdf_data["text"],
            pdf_sources=pdf_data["sources"],
        )

        result = run_analysis(initial_state)

        report_html = result.get("report_html", "") if isinstance(result, dict) else getattr(result, "report_html", "")

        if not report_html:
            return "<p style='color:red;'>Analysis completed but no report was generated.</p>"

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_dir = Path("reports") / timestamp
        report_dir.mkdir(parents=True, exist_ok=True)
        report_path = report_dir / "report.html"
        report_path.write_text(report_html, encoding="utf-8")

        logger.info(f"Report saved to {report_path}")

        return report_html

    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        return f"<p style='color:red;'>Analysis failed: {e}</p>"


with gr.Blocks(
    title="Leilao AI - Analise de Leilao de Imovel",
) as app:
    gr.Markdown("# Leilao AI - Analise de Leilao de Imovel")

    with gr.Tab("URL do Leilao"):
        gr.Markdown("Cole a URL do leilao (Caixa, leiloeiro, site judicial, etc.)")
        url_input = gr.Textbox(
            label="URL do Leilao",
            placeholder="https://leiloes.caixa.gov.br/leilao/...",
        )
        url_btn = gr.Button("Analisar", variant="primary")

    with gr.Tab("Upload PDFs"):
        gr.Markdown("Arraste os PDFs do leilao (edital, matricula, laudo, certidoes)")
        file_input = gr.File(
            label="PDFs do Leilao",
            file_count="multiple",
            file_types=[".pdf"],
        )
        pdf_btn = gr.Button("Analisar", variant="primary")

    gr.Markdown("### Relatorio")
    report_output = gr.HTML(label="Relatorio de Analise")

    url_btn.click(
        fn=analyze_url,
        inputs=url_input,
        outputs=report_output,
    )

    pdf_btn.click(
        fn=analyze_pdfs,
        inputs=file_input,
        outputs=report_output,
    )


if __name__ == "__main__":
    app.launch(server_name="0.0.0.0", server_port=7860)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && .venv/bin/python -m pytest tests/test_app.py tests/test_workflow.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add app.py tests/test_app.py
git commit -m "feat: add URL input to Gradio UI with tab-based layout"
```

---

### Task 6: Run full test suite and fix any issues

**Files:**
- Potentially modify any test file that breaks

- [ ] **Step 1: Run the full test suite**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && .venv/bin/python -m pytest tests/ -v`
Expected: All tests PASS

- [ ] **Step 2: Fix any failures**

If any existing tests break (e.g., because the workflow now has a discovery node that needs mocking), update them to include the discovery mock pattern used in Task 4.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "fix: update all tests for discovery node integration"
```
