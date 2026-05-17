# Auction AI Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python script that takes real estate auction PDFs, runs them through a LangGraph multi-agent pipeline (Planner, Market, Legal, Reporter), and outputs a raw HTML viability report.

**Architecture:** LangGraph StateGraph with Planner as supervisor. Market and Legal agents fan-out in parallel, fan-in to Reporter agent. Each agent uses LLM + tools (Tavily search, Playwright scraper, PDF parser). Shared state carries property data, research results, and report content through the graph.

**Tech Stack:** Python 3.12+, LangGraph, LiteLLM + OpenRouter (unified LLM access), Tavily, Playwright, PyMuPDF, pytesseract, Jinja2, Pydantic Settings, Loguru

---

## File Structure

```
leilao/
├── analyze.py                  # Entry point: takes PDF paths, runs workflow, saves HTML
├── config.py                   # Pydantic Settings: API keys from .env
├── graph/
│   ├── __init__.py
│   ├── state.py                # TypedDict state schema for LangGraph
│   ├── planner.py              # Planner agent node (Claude Opus)
│   ├── market.py               # Market analyst agent node (GPT-4o)
│   ├── legal.py                # Legal analyst agent node (Claude Sonnet)
│   ├── reporter.py             # Report writer agent node (Claude Sonnet)
│   └── workflow.py             # StateGraph definition: planner → [market, legal] → reporter
├── tools/
│   ├── __init__.py
│   ├── pdf_parser.py           # PyMuPDF extraction + pytesseract OCR fallback
│   ├── web_search.py           # Tavily API wrapper with retry logic
│   └── web_scraper.py          # Playwright scraper for Zap/Cartório sites
├── report/
│   ├── __init__.py
│   ├── generator.py            # Jinja2 HTML rendering
│   └── templates/
│       └── report.html         # Jinja2 template for raw HTML report
├── tests/
│   ├── __init__.py
│   ├── test_pdf_parser.py
│   ├── test_web_search.py
│   ├── test_web_scraper.py
│   ├── test_state.py
│   ├── test_planner.py
│   ├── test_market.py
│   ├── test_legal.py
│   ├── test_reporter.py
│   ├── test_workflow.py
│   └── fixtures/
│       └── sample_edital.pdf   # Minimal test PDF
├── requirements.txt
└── .env.example
```

---

### Task 1: Project Scaffolding + Config

**Files:**
- Create: `requirements.txt`
- Create: `.env.example`
- Create: `config.py`
- Create: `graph/__init__.py`
- Create: `tools/__init__.py`
- Create: `report/__init__.py`
- Create: `tests/__init__.py`

- [ ] **Step 1: Create requirements.txt**

```txt
langgraph>=0.2.0
langchain-core>=0.3.0
litellm>=1.50.0
tavily-python>=0.5.0
pymupdf>=1.24.0
pytesseract>=0.3.10
playwright>=1.48.0
jinja2>=3.1.0
pydantic-settings>=2.5.0
loguru>=0.7.0
pytest>=8.0.0
pytest-asyncio>=0.24.0
```

- [ ] **Step 2: Create .env.example**

```env
OPENROUTER_API_KEY=your_openrouter_key_here
TAVILY_API_KEY=your_tavily_key_here
```

- [ ] **Step 3: Create config.py**

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openrouter_api_key: str
    tavily_api_key: str

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 4: Create empty `__init__.py` files**

Create `graph/__init__.py`, `tools/__init__.py`, `report/__init__.py`, `tests/__init__.py` — all empty.

- [ ] **Step 5: Install dependencies**

Run: `pip install -r requirements.txt && playwright install`
Expected: All packages install successfully, Playwright browsers download.

- [ ] **Step 6: Write failing test for config**

Create `tests/test_config.py`:

```python
import os
from unittest.mock import patch

from config import Settings


def test_settings_loads_from_env():
    env = {
        "OPENROUTER_API_KEY": "test-openrouter",
        "TAVILY_API_KEY": "test-tavily",
    }
    with patch.dict(os.environ, env, clear=True):
        settings = Settings()
        assert settings.openrouter_api_key == "test-openrouter"
        assert settings.tavily_api_key == "test-tavily"
```

- [ ] **Step 7: Run test to verify it passes**

Run: `python -m pytest tests/test_config.py -v`
Expected: PASS (pydantic-settings reads from env vars directly)

- [ ] **Step 8: Commit**

```bash
git add requirements.txt .env.example config.py graph/__init__.py tools/__init__.py report/__init__.py tests/__init__.py tests/test_config.py
git commit -m "feat: project scaffolding with config and dependencies"
```

---

### Task 2: PDF Parser Tool

**Files:**
- Create: `tools/pdf_parser.py`
- Create: `tests/test_pdf_parser.py`
- Create: `tests/fixtures/sample_edital.pdf`

- [ ] **Step 1: Write failing tests**

Create `tests/test_pdf_parser.py`:

```python
import pytest
from tools.pdf_parser import parse_pdf


def test_parse_pdf_with_text_pdf(tmp_path):
    """Test parsing a real text-based PDF."""
    pdf_path = tmp_path / "test.pdf"
    # We'll create a minimal PDF with pymupdf
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(
        (72, 72),
        "Edital de Leilão Judicial\n"
        "Endereço: Rua das Flores, 123, Centro, São Paulo - SP\n"
        "Área: 80m²\n"
        "Valor de Avaliação: R$ 500.000,00\n"
        "Valor de 1ª Praça: R$ 350.000,00\n"
        "Matrícula: 123.456\n"
        "Leiloeiro: João da Silva\n"
        "Data do Leilão: 15/06/2025",
    )
    doc.save(str(pdf_path))
    doc.close()

    result = parse_pdf(str(pdf_path))

    assert "text" in result
    assert "Rua das Flores" in result["text"]
    assert "metadata" in result
    assert result["metadata"]["page_count"] == 1


def test_parse_pdf_file_not_found():
    """Test that missing file raises FileNotFoundError."""
    with pytest.raises(FileNotFoundError):
        parse_pdf("/nonexistent/file.pdf")


def test_parse_multiple_pdfs(tmp_path):
    """Test parsing multiple PDFs into a combined result."""
    import fitz

    paths = []
    for i in range(2):
        pdf_path = tmp_path / f"doc_{i}.pdf"
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((72, 72), f"Document {i}: Content about property")
        doc.save(str(pdf_path))
        doc.close()
        paths.append(str(pdf_path))

    result = parse_pdf(paths)

    assert "Document 0" in result["text"]
    assert "Document 1" in result["text"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_pdf_parser.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.pdf_parser'`

- [ ] **Step 3: Write implementation**

Create `tools/pdf_parser.py`:

