"""Deterministic extraction of structured facts from official Caixa notices."""

from __future__ import annotations

import re

import pymupdf


_PROPERTY_PRICE_RE = re.compile(
    r"(?m)^\s*(\d{7,14})\s*$\s*^\s*([\d.]+,\d{2})\s*$\s*^\s*([\d.]+,\d{2})\s*$"
)


def _clean(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip(" .")


def _line(text: str, pattern: str) -> str:
    match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
    return _clean(match.group(1)) if match else ""


def _paragraph(text: str, pattern: str) -> str:
    match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE | re.DOTALL)
    return _clean(match.group(1)) if match else ""


def _brl(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return float(value.replace(".", "").replace(",", "."))
    except ValueError:
        return None


def extract_pdf_text(content: bytes) -> str:
    """Return text from a born-digital Caixa notice PDF."""
    with pymupdf.open(stream=content, filetype="pdf") as document:
        return "\n".join(page.get_text() for page in document)


def parse_edital_text(text: str, property_number: str) -> dict:
    """Extract shared auction facts and the matching Annex II property row."""
    if not text:
        return {}

    auction_number = _line(text, r"^\s*LICITA[CÇ][AÃ]O\s+CAIXA\s+N[º°O]\s*([^\n]+)")
    auction_number = re.sub(r"\s*/\s*", "/", auction_number)
    site = _line(text, r"^\s*LOCAL\s+DA\s+SESS[AÃ]O\s+DO\s+LEIL[AÃ]O\s*:\s*(?:No\s+site\s+)?([^\n]+)")
    auctioneer_name = _line(text, r"^\s*LEILOEIRO\(A\)\s+OFICIAL\s*:\s*([^\n]+)")
    phone = _line(text, r"^\s*TELEFONE\s*:\s*([^\n]+)")
    email = _line(text, r"^\s*E-MAIL\s*:\s*([^\n]+)")
    registration_state = _line(text, r"^\s*INSCRI[CÇ][AÃ]O\s+NA\s+JUNTA\s+COMERCIAL\s*\(UF\)\s*:\s*([^\n]+)")
    registration_number = _line(text, r"^\s*N[º°O]\s+DA\s+INSCRI[CÇ][AÃ]O\s*:\s*([^\n]+)")
    commission_terms = _line(text, r"^\s*COMISS[AÃ]O\s*:\s*([^\n]+)")
    commission_match = re.search(r"(\d+(?:[.,]\d+)?)\s*%", commission_terms)
    commission_rate = (
        float(commission_match.group(1).replace(",", ".")) / 100
        if commission_match else None
    )

    details = {
        "auctionNumber": auction_number,
        "auctioneerName": auctioneer_name,
        "auctioneerSite": site,
        "auctioneerPhone": phone,
        "auctioneerEmail": email,
        "auctioneerRegistration": _clean(
            " · ".join(filter(None, (registration_state, registration_number)))
        ),
        "commissionRate": commission_rate,
        "commissionTerms": commission_terms,
        "commissionPaymentDeadline": _line(
            text, r"^\s*PRAZO\s+PARA\s+PAGAMENTO\s+DA\s+COMISS[AÃ]O\s+DO\s+LEILOEIRO\s*:\s*([^\n]+)"
        ),
        "cashPaymentDeadline": _line(
            text, r"^\s*PRAZO\s+PARA\s+PAGAMENTO\s+DA\s+PARTE\s+A\s+VISTA\s*:\s*([^\n]+)"
        ),
        "registeredInstrumentDeadline": _paragraph(
            text,
            r"^\s*PRAZO\s+PARA\s+APRESENTA[CÇ][AÃ]O\s+DA\s+ESCRITURA/CONTRATO\s+REGISTRADO\s*:\s*(.+?)(?=\n\s*\n|\n\s*Grau\s+de\s+sigilo)",
        ),
        "resultDate": _line(
            text,
            r"^\s*(?:\d+(?:\.\d+)*\.\s*)?Data\s+de\s+Homologa[cç][aã]o\s+do\s+Resultado\s*:\s*([^\n]+)",
        ),
    }

    normalized_number = re.sub(r"\D", "", property_number or "").lstrip("0")
    matches = list(_PROPERTY_PRICE_RE.finditer(text))
    previous_end = 0
    for match in matches:
        candidate = match.group(1).lstrip("0")
        block = text[previous_end:match.start()]
        previous_end = match.end()
        if candidate != normalized_number:
            continue

        normalized_block = _clean(block)
        lot_candidates = re.findall(r"(?m)^\s*(\d{1,4})\s*$", block)
        iptu = re.search(r"IPTU\s*:\s*([\d./-]+)", normalized_block, re.IGNORECASE)
        matricula = re.search(r"Matr[ií]cula\s*:\s*([\d./-]+)", normalized_block, re.IGNORECASE)
        registry = re.search(r"Of[ií]cio\s*:\s*([\d./-]+)", normalized_block, re.IGNORECASE)
        alerts = []
        for sentence in re.split(r"(?<=[.!?])\s+", normalized_block):
            if re.search(
                r"gravame|penhora|indisponibilidade|regulariza[cç][aã]o|demoli[cç][aã]o|a[cç][aã]o judicial|[oô]nus",
                sentence,
                re.IGNORECASE,
            ):
                cleaned = _clean(sentence)
                if cleaned and cleaned not in alerts:
                    alerts.append(cleaned)
        details.update({
            "lotNumber": lot_candidates[-1] if lot_candidates else "",
            "propertyNumber": match.group(1),
            "minimumSalePrice": _brl(match.group(2)),
            "appraisalValue": _brl(match.group(3)),
            "iptuRegistration": iptu.group(1) if iptu else "",
            "matricula": matricula.group(1) if matricula else "",
            "registryOffice": registry.group(1) if registry else "",
            "alerts": alerts,
        })
        break

    return {key: value for key, value in details.items() if value not in (None, "", [])}


def merge_edital_data(*sources: dict | None) -> dict:
    """Merge facts without losing alerts collected from either official source."""
    merged: dict = {}
    alerts: list[str] = []
    for source in sources:
        if not source:
            continue
        for alert in source.get("alerts", []):
            if alert and alert not in alerts:
                alerts.append(alert)
        merged.update({key: value for key, value in source.items() if key != "alerts" and value not in (None, "")})
    if alerts:
        merged["alerts"] = alerts
    return merged
