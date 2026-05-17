"""Discovery node: scrape an auction page, extract metadata and PDF links, download PDFs."""

import asyncio
import json
import re

import litellm
from loguru import logger

from config import get_settings
from graph.state import AuctionState, PropertyMetadata
from tools.pdf_downloader import download_pdfs
from tools.pdf_parser import parse_pdf
from tools.web_scraper import extract_dynamic_pdf_urls, scrape_page

DISCOVERY_SYSTEM_PROMPT = """You are a real estate auction page parser for Brazilian auction sites. Given the text content of an auction listing page, extract property details matching these fields:
- address: full property address
- property_type: type (Apartamento, Casa, Terreno, Comercial, etc.)
- area_m2: area in square meters (float)
- beds: number of bedrooms/dormitórios (int or null if not found)
- baths: number of bathrooms/banheiros (int or null if not found)
- parking: number of parking spots/vagas de garagem (int or null if not found)
- floor: floor/andar (string or null if not found, e.g. "12º andar")
- auction_price: 1ª praça minimum bid price as float. Look for "1ª praça", "1ª data", "1º leilão", "Lance inicial" followed by a price. This is the starting bid, NOT the market value.
- auction_price_2nd: 2ª praça minimum bid price as float, or 0 if not found. Look for "2ª praça", "2ª data", "2º leilão", "2ª Etapa" followed by a price. This is typically LOWER than 1ª praça. IMPORTANT: Many pages show both praças — always extract both.
- market_value_estimate: appraised/avaliação value ONLY if explicitly labeled as "valor de avaliação", "avaliação", or "valor de mercado" separately from the auction price. If no separate appraised value is shown, set to null. Do NOT use the auction price (1ª praça) as the market value — they are different things.
- auction_date: 1ª praça auction date string (e.g. "21/05/2026"). Look near "1ª praça", "1ª data", "1º leilão".
- auction_date_2nd: 2ª praça auction date string, or empty if not found. Look near "2ª praça", "2ª data", "2º leilão".
- auction_type: Judicial, Extrajudicial, Caixa, etc.
- matricula: matrícula number if shown (e.g. "67.309", "87.412")
- process_number: lawsuit process number. Look for "Processo:", "Número do Processo:", "processo nº". Format is CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO (e.g. 0000422-82.2022.8.16.0001). Must be 20 digits. Set to empty string if not found.
- court_or_leiloeiro: court name or auctioneer (kept for backwards compatibility)
- auctioneer_name: ONLY the auctioneer person/company name. Look for "Leiloeiro:", "LEILOEIRO OFICIAL:", "Leiloeiro Oficial". E.g. "Helcio Kronberg", "Zukerman Leilões". Do NOT include the court name here.
- court_name: ONLY the judicial court/vara name. Look for "Vara:", "Vara Cível", "Vara Federal". E.g. "13ª Vara Cível de Curitiba/PR". Empty if extrajudicial. The court and the auctioneer are DIFFERENT entities — never combine them.
- creditor: the Autor/Exequente (who is owed). Look for "Autor:", "Exequente:", "Credor:".
- debtor: the Réu/Executado (who owes). Look for "Réu:", "Executado:", "Devedor:".
- city: city name
- neighborhood: neighborhood/bairro
- state: state abbreviation (SP, RJ, PR, etc.)
Set any field you cannot find to an empty string, 0 for numbers, or null for optional fields.

CRITICAL RULES:
1. Always extract BOTH 1ª and 2ª praça prices when shown. Many auction pages display them side by side.
2. auction_price (1ª praça) and market_value_estimate (avaliação) are DIFFERENT. The auction price is the minimum bid; the market value is the appraised value. If only one price is shown, it's the auction price — set market_value_estimate to null.
3. auctioneer_name and court_name are DIFFERENT. The auctioneer runs the auction (e.g. "Helcio Kronberg"). The court is the judicial vara (e.g. "13ª Vara Cível de Curitiba/PR"). Never combine them.

Also identify the site type as one of: "caixa", "leiloeiro", "court", "aggregator", or "other"

Respond ONLY with a JSON object containing "property_metadata" and "page_source_type" keys."""

MAX_HTML_LENGTH = 30000