```python
from pathlib import Path

import fitz
from loguru import logger


def _extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from a single PDF using PyMuPDF. Falls back to OCR if no text found."""
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()

    if text.strip():
        return text

    logger.info(f"No text extracted from {pdf_path}, attempting OCR fallback")
    return _ocr_fallback(pdf_path)


def _ocr_fallback(pdf_path: str) -> str:
    """OCR fallback for scanned/image PDFs using pytesseract."""
    try:
        import pytesseract
        from PIL import Image

        doc = fitz.open(pdf_path)
        text = ""
        for page in doc:
            pix = page.get_pixmap(dpi=300)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            text += pytesseract.image_to_string(img, lang="por") + "\n"
        doc.close()
        return text
    except Exception as e:
        logger.error(f"OCR fallback failed for {pdf_path}: {e}")
        return ""


def _get_metadata(pdf_path: str) -> dict:
    """Extract basic metadata from a PDF."""
    doc = fitz.open(pdf_path)
    meta = {
        "page_count": doc.page_count,
        "file_name": Path(pdf_path).name,
    }
    doc.close()
    return meta


def parse_pdf(pdf_input: str | list[str]) -> dict:
    """Parse one or more PDFs and return combined text + metadata.

    Args:
        pdf_input: A single PDF path or list of PDF paths.

    Returns:
        dict with keys:
            - text: Combined text from all PDFs
            - metadata: List of per-file metadata dicts
            - sources: List of file paths processed
    """
    if isinstance(pdf_input, str):
        pdf_input = [pdf_input]

    combined_text = ""
    all_metadata = []
    sources = []

    for path in pdf_input:
        if not Path(path).exists():
            raise FileNotFoundError(f"PDF not found: {path}")

        logger.info(f"Parsing PDF: {path}")
        text = _extract_text_from_pdf(path)
        metadata = _get_metadata(path)

        combined_text += f"\n--- Documento: {Path(path).name} ---\n{text}\n"
        all_metadata.append(metadata)
        sources.append(path)

    return {
        "text": combined_text.strip(),
        "metadata": all_metadata,
        "sources": sources,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_pdf_parser.py -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add tools/pdf_parser.py tests/test_pdf_parser.py
git commit -m "feat: PDF parser tool with OCR fallback and multi-file support"
```

---

### Task 3: Web Search Tool (Tavily)

**Files:**
- Create: `tools/web_search.py`
- Create: `tests/test_web_search.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_web_search.py`:

```python
import json
from unittest.mock import AsyncMock, patch

import pytest

from tools.web_search import web_search


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
    with patch("tools.web_search.TavilyClient") as MockClient:
        client_instance = MockClient.return_value
        client_instance.search.return_value = mock_response

        result = await web_search("preço m² Centro São Paulo")

        assert len(result) == 1
        assert "R$ 12.000" in result[0]["content"]


@pytest.mark.asyncio
async def test_web_search_handles_empty_results():
    with patch("tools.web_search.TavilyClient") as MockClient:
        client_instance = MockClient.return_value
        client_instance.search.return_value = {"results": []}

        result = await web_search("nonexistent query")

        assert result == []


@pytest.mark.asyncio
async def test_web_search_retry_on_failure():
    with patch("tools.web_search.TavilyClient") as MockClient:
        client_instance = MockClient.return_value
        client_instance.search.side_effect = [Exception("Rate limit"), {"results": [{"title": "ok", "url": "http://x", "content": "ok"}]}]

        result = await web_search("test query")

        assert len(result) == 1
        assert client_instance.search.call_count == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_web_search.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.web_search'`

- [ ] **Step 3: Write implementation**

Create `tools/web_search.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_web_search.py -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add tools/web_search.py tests/test_web_search.py
git commit -m "feat: Tavily web search tool with retry logic"
```

---

### Task 4: Web Scraper Tool (Playwright)

**Files:**
- Create: `tools/web_scraper.py`
- Create: `tests/test_web_scraper.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_web_scraper.py`:

```python
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

    mock_browser = AsyncMock()
    mock_browser.new_page.return_value = mock_page
    mock_browser.close = AsyncMock()

    mock_playwright_instance = AsyncMock()
    mock_playwright_instance.chromium.launch.return_value = mock_browser
    mock_playwright_instance.stop = AsyncMock()

    with patch("tools.web_scraper.async_playwright", return_value=mock_playwright_instance):
        result = await scrape_page("https://example.com")

        assert result["title"] == "Test Page"
        assert "Apartamento Centro SP" in result["html"]
        assert result["url"] == "https://example.com"


@pytest.mark.asyncio
async def test_scrape_page_handles_failure():
    mock_playwright_instance = AsyncMock()
    mock_playwright_instance.chromium.launch.side_effect = Exception("Browser failed")
    mock_playwright_instance.stop = AsyncMock()

    with patch("tools.web_scraper.async_playwright", return_value=mock_playwright_instance):
        result = await scrape_page("https://example.com")

        assert result["html"] == ""
        assert result["title"] == ""
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_web_scraper.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.web_scraper'`

- [ ] **Step 3: Write implementation**

Create `tools/web_scraper.py`:

```python
from loguru import logger
from playwright.async_api import async_playwright


async def scrape_page(url: str, wait_seconds: int = 3) -> dict:
    """Scrape a web page using Playwright (headless Chromium).

    Args:
        url: URL to scrape.
        wait_seconds: Seconds to wait for JS rendering.

    Returns:
        dict with keys: url, title, html
    """
    pw = await async_playwright().start()
    try:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(url, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(wait_seconds * 1000)

        html = await page.content()
        title = await page.title()

        await page.close()
        await browser.close()

        return {"url": url, "title": title, "html": html}
    except Exception as e:
        logger.error(f"Scraping failed for {url}: {e}")
        return {"url": url, "title": "", "html": ""}
    finally:
        await pw.stop()


async def scrape_pages(urls: list[str], wait_seconds: int = 3) -> list[dict]:
    """Scrape multiple pages sequentially (to avoid rate limiting).

    Args:
        urls: List of URLs to scrape.
        wait_seconds: Seconds to wait per page for JS rendering.

    Returns:
        List of scrape result dicts.
    """
    results = []
    for url in urls:
        result = await scrape_page(url, wait_seconds)
        results.append(result)
    return results
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_web_scraper.py -v`
Expected: Both tests PASS

- [ ] **Step 5: Commit**

```bash
git add tools/web_scraper.py tests/test_web_scraper.py
git commit -m "feat: Playwright web scraper tool"
```

---

### Task 5: LangGraph State Schema

**Files:**
- Create: `graph/state.py`
- Create: `tests/test_state.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_state.py`:

