# Auction AI Agents - MVP Design Spec

## Overview

A Python script that analyzes Brazilian real estate auction documents using AI agents to produce comprehensive market and legal viability reports. This is the core agent logic only — no UI, no CLI framework, no project scaffolding. Just: PDF(s) in → agents run → HTML report out.

Each analysis run targets **one property**. The user provides one or more PDFs that all belong to that single property (edital, matrícula, laudo de avaliação, certidões, etc.). The Planner Agent consolidates all documents before dispatching research.

The Gradio UI, Click CLI, and full project packaging are deferred to a later iteration.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 Python Script                    │
│     python analyze.py pdf1.pdf pdf2.pdf ...      │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│            Planner Agent (Claude Opus)           │
│  - Parse PDFs, extract property metadata         │
│  - Create research plan per property             │
│  - Dispatch & coordinate subagents               │
│  - Review results for gaps                       │
└──────┬──────────────────────┬───────────────────┘
       │                      │
       ▼                      ▼
┌──────────────┐    ┌──────────────────┐
│ Market Agent │    │  Legal Agent     │
│  (GPT-4o)    │    │ (Claude Sonnet)  │
└──────┬───────┘    └───────┬──────────┘
       │                    │
       ▼                    ▼
┌─────────────────────────────────────────────────┐
│           Shared Tools Layer                     │
│  Tavily Search │ Playwright Scraper │ PDF Parser │
└─────────────────────────────────────────────────┘
       │                    │
       ▼                    ▼
┌─────────────────────────────────────────────────┐
│           Report Writer Agent (Claude Sonnet)    │
└─────────────────────────────────────────────────┘
```

### LangGraph Workflow

- StateGraph with Planner as supervisor
- Fan-out: Market + Legal agents run in parallel
- Fan-in: Report Writer fires after both subagents complete
- One property per run: all uploaded PDFs belong to the same property (edital, matrícula, laudo, certidões, etc.)
- Planner consolidates all documents into a single property profile before dispatching research

## Agent Specifications

### Planner Agent (Claude Opus)

**Input:** Raw PDF file(s) — all belonging to the same property

**Responsibilities:**
1. Extract all property metadata from each PDF via PDF parser tool
2. Consolidate information from all documents into a single property profile (edital + matrícula + laudo + certidões etc.)
3. Identify auction type (judicial, extrajudicial, Caixa, etc.)
4. Build a research plan tailored to the property
5. Dispatch Market + Legal agents in parallel
6. Review subagent results for gaps or contradictions
7. Send everything to Report Writer

**Extracted metadata includes:** address, property type, area, auction price, auction date, auction type, court/leiloeiro info, matrícula number

### Market Analyst Agent (GPT-4o)

**Input:** Property metadata from Planner

**Research tasks:**
- Price per m² in the neighborhood and city
- Comparable properties for sale nearby (Zap Imóveis, Viva Real)
- Estimated reform cost (basic: floor + paint + essentials, sized by area)
- Area appreciation rate (last 1yr, 3yr, 5yr)
- City appreciation rate
- Real estate liquidity (avg days on market in the area)
- Market tendencies (supply/demand, new developments, infrastructure projects)
- Discount calculation: auction price vs estimated market value, net of reform costs

**Output:** Structured JSON with all findings + `market_score` (1-10)

### Legal Analyst Agent (Claude Sonnet)

**Input:** Property metadata + full extracted PDF text from all documents (edital, matrícula, laudo, certidões, etc.)

**Research tasks:**
- Property registration status (matrícula do imóvel)
- Existing liens/penhoras/ônibus reais
- Judicial disputes (ações judiciais, execuções)
- Tax debts (IPTU, ITBI, municipal debts)
- Condominium debts (débitos condominiais)
- Federal/state tax debts (Dívida Ativa)
- Zoning compliance (zoneamento, uso do solo)
- Construction permits (habite-se, alvará)
- Occupation status (occupied by owner, tenant, squatter)
- Any usufruct/right of use registered
- Risk score calculation — weighted assessment of all legal findings

**Output:** Structured JSON with all findings + `risk_level` (low/medium/high/critical) + `risk_details`

### Report Writer Agent (Claude Sonnet)

**Input:** Combined state from all agents

**Output:** Simple HTML report structured as:
1. Property Summary
2. Market Analysis (with tables, discount calculation)
3. Legal Viability Assessment (with risk matrix)
4. Reform Estimate
5. Investment Recommendation (buy/pass/conditional with reasoning)

## Data Flow

```
1. User uploads PDF(s) via Gradio UI or CLI — all PDFs belong to one property