def _preprocess_kron_text(text: str) -> str:
    """Preprocess Kron Leiloes / Superbid page text to highlight key auction data.

    Kron pages flatten structured data into a wall of text that LLMs often
    fail to parse. This function extracts the key sections (pricing, process,
    auctioneer, court) and prepends a structured summary so the LLM can't
    miss them.

    Returns the original text with a prepended summary if a Kron page is
    detected, otherwise returns the text unchanged.
    """
    lower = text.lower()
    if "kron leil" not in lower and "superbid" not in lower:
        return text

    summary_parts = ["[STRUCTURED DATA EXTRACTED FROM PAGE]"]

    # Clean &nbsp; entities that may survive HTML stripping
    clean = text.replace("&nbsp;", " ")

    # Extract 1ª praça: look for "1ª praça DATE ... Lance inicial/atual: R$ PRICE"
    match = re.search(r"1ª praça\s+(\d{2}/\d{2}(?:/\d{4})?).*?Lance (?:inicial|atual):\s*R\$\s*([\d.,]+)", clean, re.IGNORECASE)
    if not match:
        match = re.search(r"1ª data.*?Lance inicial:\s*R\$\s*([\d.,]+)", clean, re.IGNORECASE)
    if match:
        groups = match.groups()
        if len(groups) == 2 and "/" in groups[0]:
            summary_parts.append(f"1ª praça date: {groups[0]}")
            summary_parts.append(f"1ª praça price: R$ {groups[1]}")
        elif len(groups) == 2:
            summary_parts.append(f"1ª praça price: R$ {groups[1]}")
        else:
            summary_parts.append(f"1ª praça price: R$ {groups[0]}")

    # Also extract "Lance atual" if separate
    match = re.search(r"Lance atual:\s*R\$\s*([\d.,]+)", clean, re.IGNORECASE)
    if match:
        summary_parts.append(f"1ª praça lance atual: R$ {match.group(1)}")

    # Extract 2ª praça: "2ª praça DATE ... Lance inicial: R$ PRICE"
    match = re.search(r"2ª praça\s+(\d{2}/\d{2}(?:/\d{4})?).*?Lance inicial:\s*R\$\s*([\d.,]+)", clean, re.IGNORECASE)
    if not match:
        match = re.search(r"2ª data.*?Lance inicial:\s*R\$\s*([\d.,]+)", clean, re.IGNORECASE)
    if not match:
        match = re.search(r"2ª Etapa.*?R\$\s*([\d.,]+)", clean, re.IGNORECASE)
    if match:
        groups = match.groups()
        if len(groups) == 2 and "/" in groups[0]:
            summary_parts.append(f"2ª praça date: {groups[0]}")
            summary_parts.append(f"2ª praça price: R$ {groups[1]}")
        elif len(groups) == 2:
            summary_parts.append(f"2ª praça price: R$ {groups[1]}")
        else:
            summary_parts.append(f"2ª praça price: R$ {groups[0]}")

    # Extract process number (CNJ format)
    match = re.search(r"(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})", text)
    if match:
        summary_parts.append(f"Process number: {match.group(1)}")

    # Extract auctioneer (Leiloeiro)
    match = re.search(r"LEILOEIRO OFICIAL:\s*([A-ZÀ-Ú\s]+?)(?:\s+Sujeito|\s+$)", clean, re.IGNORECASE)
    if not match:
        match = re.search(r"Leiloeiro:\s*([A-ZÀ-Ú\s]+?)(?:\s+Vendedor|\s+Valor|\s+$)", clean, re.IGNORECASE)
    if match:
        summary_parts.append(f"Auctioneer: {match.group(1).strip()}")

    # Extract court/Vara (handles both "Vara Cível" and "VARA CIVEL")
    match = re.search(r"(\d+ª\s+Vara\s+[A-ZÀ-Ú\s/]+?)(?:\s+Execução|\s+\d|\s+Leilão|\s+1ª)", clean, re.IGNORECASE)
    if not match:
        match = re.search(r"(\d+ª\s+VARA\s+[A-Z\s/]+?)(?:\s+Execu|\s+\d|\s+Leil|\s+1ª)", clean)
    if match:
        summary_parts.append(f"Court: {match.group(1).strip()}")

    # Extract Autor (creditor) and Réu (debtor)
    match = re.search(r"Autor:\s*([^\n]+?)(?:\s+Número|\s+Réu|\s+Ano)", clean, re.IGNORECASE)
    if match:
        summary_parts.append(f"Creditor (Autor): {match.group(1).strip()}")
    match = re.search(r"Réu:\s*([^\n]+?)(?:\s+Ano|\s+Tipo|\s+Comarca)", clean, re.IGNORECASE)
    if match:
        summary_parts.append(f"Debtor (Réu): {match.group(1).strip()}")

    # Extract matrícula
    match = re.search(r"matrícula\s*n[ºo°]?\s*([\d.]+)", clean, re.IGNORECASE)
    if match:
        summary_parts.append(f"Matrícula: {match.group(1)}")

    summary_parts.append("[END STRUCTURED DATA]")
    summary_parts.append("")

    return "\n".join(summary_parts) + text


def _extract_pdf_urls(html: str) -> list[str]:
    """Extract all PDF URLs from href attributes in the HTML.

    Finds both direct .pdf links and links to common document download
    patterns used by Brazilian auction sites.

    Args:
        html: Full HTML of the page.

    Returns:
        List of href values pointing to PDFs.
    """
    pdf_urls = []
    # Match href attributes containing .pdf (with optional query params)
    for match in re.finditer(r'href=["\']([^"\']*\.pdf[^"\']*)["\']', html, re.IGNORECASE):
        url = match.group(1)
        if url not in pdf_urls:
            pdf_urls.append(url)

    # Also match common download patterns (e.g., onclick handlers, data attributes)
    for match in re.finditer(r'(?:onclick|data-href|data-url)=["\']([^"\']*\.pdf[^"\']*)["\']', html, re.IGNORECASE):
        url = match.group(1)
        if url not in pdf_urls:
            pdf_urls.append(url)

    return pdf_urls