```python
from graph.state import AuctionState, PropertyMetadata, MarketResult, LegalResult


def test_auction_state_defaults():
    state = AuctionState()
    assert state["pdf_texts"] == ""
    assert state["pdf_sources"] == []
    assert state["property_metadata"] is None
    assert state["research_plan"] == ""
    assert state["market_result"] is None
    assert state["legal_result"] is None
    assert state["report_html"] == ""


def test_property_metadata_fields():
    meta = PropertyMetadata(
        address="Rua das Flores, 123, Centro, São Paulo - SP",
        property_type="Apartamento",
        area_m2=80.0,
        auction_price=350000.0,
        market_value_estimate=None,
        auction_date="15/06/2025",
        auction_type="Judicial",
        matricula="123.456",
        court_or_leiloeiro="João da Silva",
        city="São Paulo",
        neighborhood="Centro",
        state="SP",
    )
    assert meta.address == "Rua das Flores, 123, Centro, São Paulo - SP"
    assert meta.area_m2 == 80.0


def test_market_result_fields():
    result = MarketResult(
        price_per_m2_neighborhood=12000.0,
        price_per_m2_city=9500.0,
        comparable_properties=[],
        reform_estimate=25000.0,
        area_appreciation_1y=5.0,
        area_appreciation_3y=15.0,
        area_appreciation_5y=30.0,
        city_appreciation_1y=4.0,
        liquidity_days=45,
        tendencies="Mercado em alta com novos empreendimentos",
        discount_percentage=30.0,
        market_score=7,
        raw_findings="",
    )
    assert result.market_score == 7
    assert result.discount_percentage == 30.0


def test_legal_result_fields():
    result = LegalResult(
        registration_status="Registrado",
        liens=[],
        judicial_disputes=[],
        tax_debts_iptu="Nenhum débito encontrado",
        tax_debts_itbi="Nenhum débito encontrado",
        condominium_debts="N/A",
        federal_state_debts="Nenhum débito encontrado",
        zoning_compliance="Residencial - Conforme",
        construction_permits="Habite-se concedido",
        occupation_status="Desocupado",
        usufruct_rights="Nenhum",
        risk_level="low",
        risk_details="Nenhum risco significativo identificado",
        raw_findings="",
    )
    assert result.risk_level == "low"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_state.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'graph.state'`

- [ ] **Step 3: Write implementation**

Create `graph/state.py`:

```python
from typing import TypedDict, Optional


class PropertyMetadata(TypedDict, total=False):
    address: str
    property_type: str
    area_m2: float
    auction_price: float
    market_value_estimate: Optional[float]
    auction_date: str
    auction_type: str
    matricula: str
    court_or_leiloeiro: str
    city: str
    neighborhood: str
    state: str


class ComparableProperty(TypedDict, total=False):
    address: str
    price: float
    area_m2: float
    price_per_m2: float
    source: str
    url: str


class MarketResult(TypedDict, total=False):
    price_per_m2_neighborhood: float
    price_per_m2_city: float
    comparable_properties: list[ComparableProperty]
    reform_estimate: float
    area_appreciation_1y: float
    area_appreciation_3y: float
    area_appreciation_5y: float
    city_appreciation_1y: float
    liquidity_days: int
    tendencies: str
    discount_percentage: float
    market_score: int  # 1-10
    raw_findings: str


class LegalResult(TypedDict, total=False):
    registration_status: str
    liens: list[str]
    judicial_disputes: list[str]
    tax_debts_iptu: str
    tax_debts_itbi: str
    condominium_debts: str
    federal_state_debts: str
    zoning_compliance: str
    construction_permits: str
    occupation_status: str
    usufruct_rights: str
    risk_level: str  # low, medium, high, critical
    risk_details: str
    raw_findings: str


class AuctionState(TypedDict, total=False):
    pdf_texts: str
    pdf_sources: list[str]
    property_metadata: PropertyMetadata
    research_plan: str
    market_result: MarketResult
    legal_result: LegalResult
    report_html: str
    errors: list[str]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_state.py -v`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add graph/state.py tests/test_state.py
git commit -m "feat: LangGraph state schema with property, market, and legal types"
```

---

### Task 6: Planner Agent Node

**Files:**
- Create: `graph/planner.py`
- Create: `tests/test_planner.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_planner.py`:

```python
import json
from unittest.mock import patch, MagicMock

from graph.state import AuctionState


def test_planner_extracts_metadata():
    """Test that planner node extracts property metadata from PDF text and creates a research plan."""
    from graph.planner import planner_node

    state: AuctionState = {
        "pdf_texts": "Edital de Leilão Judicial\n"
                      "Endereço: Rua das Flores, 123, Centro, São Paulo - SP\n"
                      "Área: 80m²\n"
                      "Valor de Avaliação: R$ 500.000,00\n"
                      "Valor de 1ª Praça: R$ 350.000,00\n"
                      "Matrícula: 123.456\n"
                      "Leiloeiro: João da Silva\n"
                      "Data do Leilão: 15/06/2025\n"
                      "Tipo: Apartamento",
        "pdf_sources": ["edital.pdf"],
    }

    mock_response = MagicMock()
    mock_response.choices = [
        MagicMock(
            message=MagicMock(
                content=json.dumps({
                    "property_metadata": {
                        "address": "Rua das Flores, 123, Centro, São Paulo - SP",
                        "property_type": "Apartamento",
                        "area_m2": 80.0,
                        "auction_price": 350000.0,
                        "market_value_estimate": 500000.0,
                        "auction_date": "15/06/2025",
                        "auction_type": "Judicial",
                        "matricula": "123.456",
                        "court_or_leiloeiro": "João da Silva",
                        "city": "São Paulo",
                        "neighborhood": "Centro",
                        "state": "SP",
                    },
                    "research_plan": "Research market prices in Centro, São Paulo. Check legal status of matrícula 123.456.",
                })
            )
        )
    ]

    with patch("graph.planner._call_planner_llm", return_value=mock_response):
        result = planner_node(state)

        assert result["property_metadata"]["city"] == "São Paulo"
        assert result["property_metadata"]["area_m2"] == 80.0
        assert "research_plan" in result
        assert "Centro" in result["research_plan"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_planner.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'graph.planner'`

- [ ] **Step 3: Write implementation**

Create `graph/planner.py`:

```python
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
        model="openrouter/anthropic/claude-opus-4",
        api_key=settings.openrouter_api_key,
        max_tokens=4096,
        messages=[
            {"role": "system", "content": PLANNER_SYSTEM_PROMPT},
            {"role": "user", "content": f"Extract property data from these documents:\n\n{pdf_texts}"},
        ],
    )


