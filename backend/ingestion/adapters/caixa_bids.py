"""Official registered-bid readers for properties sold by Caixa.

Caixa publishes Venda Online bids itself. Leilao SFI bids are hosted by the
official auctioneer named in Caixa's notice, so each supported auctioneer gets
its own small adapter. Only aggregate facts are retained: status, count and
highest amount. Bidder identifiers and names are deliberately ignored.
"""

from __future__ import annotations

import html as html_lib
import re
import unicodedata
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlencode, urljoin, urlparse

from curl_cffi.requests import AsyncSession
from loguru import logger


_SCRIPT_STYLE_RE = re.compile(
    r"<(?:script|style)\b[^>]*>.*?</(?:script|style)>",
    re.IGNORECASE | re.DOTALL,
)
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_BRL_RE = re.compile(r"R\$\s*([\d.]+,\d{2})", re.IGNORECASE)
_KLEILOES_LINK_RE = re.compile(
    r"href=['\"]([^'\"]*/oferta/leilao/imoveis/lote/[^'\"]+)['\"]",
    re.IGNORECASE,
)
_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def _visible_text(html: str) -> str:
    without_scripts = _SCRIPT_STYLE_RE.sub(" ", html or "")
    text = html_lib.unescape(_TAG_RE.sub(" ", without_scripts))
    return _WS_RE.sub(" ", text).strip()


def _fold(value: str) -> str:
    return "".join(
        char for char in unicodedata.normalize("NFKD", value or "")
        if not unicodedata.combining(char)
    ).casefold()


def _digits(value: str) -> str:
    return re.sub(r"\D", "", value or "").lstrip("0")


def _parse_brl(value: str) -> float:
    return float(value.replace(".", "").replace(",", "."))


def _observed_at(value: datetime | None = None) -> str:
    observed = value or datetime.now(timezone.utc)
    if observed.tzinfo is None:
        observed = observed.replace(tzinfo=timezone.utc)
    return observed.astimezone(timezone.utc).isoformat()


def _bid_record(
    *,
    status: str,
    source_label: str,
    source_url: str,
    count: int | None = None,
    highest_amount: float | None = None,
    observed_at: datetime | None = None,
) -> dict:
    record = {
        "status": status,
        "sourceLabel": source_label,
        "sourceUrl": source_url,
        "fetchedAt": _observed_at(observed_at),
    }
    if count is not None:
        record["count"] = count
    if highest_amount is not None:
        record["highestAmount"] = highest_amount
    return record


def caixa_online_bid_state(detail_html: str) -> str | None:
    """Return whether Caixa exposes an active Venda Online bid surface."""
    text = _fold(_visible_text(detail_html))
    if "imovel em disputa" in text or "lances registrados nessa disputa" in text:
        return "registered"
    if "regras da venda online" in text and "fazer uma proposta" in text:
        return "open"
    return None


def parse_caixa_bid_table(
    html: str,
    *,
    source_url: str,
    observed_at: datetime | None = None,
) -> dict | None:
    """Parse Caixa's public ranked table without retaining bidder identity."""
    text = _fold(_visible_text(html))
    if "nao ha dados" in text:
        return _bid_record(
            status="none",
            count=0,
            source_label="Caixa",
            source_url=source_url,
            observed_at=observed_at,
        )
    if "lances registrados nesta disputa" not in text:
        return None
    amounts = [_parse_brl(value) for value in _BRL_RE.findall(html or "")]
    if not amounts:
        return _bid_record(
            status="none",
            count=0,
            source_label="Caixa",
            source_url=source_url,
            observed_at=observed_at,
        )
    return _bid_record(
        status="registered",
        count=len(amounts),
        highest_amount=max(amounts),
        source_label="Caixa",
        source_url=source_url,
        observed_at=observed_at,
    )


def caixa_online_bid_status_from_html(
    detail_url: str,
    detail_html: str,
    *,
    bid_table_html: str = "",
    observed_at: datetime | None = None,
) -> dict | None:
    """Build the best verified Caixa status from its detail/table responses."""
    state = caixa_online_bid_state(detail_html)
    if state is None:
        return None
    parsed = parse_caixa_bid_table(
        bid_table_html, source_url=detail_url, observed_at=observed_at,
    ) if bid_table_html else None
    if state == "registered":
        if parsed is not None and parsed.get("status") == "registered":
            return parsed
        return _bid_record(
            status="registered",
            source_label="Caixa",
            source_url=detail_url,
            observed_at=observed_at,
        )
    return parsed


async def fetch_caixa_online_bid_status(
    client,
    detail_url: str,
    detail_html: str,
    *,
    observed_at: datetime | None = None,
) -> dict | None:
    """Fetch the public Venda Online table when Caixa exposes bidding."""
    state = caixa_online_bid_state(detail_html)
    if state is None:
        return None
    property_number = parse_qs(urlparse(detail_url).query).get("hdnimovel", [""])[0]
    if not property_number:
        return caixa_online_bid_status_from_html(
            detail_url, detail_html, observed_at=observed_at,
        )

    endpoint = urljoin(detail_url, "venda-online/carregaLances.asp")
    try:
        response = await client.post(
            endpoint,
            data={"p_hdnProposta": "", "p_hdnImovel": property_number},
            headers={"Referer": detail_url, "X-Requested-With": "XMLHttpRequest"},
            timeout=15,
            allow_redirects=True,
        )
        response.raise_for_status()
        parsed = caixa_online_bid_status_from_html(
            detail_url,
            detail_html,
            bid_table_html=response.text,
            observed_at=observed_at,
        )
        if parsed is not None:
            return parsed
    except Exception as exc:  # the page-level signal remains useful
        logger.debug("Caixa bid table unavailable for {}: {}", detail_url, exc)

    return caixa_online_bid_status_from_html(
        detail_url, detail_html, observed_at=observed_at,
    )