def _clean_html(html: str) -> str:
    """Strip scripts, styles, and tags from HTML to produce readable text.

    Removes noise (JS, CSS) that wastes LLM tokens, keeping only
    the visible text content that matters for metadata extraction.

    Args:
        html: Raw HTML string.

    Returns:
        Cleaned text content.
    """
    # Remove script and style blocks
    text = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', ' ', text)
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def _call_discovery_llm(html: str) -> object:
    """Call Claude Sonnet via LiteLLM to parse auction page HTML."""
    settings = get_settings()

    truncated = html[:MAX_HTML_LENGTH]
    if len(html) > MAX_HTML_LENGTH:
        logger.warning(f"Discovery: truncating HTML from {len(html)} to {MAX_HTML_LENGTH} chars")

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
            "downloaded_pdfs": [],
            "page_source_type": "",
            "errors": [f"Failed to scrape page: {url}"],
        }

    # Step 2: Extract PDF URLs — try static HTML first, fall back to dynamic clicks
    pdf_urls = _extract_pdf_urls(html)
    logger.info(f"Discovery: found {len(pdf_urls)} PDF links in static HTML")

    # Count PDF text labels (e.g. <a alt="la">file.pdf</a>) that lack href —
    # these are common in SPA sites like Kron/Superbid.
    pdf_labels = re.findall(r'<a[^>]*>([^<]*\.pdf)</a>', html, re.IGNORECASE)
    href_less_labels = [
        m.group(1)
        for m in re.finditer(r'<a(?![^>]*href)[^>]*>([^<]*\.pdf)</a>', html, re.IGNORECASE)
    ]
    if href_less_labels:
        logger.info(
            f"Discovery: found {len(href_less_labels)} PDF labels without href "
            f"({', '.join(href_less_labels)}), attempting dynamic extraction"
        )
        dynamic_urls = asyncio.run(extract_dynamic_pdf_urls(url))
        for du in dynamic_urls:
            if du not in pdf_urls:
                pdf_urls.append(du)
        logger.info(f"Discovery: total PDF URLs after dynamic extraction: {len(pdf_urls)}")

    # Step 3: LLM extracts property metadata from cleaned text
    logger.info("Discovery: parsing page content with LLM")
    cleaned = _clean_html(html)
    cleaned = _preprocess_kron_text(cleaned)
    try:
        response = _call_discovery_llm(cleaned)
        response_text = response.choices[0].message.content
    except Exception as e:
        logger.error(f"Discovery: LLM call failed: {e}")
        return {
            "property_metadata": PropertyMetadata(),
            "downloaded_pdfs": [],
            "page_source_type": "",
            "errors": [f"LLM call failed: {e}"],
        }

    try:
        text = response_text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            text = text.rsplit("```", 1)[0]
        parsed = json.loads(text.strip())

        metadata = PropertyMetadata(**parsed.get("property_metadata", {}))
        page_source_type = parsed.get("page_source_type", "other")
    except (json.JSONDecodeError, TypeError) as e:
        logger.error(f"Discovery: failed to parse LLM response: {e}")
        metadata = PropertyMetadata()
        page_source_type = "other"
        return {
            "property_metadata": metadata,
            "downloaded_pdfs": [],
            "page_source_type": page_source_type,
            "errors": [f"Failed to parse discovery response: {e}"],
        }

    logger.info(f"Discovery: source type={page_source_type}")

    # Step 3: Download PDFs
    downloaded = []
    pdf_texts = ""
    pdf_sources = []

    if pdf_urls:
        logger.info(f"Discovery: downloading {len(pdf_urls)} PDFs")
        downloaded = asyncio.run(download_pdfs(pdf_urls, page_url=url))

        if downloaded:
            try:
                pdf_data = parse_pdf(downloaded)
                pdf_texts = pdf_data["text"]
                pdf_sources = pdf_data["sources"]
            except Exception as e:
                logger.error(f"Discovery: PDF parsing failed: {e}")

    logger.info(f"Discovery: complete — {len(downloaded)} PDFs downloaded, {len(pdf_texts)} chars of text")

    result = {
        "property_metadata": metadata,
        "downloaded_pdfs": downloaded,
        "page_source_type": page_source_type,
    }
    # Only set pdf_texts/pdf_sources when discovery actually found PDFs,
    # so we don't overwrite existing values from initial state.
    if pdf_texts:
        result["pdf_texts"] = pdf_texts
        result["pdf_sources"] = pdf_sources
    return result