def planner_node(state: AuctionState) -> dict:
    """LangGraph node: Extract property metadata and create research plan from PDF text.

    Args:
        state: Current auction state with pdf_texts populated.

    Returns:
        Partial state update with property_metadata and research_plan.
    """
    pdf_texts = state.get("pdf_texts", "")

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
        parsed = json.loads(response_text)
        metadata = PropertyMetadata(**parsed.get("property_metadata", {}))
        research_plan = parsed.get("research_plan", "")
    except (json.JSONDecodeError, TypeError) as e:
        logger.error(f"Failed to parse planner response: {e}")
        metadata = PropertyMetadata()
        research_plan = "Could not parse property data. Proceeding with limited research."

    logger.info(f"Planner: identified property at {metadata.get('address', 'unknown address')}")

    return {
        "property_metadata": metadata,
        "research_plan": research_plan,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_planner.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add graph/planner.py tests/test_planner.py
git commit -m "feat: planner agent node with metadata extraction"
```

---

### Task 7: Market Analyst Agent Node

**Files:**
- Create: `graph/market.py`
- Create: `tests/test_market.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_market.py`:

```python
import json
from unittest.mock import patch, MagicMock, AsyncMock

from graph.state import AuctionState, PropertyMetadata


def test_market_node_returns_market_result():
    from graph.market import market_node

    state: AuctionState = {
        "pdf_texts": "Edital de Leilão",
        "pdf_sources": ["edital.pdf"],
        "property_metadata": PropertyMetadata(
            address="Rua das Flores, 123, Centro, São Paulo - SP",
            property_type="Apartamento",
            area_m2=80.0,
            auction_price=350000.0,
            auction_date="15/06/2025",
            auction_type="Judicial",
            city="São Paulo",
            neighborhood="Centro",
            state="SP",
        ),
        "research_plan": "Research market prices in Centro, São Paulo",
    }

    mock_search_results = [
        {"title": "Preço m²", "url": "http://x", "content": "R$ 12.000/m² no Centro"}
    ]

    mock_llm_response = MagicMock()
    mock_llm_response.choices = [
        MagicMock(
            message=MagicMock(
                content=json.dumps({
                    "price_per_m2_neighborhood": 12000.0,
                    "price_per_m2_city": 9500.0,
                    "comparable_properties": [],
                    "reform_estimate": 25000.0,
                    "area_appreciation_1y": 5.0,
                    "area_appreciation_3y": 15.0,
                    "area_appreciation_5y": 30.0,
                    "city_appreciation_1y": 4.0,
                    "liquidity_days": 45,
                    "tendences": "Mercado em alta",
                    "discount_percentage": 30.0,
                    "market_score": 7,
                    "raw_findings": "Search results indicate strong market",
                })
            )
        )
    ]

    with patch("graph.market._run_market_searches", new_callable=AsyncMock, return_value=mock_search_results), \
         patch("graph.market._call_market_llm", return_value=mock_llm_response):
        result = market_node(state)

        assert result["market_result"]["price_per_m2_neighborhood"] == 12000.0
        assert result["market_result"]["market_score"] == 7
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_market.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'graph.market'`

- [ ] **Step 3: Write implementation**

Create `graph/market.py`:

```python
import asyncio
import json

import litellm
from loguru import logger

from config import get_settings
from graph.state import AuctionState, MarketResult
from tools.web_search import web_search_multiple

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


async def _run_market_searches(metadata: dict) -> list[dict]:
    """Run targeted web searches for market data."""
    address = metadata.get("address", "")
    neighborhood = metadata.get("neighborhood", "")
    city = metadata.get("city", "")
    state = metadata.get("state", "")
    property_type = metadata.get("property_type", "")

    queries = [
        f"preço m² {neighborhood} {city} {state}",
        f"imóveis à venda {neighborhood} {city}",
        f"valorização imobiliária {city} 2024 2025",
        f"liquidez imóveis {neighborhood} {city}",
        f"tendências mercado imobiliário {city} {state}",
        f"custo reforma {property_type.lower()} {city} pintura piso",
    ]

    return await web_search_multiple(queries)


def _call_market_llm(metadata: dict, search_results: list[dict]) -> object:
    """Call GPT-4o via LiteLLM/OpenRouter for market analysis."""
    settings = get_settings()

    search_text = "\n".join(
        f"[{r.get('title', '')}] {r.get('content', '')} (Source: {r.get('url', '')})"
        for r in search_results
    )

    property_info = (
        f"Property: {metadata.get('property_type', '')} at {metadata.get('address', '')}\n"
        f"Area: {metadata.get('area_m2', '')} m²\n"
        f"Auction Price: R$ {metadata.get('auction_price', '')}\n"
        f"Market Value Estimate: R$ {metadata.get('market_value_estimate', 'N/A')}\n"
        f"Neighborhood: {metadata.get('neighborhood', '')}, {metadata.get('city', '')} - {metadata.get('state', '')}\n"
    )

    return litellm.completion(
        model="openrouter/openai/gpt-4o",
        api_key=settings.openrouter_api_key,
        max_tokens=4096,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": MARKET_SYSTEM_PROMPT},
            {"role": "user", "content": f"Property Info:\n{property_info}\n\nSearch Results:\n{search_text}"},
        ],
    )


def market_node(state: AuctionState) -> dict:
    """LangGraph node: Analyze market conditions for the property.

    Args:
        state: Current auction state with property_metadata populated.

    Returns:
        Partial state update with market_result.
    """
    metadata = state.get("property_metadata", {})
    if not metadata:
        logger.warning("Market agent: no property metadata available")
        return {
            "market_result": MarketResult(market_score=0, raw_findings="No property metadata available"),
            "errors": ["No property metadata for market analysis"],
        }

    logger.info(f"Market agent: researching {metadata.get('address', 'unknown property')}")

    # Run async searches synchronously within this sync node
    search_results = asyncio.run(_run_market_searches(metadata))
    logger.info(f"Market agent: collected {len(search_results)} search results")

    response = _call_market_llm(metadata, search_results)
    response_text = response.choices[0].message.content

    try:
        parsed = json.loads(response_text)
        market_result = MarketResult(**parsed)
    except (json.JSONDecodeError, TypeError) as e:
        logger.error(f"Failed to parse market response: {e}")
        market_result = MarketResult(market_score=0, raw_findings=response_text)

    logger.info(f"Market agent: score={market_result.get('market_score', 'N/A')}, discount={market_result.get('discount_percentage', 'N/A')}%")

    return {"market_result": market_result}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_market.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add graph/market.py tests/test_market.py
git commit -m "feat: market analyst agent node with Tavily search + GPT-4o"
```

---

### Task 8: Legal Analyst Agent Node

**Files:**
- Create: `graph/legal.py`
- Create: `tests/test_legal.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_legal.py`:

```python
import json
from unittest.mock import patch, MagicMock, AsyncMock

from graph.state import AuctionState, PropertyMetadata


def test_legal_node_returns_legal_result():
    from graph.legal import legal_node

    state: AuctionState = {
        "pdf_texts": "Edital de Leilão Judicial\nMatrícula: 123.456\nPenhora: Nenhuma",
        "pdf_sources": ["edital.pdf"],
        "property_metadata": PropertyMetadata(
            address="Rua das Flores, 123, Centro, São Paulo - SP",
            property_type="Apartamento",
            area_m2=80.0,
            auction_price=350000.0,
            auction_date="15/06/2025",
            auction_type="Judicial",
            matricula="123.456",
            city="São Paulo",
            neighborhood="Centro",
            state="SP",
        ),
        "research_plan": "Check legal status of matrícula 123.456",
    }

    mock_search_results = [
        {"title": "Certidão", "url": "http://x", "content": "Matrícula 123.456 - Sem ônus"}
    ]

    mock_llm_response = MagicMock()
    mock_llm_response.choices = [
        MagicMock(
            message=MagicMock(
                content=json.dumps({
                    "registration_status": "Registrado",
                    "liens": [],
                    "judicial_disputes": [],
                    "tax_debts_iptu": "Nenhum débito",
                    "tax_debts_itbi": "Nenhum débito",
                    "condominium_debts": "N/A",
                    "federal_state_debts": "Nenhum débito",
                    "zoning_compliance": "Residencial conforme",
                    "construction_permits": "Habite-se OK",
                    "occupation_status": "Desocupado",
                    "usufruct_rights": "Nenhum",
                    "risk_level": "low",
                    "risk_details": "Nenhum risco significativo",
                    "raw_findings": "Property clean",
                })
            )
        )
    ]

    with patch("graph.legal._run_legal_searches", new_callable=AsyncMock, return_value=mock_search_results), \
         patch("graph.legal._call_legal_llm", return_value=mock_llm_response):
        result = legal_node(state)

        assert result["legal_result"]["risk_level"] == "low"
        assert result["legal_result"]["registration_status"] == "Registrado"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_legal.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'graph.legal'`

- [ ] **Step 3: Write implementation**

Create `graph/legal.py`:

```python
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
- liens: array of strings (any penhoras, ônus reais, gravames found)
- judicial_disputes: array of strings (any ações judiciais, execuções)
- tax_debts_iptu: string (IPTU debt status)
- tax_debts_itbi: string (ITBI debt status)
- condominium_debts: string (condominium debt status)
- federal_state_debts: string (Dívida Ativa / federal-state debts)
- zoning_compliance: string (zoneamento status)
- construction_permits: string (habite-se, alvará status)
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


