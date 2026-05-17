# Discovery Agent Design

## Summary

Add a Discovery agent that takes an auction URL, scrapes the page, downloads all linked PDFs (edital, matricula, laudo, etc.), and feeds them into the existing analysis pipeline. This replaces manual PDF upload as the primary input method.

## Workflow Change

**Before:** `PDFs → Planner → [Market, Legal] → Reporter`

**After:** `URL → Discovery → Planner → [Market, Legal] → Reporter`

The Discovery node becomes the new entry point. The existing pipeline (planner onwards) stays unchanged.

## Components

### 1. Discovery Node (`graph/discovery.py`)

New LangGraph node that does 3 things sequentially:

1. **Scrape the auction page** — Playwright opens the URL, waits for JS rendering, extracts the full HTML
2. **Extract metadata + PDF links** — An LLM call (Claude Sonnet) parses the HTML to extract:
   - Property metadata fields (address, type, area, price, etc.) matching `PropertyMetadata`
   - List of PDF download URLs (edital, matricula, laudo, certidoes, etc.)
   - Page source type (Caixa, leiloeiro, court, aggregator)
3. **Download PDFs** — For each PDF link found, download to a temp directory, then parse with existing `pdf_parser.parse_pdf()`

### 2. State Changes (`graph/state.py`)

Add to `AuctionState`:
- `auction_url: str` — the input URL
- `downloaded_pdfs: list[str]` — paths to downloaded PDF files
- `page_source_type: str` — what kind of site was scraped (for reporting)

The existing `pdf_texts` and `pdf_sources` fields will be populated by the discovery node.

### 3. PDF Downloader Tool (`tools/pdf_downloader.py`)

Async downloader using httpx:
- Takes a list of URLs, downloads each to a temp directory
- Returns list of local file paths
- Handles: relative URLs (resolves against page URL), redirects, filename from Content-Disposition header
- Timeout per download: 30 seconds
- Max file size: 50MB per PDF

### 4. LLM Prompt for HTML Parsing

The discovery LLM call receives the scraped HTML (truncated to ~15K chars) and extracts:
- All `PropertyMetadata` fields it can find from the page
- All PDF URLs (hrefs ending in `.pdf` or labeled as documents)
- The site type classification (caixa, leiloeiro, court, aggregator)
- Response format: JSON with keys `property_metadata`, `pdf_urls`, `page_source_type`

### 5. Workflow Assembly (`graph/workflow.py`)

New graph:
```
discovery -> planner -> [market, legal] (parallel) -> reporter -> END
```

Discovery is the new entry point. The planner still runs to refine the research plan based on the PDF text (discovery provides initial metadata, planner can enrich it).

### 6. Entry Point Changes

- **Primary flow:** User provides URL → discovery runs → pipeline continues
- **Fallback:** PDF upload still works (backward compatible) — skips discovery, goes straight to planner
- Gradio UI gets a URL input field alongside the existing file upload

## Supported Sites

The agent works with any auction site that renders in a browser:
- Caixa (leiloes.caixa.gov.br)
- Leiloeiro sites (Zukerman, Coimbra, Franco, etc.)
- Aggregators (ProLeilao, SpyLeiloes)
- Court sites (TJSP, TJRJ, etc.)

No site-specific parsers — the LLM interprets HTML generically. This trades per-site reliability for zero maintenance cost.

## Error Handling

- Page load failure: report error, suggest user check the URL
- No PDFs found: proceed with metadata extracted from the page only
- PDF download failure: log warning, continue with whatever PDFs succeeded
- LLM parse failure: fall back to empty metadata, let planner handle it
- Anti-bot blocking: retry with longer wait; if still blocked, report to user

## Testing

- Unit tests for `pdf_downloader.py` (mock HTTP responses)
- Integration test with sample HTML pages (fixtures for Caixa, leiloeiro, court)
- Test that discovery output feeds correctly into planner