2. Planner Agent receives all PDFs
   ├─ PDF Parser extracts text + metadata from each document
   ├─ Consolidate all document data into a single property profile
   ├─ Planner creates research_plan
   └─ Fan-out: dispatch Market + Legal agents

   b. Market Agent executes:
      ├─ Tavily search: "preço m² [bairro] [cidade]"
      ├─ Tavily search: "imóveis à venda [endereco]"
      ├─ Playwright scrape: Zap Imóveis comps
      ├─ Tavily search: "valorização imobiliária [cidade]"
      └─ Compile findings → market_result

   c. Legal Agent executes:
      ├─ Tavily search: property registration status
      ├─ Tavily search: judicial actions on address
      ├─ Playwright scrape: cartório online records
      ├─ Analyze edital text for legal red flags
      └─ Compile findings → legal_result

   d. Fan-in: Planner reviews both results

3. Report Writer generates HTML report

4. Output saved to ./reports/{timestamp}/report.html
```

## Tech Stack

| Component | Choice | Why |
|---|---|---|
| Language | Python 3.12+ | AI/ML ecosystem |
| Agent Framework | LangGraph | Multi-agent orchestration, state management |
| PDF Parsing | PyMuPDF (fitz) | Fast, reliable text extraction |
| OCR Fallback | pytesseract | For scanned/image PDFs |
| Web Search | Tavily API | Built for AI agents, structured results |
| Web Scraping | Playwright | Handles JS-heavy Brazilian real estate sites |
| LLM - Planner | Claude Opus via LiteLLM/OpenRouter | Strong reasoning for planning + synthesis |
| LLM - Legal | Claude Sonnet via LiteLLM/OpenRouter | Good reasoning, cost-effective |
| LLM - Market | GPT-4o via LiteLLM/OpenRouter | Best-of-breed mix |
| LLM - Report | Claude Sonnet via LiteLLM/OpenRouter | Strong structured writing |
| HTML Templating | Jinja2 | Simple, Python-standard |
| Config | Pydantic Settings | Env vars + .env validation |
| Logging | Loguru | Simple structured logging |

## Project Structure

```
leilao/
├── analyze.py                  # Script entry point
├── config.py                   # Pydantic Settings + .env
├── graph/
│   ├── __init__.py
│   ├── state.py                # Shared state schema
│   ├── planner.py              # Planner agent node
│   ├── market.py               # Market analyst agent node
│   ├── legal.py                # Legal analyst agent node
│   ├── reporter.py             # Report writer agent node
│   └── workflow.py             # LangGraph StateGraph definition
├── tools/
│   ├── __init__.py
│   ├── pdf_parser.py           # PDF text extraction
│   ├── web_search.py           # Tavily search wrapper
│   └── web_scraper.py          # Playwright scraper
├── report/
│   ├── __init__.py
│   ├── generator.py            # HTML generation via Jinja2
│   └── templates/
│       └── report.html         # Jinja2 template
├── requirements.txt
└── .env.example
```

## Error Handling

- **PDF parse failure**: Attempt OCR fallback with pytesseract, abort if still failing
- **Web search rate limits**: Exponential backoff (2s, 4s, 8s), max 3 retries per search
- **Scraping failures**: Skip that data source, mark as "unavailable" in report, continue with search results
- **LLM API failures**: Retry once, if still failing — partial report with available data + warning section listing what couldn't be researched
- **Invalid/missing property data from PDF**: Planner flags gaps, subagents search with what's available, report includes "data quality" section

## Environment Requirements

**System-level:**
- Python 3.12+
- Tesseract OCR (scanned PDF fallback): `brew install tesseract` on macOS
- Playwright browsers: installed via `playwright install`

**API keys (.env):**
- `OPENROUTER_API_KEY` — Unified LLM access (Claude Opus/Sonnet, GPT-4o)
- `TAVILY_API_KEY` — Web search

**Python packages (requirements.txt):**
- `langgraph`, `langchain-core` — agent orchestration
- `litellm` — unified LLM access via OpenRouter
- `tavily-python` — web search
- `pymupdf`, `pytesseract` — PDF parsing
- `playwright` — web scraping
- `jinja2` — HTML templating
- `pydantic-settings` — config management
- `loguru` — logging

## MVP Scope

### IN
- Python script (analyze.py) that takes PDF file paths as args
- 4 agents (Planner, Market, Legal, Reporter) via LangGraph
- Tavily search + Playwright scraping
- Parallel market + legal research
- Simple raw HTML report (no styling, no maps, no JS — just structured content)

### OUT (for now, later iteration)
- Gradio UI / Click CLI
- Map integration (Airbnb-style)
- Auction listing aggregation / scraping
- User accounts / saved reports
- Database / persistence
- PDF output
- Pricing comparison dashboard
- Notification system