async def _run_legal_searches(metadata: dict) -> list[dict]:
    """Run targeted web searches for legal data."""
    address = metadata.get("address", "")
    matricula = metadata.get("matricula", "")
    city = metadata.get("city", "")
    state = metadata.get("state", "")
    neighborhood = metadata.get("neighborhood", "")

    queries = [
        f"certidão ônus matrícula {matricula} {city}",
        f"ações judiciais {address} {city}",
        f"dívida ativa {address} {city} {state}",
        f"IPTU débito {address} {city}",
        f"zoneamento {neighborhood} {city} {state}",
    ]

    return await web_search_multiple(queries)


def _call_legal_llm(metadata: dict, pdf_texts: str, search_results: list[dict]) -> object:
    """Call Claude Sonnet via LiteLLM/OpenRouter for legal analysis."""
    settings = get_settings()

    search_text = "\n".join(
        f"[{r.get('title', '')}] {r.get('content', '')} (Source: {r.get('url', '')})"
        for r in search_results
    )

    property_info = (
        f"Property: {metadata.get('property_type', '')} at {metadata.get('address', '')}\n"
        f"Matrícula: {metadata.get('matricula', 'N/A')}\n"
        f"Auction Type: {metadata.get('auction_type', 'N/A')}\n"
        f"Auction Price: R$ {metadata.get('auction_price', '')}\n"
        f"Location: {metadata.get('neighborhood', '')}, {metadata.get('city', '')} - {metadata.get('state', '')}\n"
    )

    return litellm.completion(
        model="openrouter/anthropic/claude-sonnet-4",
        api_key=settings.openrouter_api_key,
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
    """LangGraph node: Assess legal viability and risks for the property.

    Args:
        state: Current auction state with property_metadata and pdf_texts populated.

    Returns:
        Partial state update with legal_result.
    """
    metadata = state.get("property_metadata", {})
    pdf_texts = state.get("pdf_texts", "")

    if not metadata:
        logger.warning("Legal agent: no property metadata available")
        return {
            "legal_result": LegalResult(risk_level="critical", risk_details="No property metadata available", raw_findings=""),
            "errors": ["No property metadata for legal analysis"],
        }

    logger.info(f"Legal agent: researching {metadata.get('address', 'unknown property')}")

    search_results = asyncio.run(_run_legal_searches(metadata))
    logger.info(f"Legal agent: collected {len(search_results)} search results")

    response = _call_legal_llm(metadata, pdf_texts, search_results)
    response_text = response.choices[0].message.content

    try:
        parsed = json.loads(response_text)
        legal_result = LegalResult(**parsed)
    except (json.JSONDecodeError, TypeError) as e:
        logger.error(f"Failed to parse legal response: {e}")
        legal_result = LegalResult(risk_level="critical", risk_details=f"Parse error: {e}", raw_findings=response_text)

    logger.info(f"Legal agent: risk_level={legal_result.get('risk_level', 'N/A')}")

    return {"legal_result": legal_result}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_legal.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add graph/legal.py tests/test_legal.py
git commit -m "feat: legal analyst agent node with Claude Sonnet"
```

---

### Task 9: Report Writer Agent Node

**Files:**
- Create: `graph/reporter.py`
- Create: `report/templates/report.html`
- Create: `report/generator.py`
- Create: `tests/test_reporter.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_reporter.py`:

```python
import json
from unittest.mock import patch, MagicMock

from graph.state import AuctionState, PropertyMetadata, MarketResult, LegalResult


def test_reporter_node_generates_html():
    from graph.reporter import reporter_node

    state: AuctionState = {
        "pdf_texts": "Edital text",
        "pdf_sources": ["edital.pdf"],
        "property_metadata": PropertyMetadata(
            address="Rua das Flores, 123",
            property_type="Apartamento",
            area_m2=80.0,
            auction_price=350000.0,
            market_value_estimate=500000.0,
            auction_date="15/06/2025",
            auction_type="Judicial",
            city="São Paulo",
            neighborhood="Centro",
            state="SP",
        ),
        "research_plan": "Research plan",
        "market_result": MarketResult(
            price_per_m2_neighborhood=12000.0,
            price_per_m2_city=9500.0,
            reform_estimate=25000.0,
            discount_percentage=30.0,
            market_score=7,
            raw_findings="Good market",
        ),
        "legal_result": LegalResult(
            risk_level="low",
            risk_details="No significant risks",
            registration_status="Registrado",
            raw_findings="Clean property",
        ),
    }

    mock_llm_response = MagicMock()
    mock_llm_response.choices = [
        MagicMock(message=MagicMock(content="<h1>Relatório de Análise</h1><p>Property looks good</p>"))
    ]

    with patch("graph.reporter._call_reporter_llm", return_value=mock_llm_response):
        result = reporter_node(state)

        assert "report_html" in result
        assert "Relatório de Análise" in result["report_html"]


def test_report_generator_renders_template():
    from report.generator import generate_report_html

    html = generate_report_html(
        property_address="Rua das Flores, 123",
        property_type="Apartamento",
        area_m2=80.0,
        auction_price=350000.0,
        market_value_estimate=500000.0,
        auction_date="15/06/2025",
        auction_type="Judicial",
        market_result={"price_per_m2_neighborhood": 12000.0, "market_score": 7},
        legal_result={"risk_level": "low", "risk_details": "Clean"},
        analysis_html="<p>Detailed analysis here</p>",
    )

    assert "Rua das Flores" in html
    assert "Apartamento" in html
    assert "80.0" in html
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_reporter.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Create Jinja2 HTML template**

Create `report/templates/report.html`:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Relatório de Análise - Leilão de Imóvel</title>
</head>
<body>
    <h1>Relatório de Análise de Leilão de Imóvel</h1>

    <h2>1. Resumo do Imóvel</h2>
    <table>
        <tr><td><strong>Endereço</strong></td><td>{{ property_address }}</td></tr>
        <tr><td><strong>Tipo</strong></td><td>{{ property_type }}</td></tr>
        <tr><td><strong>Área</strong></td><td>{{ area_m2 }} m²</td></tr>
        <tr><td><strong>Valor de Leilão</strong></td><td>R$ {{ "{:,.2f}".format(auction_price) }}</td></tr>
        <tr><td><strong>Valor de Mercado (est.)</strong></td><td>R$ {{ "{:,.2f}".format(market_value_estimate) if market_value_estimate else "N/A" }}</td></tr>
        <tr><td><strong>Data do Leilão</strong></td><td>{{ auction_date }}</td></tr>
        <tr><td><strong>Tipo de Leilão</strong></td><td>{{ auction_type }}</td></tr>
    </table>

    <h2>2. Análise de Mercado</h2>
    {% if market_result %}
    <table>
        {% if market_result.price_per_m2_neighborhood %}<tr><td><strong>Preço m² (Bairro)</strong></td><td>R$ {{ "{:,.2f}".format(market_result.price_per_m2_neighborhood) }}</td></tr>{% endif %}
        {% if market_result.price_per_m2_city %}<tr><td><strong>Preço m² (Cidade)</strong></td><td>R$ {{ "{:,.2f}".format(market_result.price_per_m2_city) }}</td></tr>{% endif %}
        {% if market_result.discount_percentage %}<tr><td><strong>Desconto</strong></td><td>{{ market_result.discount_percentage }}%</td></tr>{% endif %}
        {% if market_result.reform_estimate %}<tr><td><strong>Estimativa de Reforma</strong></td><td>R$ {{ "{:,.2f}".format(market_result.reform_estimate) }}</td></tr>{% endif %}
        {% if market_result.market_score %}<tr><td><strong>Score de Mercado</strong></td><td>{{ market_result.market_score }}/10</td></tr>{% endif %}
        {% if market_result.liquidity_days %}<tr><td><strong>Liquidez (dias)</strong></td><td>{{ market_result.liquidity_days }}</td></tr>{% endif %}
    </table>
    {% endif %}

    <h2>3. Viabilidade Legal</h2>
    {% if legal_result %}
    <table>
        <tr><td><strong>Nível de Risco</strong></td><td>{{ legal_result.risk_level }}</td></tr>
        <tr><td><strong>Status de Registro</strong></td><td>{{ legal_result.registration_status }}</td></tr>
        <tr><td><strong>Detalhes do Risco</strong></td><td>{{ legal_result.risk_details }}</td></tr>
    </table>
    {% endif %}

    <h2>4. Análise Detalhada</h2>
    {{ analysis_html }}

    <hr>
    <p><em>Relatório gerado automaticamente por Leilão AI Agents</em></p>
</body>
</html>
```

- [ ] **Step 4: Create report generator**

Create `report/generator.py`:

```python
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from graph.state import MarketResult, LegalResult


TEMPLATE_DIR = Path(__file__).parent / "templates"


def generate_report_html(
    property_address: str,
    property_type: str,
    area_m2: float,
    auction_price: float,
    market_value_estimate: float | None,
    auction_date: str,
    auction_type: str,
    market_result: dict,
    legal_result: dict,
    analysis_html: str,
) -> str:
    """Render the report HTML template with analysis data.

    Args:
        All analysis data from the agent pipeline.

    Returns:
        Complete HTML string for the report.
    """
    env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)))
    template = env.get_template("report.html")

    return template.render(
        property_address=property_address,
        property_type=property_type,
        area_m2=area_m2,
        auction_price=auction_price,
        market_value_estimate=market_value_estimate,
        auction_date=auction_date,
        auction_type=auction_type,
        market_result=market_result,
        legal_result=legal_result,
        analysis_html=analysis_html,
    )