def parse_kleiloes_lot(
    html: str,
    *,
    source_url: str,
    expected_lot: str = "",
    expected_matricula: str = "",
    observed_at: datetime | None = None,
) -> dict | None:
    """Parse the public aggregate bid facts from an official Klöckner lot."""
    lot_match = re.search(
        r'id=["\']ctl00_ContentPlaceHolder1_NumeroLote["\'][^>]*>\s*(\d+)',
        html or "",
        re.IGNORECASE,
    )
    lot_number = lot_match.group(1) if lot_match else ""
    if expected_lot and lot_number != str(expected_lot).strip():
        return None

    if expected_matricula:
        page_matricula = re.search(
            r"Matr[ií]cula\s*:\s*([\d./-]+)", _visible_text(html), re.IGNORECASE,
        )
        if (
            not page_matricula
            or _digits(page_matricula.group(1)) != _digits(expected_matricula)
        ):
            return None

    count_match = re.search(
        r'class=["\'][^"\']*total-lances[^"\']*["\'][^>]*>\s*(\d+)',
        html or "",
        re.IGNORECASE,
    )
    if not count_match:
        return None
    count = int(count_match.group(1))
    amount_match = re.search(
        r'class=["\'][^"\']*lance-atual[^"\']*["\'][^>]*>\s*R\$\s*([\d.]+,\d{2})',
        html or "",
        re.IGNORECASE,
    )
    amount = _parse_brl(amount_match.group(1)) if amount_match else None
    status = "registered" if count > 0 else "none"
    if status == "registered" and amount is None:
        return None
    return _bid_record(
        status=status,
        count=count,
        highest_amount=amount,
        source_label="Leiloeiro oficial",
        source_url=source_url,
        observed_at=observed_at,
    )


def _kleiloes_search_term(address: str) -> str:
    street = (address or "").split(",", 1)[0]
    street = re.sub(
        r"^\s*(?:RUA|AVENIDA|AV\.?|ALAMEDA|TRAVESSA|RODOVIA|ESTRADA)\s+",
        "",
        street,
        flags=re.IGNORECASE,
    )
    return _WS_RE.sub(" ", street).strip()[:30]


def _normalized_site(site: str) -> str:
    value = (site or "").strip()
    if value and not re.match(r"^https?://", value, re.IGNORECASE):
        value = f"https://{value}"
    return value.rstrip("/")


async def _fetch_kleiloes_bid_status(
    client,
    candidate: dict,
    *,
    observed_at: datetime | None = None,
) -> dict | None:
    data = candidate.get("editalData") or {}
    site = _normalized_site(data.get("auctioneerSite", ""))
    hostname = (urlparse(site).hostname or "").lower()
    if not site or not (
        hostname == "kleiloes.com.br" or hostname.endswith(".kleiloes.com.br")
    ):
        return None
    query = _kleiloes_search_term(candidate.get("address", ""))
    if not query:
        return None

    search_url = f"{site}/busca?{urlencode({'busca': query})}"
    response = await client.get(search_url, timeout=20, allow_redirects=True)
    response.raise_for_status()
    links = list(dict.fromkeys(
        urljoin(site, html_lib.unescape(link))
        for link in _KLEILOES_LINK_RE.findall(response.text)
    ))
    for lot_url in links[:10]:
        lot_response = await client.get(lot_url, timeout=20, allow_redirects=True)
        lot_response.raise_for_status()
        parsed = parse_kleiloes_lot(
            lot_response.text,
            source_url=lot_url,
            expected_lot=str(data.get("lotNumber") or ""),
            expected_matricula=str(
                data.get("matricula") or candidate.get("matricula") or ""
            ),
            observed_at=observed_at,
        )
        if parsed is not None:
            return parsed
    return None


async def fetch_official_auctioneer_bid_statuses(
    candidates: list[dict],
    *,
    observed_at: datetime | None = None,
) -> list[dict | None]:
    """Return aligned bid aggregates for supported official Caixa auctioneers."""
    if not candidates:
        return []
    results: list[dict | None] = []
    async with AsyncSession(impersonate="chrome", headers={"User-Agent": _UA}) as client:
        for candidate in candidates:
            try:
                results.append(await _fetch_kleiloes_bid_status(
                    client, candidate, observed_at=observed_at,
                ))
            except Exception as exc:  # best effort; keep the previous verified fact
                logger.debug(
                    "Official auctioneer bid status unavailable for Caixa property {}: {}",
                    candidate.get("sourceId"), exc,
                )
                results.append(None)
    return results