```

- [ ] **Step 5: Create reporter agent node**

Create `graph/reporter.py`:

```python
import json

import litellm
from loguru import logger

from config import get_settings
from graph.state import AuctionState
from report.generator import generate_report_html

REPORTER_SYSTEM_PROMPT = """You are a real estate investment report writer for Brazilian auction properties. Given all the analysis data, write a detailed HTML-formatted analysis section (no html/head/body tags - just the content sections).

Write in Brazilian Portuguese. Structure the content as:

<h3>4.1 Estimativa de Reforma</h3>
Detailed reform cost breakdown

<h3>4.2 Análise de Tendências</h3>
Market tendency analysis

<h3>4.3 Recomendação de Investimento</h3>
Final recommendation: COMPRA RECOMENDADA / NÃO RECOMENDADA / COMPRA CONDICIONAL
With clear reasoning based on market score, legal risk, discount percentage, and reform costs.

Be direct and practical. This is for investors making buy/pass decisions."""


def _call_reporter_llm(metadata: dict, market_result: dict, legal_result: dict) -> object:
    """Call Claude Sonnet via LiteLLM/OpenRouter to generate the detailed analysis HTML."""
    settings = get_settings()

    data_summary = (
        f"Property: {metadata.get('property_type', '')} - {metadata.get('address', '')}\n"
        f"Area: {metadata.get('area_m2', '')} m² | Auction Price: R$ {metadata.get('auction_price', '')}\n"
        f"Market Value Est: R$ {metadata.get('market_value_estimate', 'N/A')}\n\n"
        f"MARKET RESULT:\n{json.dumps(market_result, indent=2, ensure_ascii=False)}\n\n"
        f"LEGAL RESULT:\n{json.dumps(legal_result, indent=2, ensure_ascii=False)}\n"
    )

    return litellm.completion(
        model="openrouter/anthropic/claude-sonnet-4",
        api_key=settings.openrouter_api_key,
        max_tokens=4096,
        messages=[
            {"role": "system", "content": REPORTER_SYSTEM_PROMPT},
            {"role": "user", "content": f"Write the analysis section for this property:\n\n{data_summary}"},
        ],
    )


def reporter_node(state: AuctionState) -> dict:
    """LangGraph node: Generate the final HTML report.

    Args:
        state: Current auction state with all analysis results.

    Returns:
        Partial state update with report_html.
    """
    metadata = state.get("property_metadata", {})
    market_result = state.get("market_result", {})
    legal_result = state.get("legal_result", {})

    if not metadata:
        logger.warning("Reporter: no property metadata available")
        return {"report_html": "<p>Error: No property data available for report.</p>"}

    logger.info("Reporter: generating analysis section")

    response = _call_reporter_llm(metadata, market_result, legal_result)
    analysis_html = response.choices[0].message.content

    logger.info("Reporter: rendering HTML report")

    report_html = generate_report_html(
        property_address=metadata.get("address", "N/A"),
        property_type=metadata.get("property_type", "N/A"),
        area_m2=metadata.get("area_m2", 0),
        auction_price=metadata.get("auction_price", 0),
        market_value_estimate=metadata.get("market_value_estimate"),
        auction_date=metadata.get("auction_date", "N/A"),
        auction_type=metadata.get("auction_type", "N/A"),
        market_result=market_result,
        legal_result=legal_result,
        analysis_html=analysis_html,
    )

    logger.info("Reporter: HTML report generated")

    return {"report_html": report_html}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `python -m pytest tests/test_reporter.py -v`
Expected: Both tests PASS

- [ ] **Step 7: Commit**

```bash
git add graph/reporter.py report/templates/report.html report/generator.py tests/test_reporter.py
git commit -m "feat: report writer agent node with Jinja2 HTML template"
```

---

### Task 10: LangGraph Workflow Assembly

**Files:**
- Create: `graph/workflow.py`
- Create: `tests/test_workflow.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_workflow.py`:

```python
from unittest.mock import patch, MagicMock

from graph.state import AuctionState, PropertyMetadata, MarketResult, LegalResult


def test_workflow_graph_structure():
    """Test that the workflow graph has the correct nodes and edges."""
    from graph.workflow import create_workflow

    graph = create_workflow()
    node_names = set(graph.nodes.keys())

    assert "planner" in node_names
    assert "market" in node_names
    assert "legal" in node_names
    assert "reporter" in node_names


def test_workflow_runs_end_to_end_with_mocks():
    """Test full workflow execution with all agent nodes mocked."""
    from graph.workflow import run_analysis

    state: AuctionState = {
        "pdf_texts": "Edital de Leilão Judicial\nRua das Flores, 123",
        "pdf_sources": ["edital.pdf"],
    }

    planner_output = {
        "property_metadata": PropertyMetadata(
            address="Rua das Flores, 123",
            property_type="Apartamento",
            area_m2=80.0,
            auction_price=350000.0,
            city="São Paulo",
            neighborhood="Centro",
            state="SP",
        ),
        "research_plan": "Research plan",
    }
    market_output = {
        "market_result": MarketResult(market_score=7, discount_percentage=30.0, raw_findings="Good"),
    }
    legal_output = {
        "legal_result": LegalResult(risk_level="low", risk_details="Clean", raw_findings="Clean"),
    }
    reporter_output = {
        "report_html": "<h1>Report</h1><p>Analysis complete</p>",
    }

    with patch("graph.workflow.planner_node", return_value=planner_output) as mock_planner, \
         patch("graph.workflow.market_node", return_value=market_output) as mock_market, \
         patch("graph.workflow.legal_node", return_value=legal_output) as mock_legal, \
         patch("graph.workflow.reporter_node", return_value=reporter_output) as mock_reporter:

        result = run_analysis(state)

        mock_planner.assert_called_once()
        mock_market.assert_called_once()
        mock_legal.assert_called_once()
        mock_reporter.assert_called_once()
        assert "report_html" in result
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_workflow.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'graph.workflow'`

- [ ] **Step 3: Write implementation**

Create `graph/workflow.py`:

```python
from langgraph.graph import StateGraph, END

from loguru import logger

from graph.state import AuctionState
from graph.planner import planner_node
from graph.market import market_node
from graph.legal import legal_node
from graph.reporter import reporter_node


def create_workflow() -> StateGraph:
    """Create the LangGraph workflow for auction property analysis.

    Flow: planner → [market, legal] (parallel) → reporter → END

    Returns:
        Compiled LangGraph StateGraph.
    """
    graph = StateGraph(AuctionState)

    # Add nodes
    graph.add_node("planner", planner_node)
    graph.add_node("market", market_node)
    graph.add_node("legal", legal_node)
    graph.add_node("reporter", reporter_node)

    # Set entry point
    graph.set_entry_point("planner")

    # Fan-out: planner → market and planner → legal (parallel)
    graph.add_edge("planner", "market")
    graph.add_edge("planner", "legal")

    # Fan-in: market → reporter and legal → reporter
    graph.add_edge("market", "reporter")
    graph.add_edge("legal", "reporter")

    # Reporter → END
    graph.add_edge("reporter", END)

    return graph.compile()


def run_analysis(initial_state: AuctionState) -> dict:
    """Run the full analysis workflow.

    Args:
        initial_state: Starting state with pdf_texts and pdf_sources.

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

Run: `python -m pytest tests/test_workflow.py -v`
Expected: Both tests PASS

- [ ] **Step 5: Commit**

```bash
git add graph/workflow.py tests/test_workflow.py
git commit -m "feat: LangGraph workflow with planner→[market,legal]→reporter pipeline"
```

---

### Task 11: Entry Point Script

**Files:**
- Create: `analyze.py`

- [ ] **Step 1: Write implementation**

Create `analyze.py`:

```python
"""Analyze Brazilian real estate auction PDFs using AI agents.

Usage:
    python analyze.py path/to/edital.pdf [path/to/matricula.pdf ...]
"""

import sys
from datetime import datetime
from pathlib import Path

from loguru import logger

from tools.pdf_parser import parse_pdf
from graph.state import AuctionState
from graph.workflow import run_analysis


def main():
    if len(sys.argv) < 2:
        print("Usage: python analyze.py <pdf_path> [pdf_path2 ...]")
        print("  All PDFs must belong to the same property.")
        sys.exit(1)

    pdf_paths = [Path(arg).resolve() for arg in sys.argv[1:]]

    for path in pdf_paths:
        if not path.exists():
            print(f"Error: File not found: {path}")
            sys.exit(1)

    logger.info(f"Analyzing {len(pdf_paths)} document(s) for one property")

    # Step 1: Parse all PDFs
    pdf_data = parse_pdf([str(p) for p in pdf_paths])

    # Step 2: Build initial state
    initial_state: AuctionState = {
        "pdf_texts": pdf_data["text"],
        "pdf_sources": pdf_data["sources"],
    }

    # Step 3: Run the workflow
    result = run_analysis(initial_state)

    # Step 4: Save report
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_dir = Path("reports") / timestamp
    report_dir.mkdir(parents=True, exist_ok=True)

    report_path = report_dir / "report.html"
    report_path.write_text(result.get("report_html", "<p>No report generated</p>"), encoding="utf-8")

    logger.info(f"Report saved to {report_path}")
    print(f"\nReport saved to: {report_path}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Test the entry point help**

Run: `python analyze.py`
Expected: Usage message printed

- [ ] **Step 3: Commit**

```bash
git add analyze.py
git commit -m "feat: entry point script for auction PDF analysis"
```

---

### Task 12: End-to-End Smoke Test

**Files:**
- Create: `tests/fixtures/sample_edital.pdf`

- [ ] **Step 1: Create a minimal test PDF fixture**

Create `tests/fixtures/` directory and generate a sample PDF using Python:

```python
import fitz
doc = fitz.open()
page = doc.new_page()
page.insert_text((72, 72),
    "EDITAL DE LEILÃO JUDICIAL\n\n"
    "Processo nº 0012345-67.2024.8.26.0100\n"
    "Endereço: Rua Augusta, 1500, Consolação, São Paulo - SP, CEP 01304-001\n"
    "Tipo: Apartamento, 2 dormitórios\n"
    "Área: 65m²\n"
    "Valor de Avaliação: R$ 450.000,00\n"
    "Valor de 1ª Praça: R$ 315.000,00 (30% desconto)\n"
    "Matrícula: 789.012 do 9º Ofício de Registro de Imóveis de SP\n"
    "Leiloeiro: José da Silva - JUCESP 123\n"
    "Data do 1º Leilão: 20/07/2025 às 14h00\n"
    "Data do 2º Leilão: 18/08/2025 às 14h00\n"
    "Local: Rua Líbero Badaró, 120, Centro, São Paulo - SP\n\n"
    "O imóvel encontra-se desocupado.\n"
    "Débitos: Conforme certidões anexas.\n"
)
doc.save("tests/fixtures/sample_edital.pdf")
doc.close()
```

Run the script above to generate the fixture.

- [ ] **Step 2: Run the full pipeline with the fixture (requires API keys)**

Run: `python analyze.py tests/fixtures/sample_edital.pdf`
Expected: Report saved to `reports/<timestamp>/report.html` containing property summary, market analysis, legal assessment, and investment recommendation.

- [ ] **Step 3: Open the report and verify structure**

Open the generated HTML in a browser. Verify:
- Property summary table with address, area, prices
- Market analysis section with m² prices, discount, score
- Legal viability section with risk level
- Detailed analysis with reform estimate and recommendation
- All text in Portuguese

- [ ] **Step 4: Commit the fixture**

```bash
git add tests/fixtures/sample_edital.pdf
git commit -m "test: add sample edital PDF fixture for smoke tests"
```

---

### Task 13: Create AGENTS.md for Full Project Vision

**Files:**
- Create: `AGENTS.md`

- [ ] **Step 1: Write AGENTS.md**

Create `AGENTS.md`:

```markdown
# Leilão AI - Project Vision & Agent Architecture

## Product Vision

A platform that helps people find and evaluate real estate auctions in Brazil, with AI agents that automate market research and legal viability analysis.

## Market Context

Brazil's real estate auction market is growing fast. Properties are sold at significant discounts (30-70% below market) but carry complex legal risks. Current competitors (ProLeilão, SpyLeilões) aggregate listings but don't provide deep analysis. Our differential is AI-powered research that makes auction investing accessible and safer.

## Competitors

- **ProLeilão** (proleilao.com.br): Auction aggregation, basic property data, no AI analysis
- **SpyLeilões** (app.spyleiloes.com.br): Auction aggregation with map view, pricing data, no AI analysis

## Full Platform Architecture (Future)

```
┌─────────────────────────────────────────────┐
│                  Frontend                    │
│  Map view (Airbnb-style) │ Filters │ Search │
└──────────────────────┬──────────────────────┘
                       │
┌──────────────────────┴──────────────────────┐
│                 API Server                   │
│  FastAPI + Auth + Saved Reports + Alerts     │
└──────────────────────┬──────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
┌─────────────┐ ┌────────────┐ ┌──────────────┐
│  Auction    │ │  AI Agent  │ │   User       │
│  Scraper    │ │  Pipeline  │ │   Service    │
│  (Crawler)  │ │ (Current)  │ │ (Auth/Saved) │
└─────────────┘ └────────────┘ └──────────────┘
         │             │
         ▼             ▼
┌─────────────────────────────────────────────┐
│              Database (PostgreSQL)           │
│  Auctions │ Properties │ Reports │ Users     │
└─────────────────────────────────────────────┘
```

## AI Agent Pipeline (Current MVP)

The core intelligence — currently a standalone script, will become the backend service.

### Agents

| Agent | Model (via OpenRouter) | Purpose |
|-------|-------|---------|
| Planner | `openrouter/anthropic/claude-opus-4` | Extract property metadata from PDFs, create research plan, coordinate subagents |
| Market Analyst | `openrouter/openai/gpt-4o` | Research market prices, comparables, appreciation, liquidity, tendencies |
| Legal Analyst | `openrouter/anthropic/claude-sonnet-4` | Assess legal risks: liens, debts, judicial disputes, zoning, permits, occupation |
| Report Writer | `openrouter/anthropic/claude-sonnet-4` | Synthesize findings into structured investment report |

### Workflow

```
PDFs → Planner → [Market (parallel), Legal (parallel)] → Reporter → HTML Report
```

### Tools

- **PDF Parser** (PyMuPDF + pytesseract OCR fallback)
- **Web Search** (Tavily API with retry logic)
- **Web Scraper** (Playwright for Zap Imóveis, cartório sites)

## Phased Roadmap

### Phase 1 - MVP (Current)
- AI agent pipeline script
- PDF input → HTML report output
- Core 4 agents with LangGraph orchestration

### Phase 2 - Web App
- Gradio UI with drag-and-drop
- FastAPI backend
- Report storage and retrieval

### Phase 3 - Auction Aggregation
- Web scraper for auction sites (Caixa, judicial sites, leiloeiros)
- Map view with Airbnb-style filters
- Price history and market trends
- Discount calculation vs market price

### Phase 4 - Platform
- User accounts and saved searches
- Alert notifications for new auctions matching criteria
- Batch analysis for multiple properties
- Mobile-responsive UI

### Phase 5 - Advanced AI
- Neighborhood scoring model
- Automated bid strategy recommendations
- Historical auction outcome analysis
- Predictive pricing model

## Tech Stack

| Component | Current | Future |
|-----------|---------|--------|
| Language | Python 3.12+ | Python 3.12+ |
| Agent Framework | LangGraph | LangGraph |
| LLM Access | LiteLLM + OpenRouter | LiteLLM + OpenRouter |
| LLM - Planner | Claude Opus (OpenRouter) | Claude Opus |
| LLM - Legal | Claude Sonnet (OpenRouter) | Claude Sonnet |
| LLM - Market | GPT-4o (OpenRouter) | GPT-4o |
| LLM - Report | Claude Sonnet (OpenRouter) | Claude Sonnet |
| PDF Parsing | PyMuPDF | PyMuPDF |
| Web Search | Tavily | Tavily |
| Web Scraping | Playwright | Playwright + Scrapy |
| Frontend | None | React + Mapbox |
| Backend | None | FastAPI |
| Database | None | PostgreSQL |
| Deployment | Local script | Docker + AWS/GCP |
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add AGENTS.md with full project vision and roadmap"
```

---

## Self-Review

**Spec coverage:**
- [x] Python script entry point → Task 11
- [x] PDF parsing (PyMuPDF + OCR fallback) → Task 2
- [x] Multiple PDFs per property → Task 2 (`parse_pdf` accepts list)
- [x] Tavily web search with retry → Task 3
- [x] Playwright web scraping → Task 4
- [x] LangGraph StateGraph with parallel fan-out → Task 10
- [x] Planner agent (Claude) → Task 6
- [x] Market agent (GPT-4o) → Task 7
- [x] Legal agent (Claude Sonnet) → Task 8
- [x] Reporter agent (Claude Sonnet) → Task 9
- [x] Simple HTML report → Task 9
- [x] Error handling (retry, fallback, partial report) → Tasks 2-4
- [x] AGENTS.md → Task 13
- [x] Environment requirements → Task 1

**Placeholder scan:** No TBDs, TODOs, or vague steps found.

**Type consistency:** All state types use `AuctionState`, `PropertyMetadata`, `MarketResult`, `LegalResult` from `graph/state.py` consistently across all agent nodes and tests.
