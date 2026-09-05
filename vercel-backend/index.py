"""Lightweight Vercel API for the Arremate demo frontend.

The full AI pipeline depends on Playwright, OCR, PDF parsing, and LLM tooling,
which exceeds Vercel's Python function bundle limits. This service keeps the
public demo API online while the heavy analyzer remains a separate worker/API.
"""

from __future__ import annotations

import json
import os
import re
import unicodedata
from datetime import datetime, timezone
from itertools import combinations
from math import asin, cos, radians, sin, sqrt
from statistics import median
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool

PIPELINE_VERSION = "v13-area-similarity"

_REGISTRATION_RATES = {
    "PR": 0.008, "SP": 0.009, "RJ": 0.0085, "MG": 0.0075,
    "RS": 0.007, "SC": 0.007, "DF": 0.008, "BA": 0.008,
    "GO": 0.0075,
}
_DEFAULT_REGISTRATION_RATE = 0.0075
_BRAZILIAN_UFS = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT",
    "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO",
    "RR", "SC", "SP", "SE", "TO",
}

SAO_PAULO = ZoneInfo("America/Sao_Paulo")
_engine = None

app = FastAPI(title="Arremate Demo API")


class ApiPrefixMiddleware:
    """Accept the public `/api` prefix used by the Vercel service router."""

    def __init__(self, application):
        self.application = application

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "")
        if scope.get("type") == "http" and (path == "/api" or path.startswith("/api/")):
            stripped_path = path[4:] or "/"
            scope = {**scope, "path": stripped_path, "raw_path": stripped_path.encode()}
        await self.application(scope, receive, send)


app.add_middleware(ApiPrefixMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    url: str | None = None
    pdf_texts: str | None = None


def _is_preview() -> bool:
    return os.environ.get("VERCEL_ENV", "").casefold() == "preview"


def _preview_allows_writes() -> bool:
    """Require an explicit project setting before previews write production."""
    return os.environ.get("ARREMATE_PREVIEW_ALLOW_WRITES", "").casefold() in {
        "1", "true", "yes",
    }


def _should_persist_changes() -> bool:
    return not _is_preview() or _preview_allows_writes()


def _database_url() -> str | None:
    """Allow Vercel to scope a separate connection string to previews."""
    if _is_preview():
        database_url = os.environ.get("PREVIEW_DATABASE_URL") or os.environ.get("DATABASE_URL")
    else:
        database_url = os.environ.get("DATABASE_URL")
    if database_url and database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    if database_url and database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg://", 1)
    return database_url


def _execute_persistent_write(connection, statement: str, params: dict) -> bool:
    """Execute a write only when the current deployment explicitly permits it."""
    if not _should_persist_changes():
        return False
    connection.execute(text(statement), params)
    return True


def _is_land_property_type(property_type: str | None) -> bool:
    normalized = unicodedata.normalize("NFKD", property_type or "").encode("ascii", "ignore").decode()
    return bool(re.search(r"\b(terreno|lote|gleba)\b", normalized.lower()))


def _normalize_text(value: str | None) -> str:
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    return " ".join(value.casefold().split())


def _registration_rate(uf: str | None) -> float | None:
    normalized_uf = (uf or "").upper().strip()
    if normalized_uf not in _BRAZILIAN_UFS:
        return None
    return _REGISTRATION_RATES.get(normalized_uf, _DEFAULT_REGISTRATION_RATE)


def _canonical_property_type(value: str | None) -> str:
    normalized = _normalize_text(value)
    for pattern, canonical in (
        (r"\b(apartamento|apto|flat|kitnet|studio)\b", "Apartamento"),
        (r"\b(casa|sobrado|residencia)\b", "Casa"),
        (r"\b(loja|sala|comercial|escritorio)\b", "Comercial"),
        (r"\b(galpao|industrial|armazem)\b", "Industrial"),
        (r"\b(rural|fazenda|sitio|chacara)\b", "Rural"),
        (r"\b(terreno|lote|gleba)\b", "Terreno"),
    ):
        if re.search(pattern, normalized):
            return canonical
    return (value or "").strip()


def _haversine_km(lat1, lng1, lat2, lng2) -> float:
    earth_radius_km = 6371.0088
    lat1_rad, lat2_rad = radians(float(lat1)), radians(float(lat2))
    delta_lat = radians(float(lat2) - float(lat1))
    delta_lng = radians(float(lng2) - float(lng1))
    value = (
        sin(delta_lat / 2) ** 2
        + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lng / 2) ** 2
    )
    return earth_radius_km * 2 * asin(sqrt(value))


def _relative_difference(left, right) -> float | None:
    left, right = float(left or 0), float(right or 0)
    return abs(left - right) / left if left > 0 and right > 0 else None


def _area_similarity(left, right) -> float:
    """Return a continuous, symmetric size similarity from zero to one."""
    left, right = float(left or 0), float(right or 0)
    if left <= 0 or right <= 0:
        return 0.0
    return min(left, right) / max(left, right)


def _pair_relative_difference(left, right) -> float | None:
    left, right = float(left or 0), float(right or 0)
    midpoint = (left + right) / 2
    return abs(left - right) / midpoint if left > 0 and right > 0 else None


def _price_similarity_band(difference) -> float:
    if difference is None:
        return 0.0
    if difference <= 0.10:
        return 1.0
    if difference <= 0.20:
        return 0.75
    if difference <= 0.30:
        return 0.50
    return 0.0


def _bed_similarity(left, right) -> float:
    if left is None or right is None:
        return 0.0
    difference = abs(int(left) - int(right))
    return 1.0 if difference == 0 else 0.5 if difference == 1 else 0.0


def _pair_proximity(left, right) -> float:
    coordinates = (left.get("lat"), left.get("lng"), right.get("lat"), right.get("lng"))
    if any(value is None for value in coordinates):
        return 0.0
    distance = _haversine_km(*coordinates)
    if distance <= 1:
        return 1.0
    if distance <= 2:
        return 0.75
    if distance <= 4:
        return 0.50
    return 0.0


def _prepare_market_comparables(property_row, comparable_rows) -> list[dict]:
    p = dict(property_row)
    area = float(p.get("area_m2") or 0)
    subject_type = _canonical_property_type(p.get("property_type"))
    has_subject_coordinates = p.get("lat") is not None and p.get("lng") is not None
    usable = []
    for row in comparable_rows:
        item = dict(row)
        item_area = float(item.get("area_m2") or 0)
        item_price = float(item.get("price") or 0)
        price_per_m2 = float(item.get("price_per_m2") or 0)
        if item_price <= 0 or item_area <= 0 or price_per_m2 <= 0:
            continue
        if area > 0 and not area * 0.65 <= item_area <= area * 1.35:
            continue
        if any(term in f'{item.get("address", "")} {item.get("url", "")}'.lower()
               for term in ("leilao", "leilão", "hasta")):
            continue
        item_type = _canonical_property_type(item.get("property_type"))
        if subject_type and item_type and subject_type != item_type:
            continue
        if has_subject_coordinates:
            if item.get("lat") is None or item.get("lng") is None:
                continue
            item["distance_km"] = _haversine_km(
                p["lat"], p["lng"], item["lat"], item["lng"],
            )
            if item["distance_km"] > 2:
                continue
        else:
            item["distance_km"] = None
        usable.append(item)

    if len(usable) >= 3:
        center = median(float(item["price_per_m2"]) for item in usable)
        usable = [
            item for item in usable
            if center * 0.5 <= float(item["price_per_m2"]) <= center * 2
        ]
    subject_beds = p.get("beds")
    usable.sort(key=lambda item: (
        not _canonical_property_type(item.get("property_type"))
        or _canonical_property_type(item.get("property_type")) != subject_type,
        item.get("distance_km") is None,
        item.get("distance_km") if item.get("distance_km") is not None else float("inf"),
        abs(float(item["area_m2"]) - area) / area if area > 0 else 1,
        abs(int(item["beds"]) - int(subject_beds))
        if item.get("beds") is not None and subject_beds is not None else 99,
        item.get("url") or "",
    ))
    return usable[:5]


def _market_confidence_level(property_row, comparables: list[dict]) -> str:
    p = dict(property_row)
    subject_has_coordinates = all(
        p.get(field) not in (None, "") for field in ("lat", "lng")
    )
    subject_type = _canonical_property_type(p.get("property_type"))
    comparables = [
        item for item in comparables
        if float(item.get("area_m2") or 0) > 0
        and float(item.get("price_per_m2") or 0) > 0
        and (
            not subject_type
            or not _canonical_property_type(item.get("property_type"))
            or _canonical_property_type(item.get("property_type")) == subject_type
        )
        and (
            not subject_has_coordinates
            or (item.get("distance_km") is not None and item["distance_km"] <= 2)
        )
    ][:5]
    count = len(comparables)
    prices = [float(item.get("price_per_m2") or 0) for item in comparables]
    price_median = float(median(prices)) if prices else 0.0
    subject_similarity = 0.0
    for item in comparables:
        distance = item.get("distance_km")
        proximity = 0.0 if distance is None or distance > 2 else 1.0 if distance <= 1 else 0.75
        subject_similarity += (
            2.10 * proximity
            + 2.40 * _area_similarity(p.get("area_m2"), item.get("area_m2"))
            + 0.90 * _bed_similarity(p.get("beds"), item.get("beds"))
            + 0.60 * _price_similarity_band(
                _relative_difference(price_median, item.get("price_per_m2")),
            )
        )

    group_score = 0.0
    if count >= 2:
        pairs = list(combinations(comparables, 2))
        average = sum(
            0.50 * _price_similarity_band(
                _pair_relative_difference(left.get("price_per_m2"), right.get("price_per_m2")),
            )
            + 0.25 * _area_similarity(left.get("area_m2"), right.get("area_m2"))
            + 0.15 * _bed_similarity(left.get("beds"), right.get("beds"))
            + 0.10 * _pair_proximity(left, right)
            for left, right in pairs
        ) / len(pairs)
        group_score = 20 * ((count - 1) / 4) * average

    quantity_score = count * 10.0
    raw_score = quantity_score + subject_similarity + group_score
    complete = bool(comparables) and all(p.get(field) not in (None, "") for field in (
        "property_type", "area_m2", "beds", "lat", "lng",
    )) and all(
        all(item.get(field) not in (None, "") for field in (
            "property_type", "area_m2", "beds", "price_per_m2", "lat", "lng",
        ))
        and _canonical_property_type(item.get("property_type"))
        == _canonical_property_type(p.get("property_type"))
        for item in comparables
    )
    qualifies_as_high = (
        count >= 4 and subject_similarity >= 21 and group_score >= 12 and complete
    )
    if raw_score <= 30:
        return "low"
    if raw_score <= 70 or not qualifies_as_high:
        return "medium"
    return "high"


def _safe_enrichment(enrichment: str | None, property_type: str | None) -> dict | None:
    result = json.loads(enrichment) if enrichment else None
    market_detail = result.get("marketDetail") if isinstance(result, dict) else None
    if isinstance(market_detail, dict):
        market_detail.pop("confidenceDebug", None)
    if result and _is_land_property_type(property_type):
        result.update(market=0.0, discount=0.0, roi=0.0, marketDetail=None)
    return result


def _refresh_confidence_level(
    result: dict | None, property_row, comparable_rows, *, force: bool = False,
) -> dict | None:
    """Refresh stale confidence levels without exposing internal score details."""
    market_detail = result.get("marketDetail") if isinstance(result, dict) else None
    if not isinstance(market_detail, dict):
        return result
    market_detail.pop("confidenceDebug", None)
    if market_detail.get("confidenceLevel") and not force:
        return result

    p = dict(property_row)
    subject_type = _canonical_property_type(p.get("property_type"))
    related = [
        dict(item) for item in comparable_rows
        if _canonical_property_type(item.get("reference_property_type")) == subject_type
    ]
    wanted_neighborhood = _normalize_text(p.get("neighborhood"))
    exact_ids = {
        item.get("reference_id") for item in related
        if wanted_neighborhood
        and _normalize_text(item.get("reference_neighborhood")) == wanted_neighborhood
    }
    city_ids = {
        item.get("reference_id") for item in related
        if not _normalize_text(item.get("reference_neighborhood"))
    }
    selected_ids = exact_ids or city_ids or {item.get("reference_id") for item in related}
    selected = [item for item in related if item.get("reference_id") in selected_ids]
    usable = _prepare_market_comparables(p, selected)
    market_detail["confidenceLevel"] = _market_confidence_level(p, usable)
    return result


def _build_persisted_enrichment(row, reference, comparable_rows, expense_reference=None) -> dict:
    """Build the public result without importing the worker/LLM package."""
    p = dict(row)
    area = float(p.get("area_m2") or 0)
    min_bid = float(p.get("preco") or 0)
    appraisal = float(p.get("avaliacao") or min_bid)
    is_land = _is_land_property_type(p.get("property_type"))
    usable = _prepare_market_comparables(p, comparable_rows)
    confidence_level = _market_confidence_level(p, usable)
    prices = [float(item["price_per_m2"]) for item in usable]
    price_per_m2 = 0 if is_land else float(median(prices) if prices else reference["price_per_m2"])
    market = round(price_per_m2 * area, 2)
    discount = round((market - min_bid) / market * 100, 2) if market > 0 else 0
    itbi_rate = {("PR", "CURITIBA"): 0.027, ("PR", "LONDRINA"): 0.02}.get(
        ((p.get("uf") or "").upper(), (p.get("city") or "").upper())
    )
    fee_rate = itbi_rate or 0
    normalized_modality = _normalize_text(p.get("modalidade"))
    is_direct_sale = "venda direta" in normalized_modality
    commission_exempt = is_direct_sale
    roi = round((market - min_bid * (1 + fee_rate)) / (min_bid * (1 + fee_rate)) * 100, 2) if min_bid else 0
    market_detail = None if is_land else {
        "indicators": ([{
            "lbl": f"Preço/m² · {'bairro' if reference.get('scope') == 'neighborhood' else 'cidade'}",
            "val": f"R$ {price_per_m2:,.0f}".replace(",", "."),
            "delta": "mediana das referências persistidas", "pos": True,
        }] if price_per_m2 else []),
        "comparables": [{
            "address": item["address"], "areaM2": item["area_m2"], "beds": item.get("beds"),
            "pricePerM2": item["price_per_m2"], "salePrice": item["price"],
            "source": item["source"], "url": item["url"],
        } for item in usable],
        "confidenceLevel": confidence_level,
    }
    costs = [{
        "id": "auction_bid",
        "label": "Preço de venda" if is_direct_sale else "Lance de arremate",
        "value": min_bid,
        "hint": (
            "Preço mínimo publicado pela Caixa para a venda direta."
            if is_direct_sale else "Valor declarado como mínimo no edital."
        ),
        "kind": "price",
    }]
    if itbi_rate is not None:
        costs.append({
            "id": "itbi",
            "label": f"ITBI · {p.get('city') or ''} ({itbi_rate * 100:g}%)",
            "value": round(min_bid * itbi_rate), "hint": "Alíquota municipal cadastrada.", "kind": "tax",
            "rate": itbi_rate,
        })
    edital_data = p.get("edital_data") if isinstance(p.get("edital_data"), dict) else {}
    official_commission_rate = edital_data.get("commissionRate")
    commission_rate = (
        float(official_commission_rate)
        if not commission_exempt
        and isinstance(official_commission_rate, (int, float))
        and 0 < float(official_commission_rate) <= 0.3
        else None
    )
    if commission_exempt:
        costs.append({
            "id": "auctioneer_commission",
            "label": "Comissão isenta", "value": 0,
            "hint": "Esta modalidade não prevê comissão de leiloeiro.",
            "kind": "fee", "rate": 0,
        })
    elif commission_rate is not None:
        costs.append({
            "id": "auctioneer_commission",
            "label": f"Comissão do leiloeiro · edital ({commission_rate * 100:g}%)",
            "value": round(min_bid * commission_rate),
            "hint": "Percentual extraído diretamente do edital oficial.",
            "kind": "fee", "rate": commission_rate,
        })
    else:
        costs.append({
            "id": "auctioneer_commission",
            "label": "Comissão do leiloeiro · não informada", "value": 0,
            "hint": "O percentual oficial não está disponível nos dados estruturados do edital; confirme antes de ofertar.",
            "kind": "fee",
        })
    registration_rate = _registration_rate(p.get("uf"))
    if registration_rate is not None:
        costs.append({
            "id": "property_registration",
            "label": f"Registro em cartório · {(p.get('uf') or '').upper()} ({registration_rate * 100:g}%)",
            "value": round(min_bid * registration_rate),
            "hint": (
                "Referência simplificada Arremate baseada nas tabelas estaduais de emolumentos "
                "reunidas pelo IRIB (2025). O valor final varia por faixa e pelos atos praticados; "
                "confirme com o cartório."
            ),
            "kind": "fee", "rate": registration_rate,
        })
    costs.extend([
        {
            "id": "occupant_removal", "label": "Desocupação do imóvel · estimativa", "value": 5000,
            "hint": "Reserva inicial para medidas de desocupação. Ajuste conforme a situação do imóvel e a orientação profissional.",
            "kind": "fee",
        },
        {"id": "renovation", "label": "Reforma estimada", "value": 0, "hint": "Calculada no simulador por área e faixa regional.", "kind": "reno"},
        {"id": "capital_gains", "label": "Imposto sobre ganho de capital", "value": 0, "hint": "Calculado conforme o cenário de venda.", "kind": "tax"},
    ])
    property_type = p.get("property_type") or ""
    neighborhood = p.get("neighborhood") or ""
    expense_reference = dict(expense_reference) if expense_reference else None
    annual_iptu = round(appraisal * float(expense_reference["annual_iptu_rate"]), 2) if expense_reference else None
    normalized_type = _normalize_text(property_type)
    in_condo = bool(re.search(r"\b(apartamento|apto|flat|kitnet|studio)\b", normalized_type)) or "condomin" in _normalize_text(p.get("descricao_raw"))
    monthly_condo = round(area * float(expense_reference["condo_per_m2_monthly"]), 2) if expense_reference and in_condo else None
    expense_estimate = ({
        "kind": "city_reference", "uf": expense_reference["uf"],
        "city": expense_reference["city"], "referenceYear": expense_reference["reference_year"],
        "annualIptuRate": expense_reference["annual_iptu_rate"],
        "condoPerM2Monthly": expense_reference["condo_per_m2_monthly"],
        "source": expense_reference["source"],
    } if expense_reference else None)
    return {
        "id": str(p["id"]), "photoLabel": f"{property_type.upper()} · {neighborhood.upper()} · {p.get('uf') or ''}",
        "title": f"{property_type} {area:.0f} m², {neighborhood}", "address": p.get("address") or "",
        "type": property_type, "neighborhood": neighborhood,
        "city": f"{p.get('city') or ''}, {p.get('uf') or ''}", "auctionType": "Extrajudicial",
        "praca": None, "modalidade": p.get("modalidade"), "auctioneer": "—", "court": "—",
        "discount": discount, "minBid": min_bid, "market": market, "roi": roi,
        "appraisal": appraisal,
        "auctionDiscount": round((appraisal - min_bid) / appraisal * 100, 2) if appraisal else 0,
        "area": area, "beds": p.get("beds"), "endsAt": "", "risk": {"j": "bad", "f": "good"},
        "viability": {"riskDimensions": [], "alerts": [], "description": "", "features": {}},
        "marketDetail": market_detail, "costs": costs, "edital": None,
        "auctionUrl": p.get("detail_url"), "photoUrl": p.get("photo_url"),
        "matricula": p.get("matricula"), "editalUrl": p.get("edital_url"),
        "matriculaUrl": p.get("matricula_url"),
        "editalData": p.get("edital_data"),
        "monthlyCondo": monthly_condo,
        "monthlyIptu": round(annual_iptu / 12, 2) if annual_iptu is not None else None,
        "annualIptu": annual_iptu, "expenseEstimate": expense_estimate,
    }


def _get_engine():
    """Return the cached Supabase engine without opening a connection eagerly."""
    global _engine
    if _engine is None:
        database_url = _database_url()
        if not database_url:
            raise HTTPException(status_code=503, detail="Catalog database is not configured")
        # Supabase supplies the pool; avoid retaining serverless client-side
        # connections between invocations.
        _engine = create_engine(database_url, poolclass=NullPool, pool_pre_ping=True)
    return _engine


def _iso(value) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        value = value.replace(tzinfo=SAO_PAULO)
    return value.isoformat()


def _catalog_card(row, *, include_edital_data: bool = False) -> dict:
    p = dict(row)
    auction_dates = [
        value for value in (p.get("first_auction_at"), p.get("second_auction_at"))
        if value is not None
    ]
    comparable_dates = [
        value.replace(tzinfo=SAO_PAULO) if value.tzinfo is None else value
        for value in auction_dates
    ]
    now = datetime.now(timezone.utc)
    next_auction = next(
        (value for value in comparable_dates if value.astimezone(timezone.utc) >= now),
        comparable_dates[-1] if comparable_dates else None,
    )
    modalidade = p.get("modalidade") or ""
    modalidade_normalized = modalidade.lower()
    auction_type = (
        "Extrajudicial"
        if any(term in modalidade_normalized for term in (
            "leilão sfi", "leilao sfi", "licitação aberta", "licitacao aberta", "venda direta",
        )) else None
    )
    praca = None
    if "sfi" in modalidade_normalized:
        first = p.get("first_auction_at")
        if first is not None and first.tzinfo is None:
            first = first.replace(tzinfo=SAO_PAULO)
        if first and first.astimezone(timezone.utc) >= now:
            praca = "1ª praça"
        elif p.get("second_auction_at") is not None:
            praca = "2ª praça"
        elif p.get("first_auction_at") is not None:
            praca = "1ª praça"
    property_type = p.get("property_type")
    if property_type:
        title = f"{property_type} {p.get('area_m2') or 0:.0f} m²"
        if p.get("neighborhood"):
            title += f", {p['neighborhood']}"
    else:
        title = p.get("address") or ""

    card = {
        "id": p["id"],
        "sourceId": p.get("source_id"),
        "source": p.get("source"),
        "uf": p.get("uf"),
        "city": p.get("city"),
        "neighborhood": p.get("neighborhood"),
        "address": p.get("address"),
        "title": title,
        "type": property_type,
        "area": p.get("area_m2"),
        "beds": p.get("beds"),
        "minBid": p.get("preco"),
        "appraisal": p.get("avaliacao"),
        "desconto": p.get("desconto_oficial"),
        "auctionDiscount": p.get("desconto_oficial"),
        "modalidade": p.get("modalidade"),
        "auctionType": auction_type,
        "praca": praca,
        "firstAuctionAt": _iso(p.get("first_auction_at")),
        "secondAuctionAt": _iso(p.get("second_auction_at")),
        "firstAuctionPrice": p.get("first_auction_price"),
        "secondAuctionPrice": p.get("second_auction_price"),
        "endsAt": _iso(next_auction),
        "lat": p.get("lat"),
        "lng": p.get("lng"),
        "photoUrl": p.get("photo_url"),
        "auctionUrl": p.get("detail_url"),
        "matricula": p.get("matricula"),
        "editalUrl": p.get("edital_url"),
        "matriculaUrl": p.get("matricula_url"),
        "status": p.get("status"),
        "canAnalyze": True,
    }
    if include_edital_data:
        card["editalData"] = p.get("edital_data")
    return card

_CATALOG_COLUMNS = """
    id, source_id, source, uf, city, neighborhood, address, property_type,
    area_m2, beds, preco, avaliacao, desconto_oficial, modalidade,
    first_auction_at, second_auction_at, first_auction_price,
    second_auction_price, lat, lng, photo_url, detail_url, status, descricao_raw,
    to_jsonb(properties)->>'matricula' AS matricula,
    to_jsonb(properties)->>'edital_url' AS edital_url,
    to_jsonb(properties)->>'matricula_url' AS matricula_url
"""

_CATALOG_DETAIL_COLUMNS = _CATALOG_COLUMNS + """,
    to_jsonb(properties)->'edital_data' AS edital_data
"""


@app.get("/properties")
def get_properties() -> list[dict]:
    """Compatibility alias backed by the production catalog."""
    return get_catalog()


@app.get("/catalog")
def get_catalog(uf: Optional[str] = None) -> list[dict]:
    query = f"SELECT {_CATALOG_COLUMNS} FROM properties WHERE status = 'active'"
    params = {}
    if uf:
        query += " AND uf = :uf"
        params["uf"] = uf.upper()
    query += " ORDER BY last_seen_at DESC, id DESC"
    try:
        with _get_engine().connect() as connection:
            rows = connection.execute(text(query), params).mappings().all()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Catalog database unavailable") from exc
    return [_catalog_card(row) for row in rows]


@app.get("/catalog/{property_id}")
def get_catalog_item(property_id: int) -> dict:
    query = f"SELECT {_CATALOG_DETAIL_COLUMNS} FROM properties WHERE id = :id"
    try:
        with _get_engine().connect() as connection:
            row = connection.execute(text(query), {"id": property_id}).mappings().one_or_none()
            if row is None:
                raise HTTPException(status_code=404, detail="Property not found")
            enrichment_row = connection.execute(
                text("SELECT result_json, pipeline_version FROM enrichments WHERE property_id = :id"),
                {"id": property_id},
            ).mappings().one_or_none()
            enrichment = enrichment_row["result_json"] if enrichment_row else None
            parsed_enrichment = _safe_enrichment(enrichment, row["property_type"])
            market_detail = (
                parsed_enrichment.get("marketDetail")
                if isinstance(parsed_enrichment, dict) else None
            )
            stale_confidence = bool(
                enrichment_row and enrichment_row["pipeline_version"] != PIPELINE_VERSION
            )
            if isinstance(market_detail, dict) and (
                stale_confidence or not market_detail.get("confidenceLevel")
            ):
                comparable_rows = connection.execute(text("""
                    SELECT c.address, c.price, c.area_m2, c.price_per_m2, c.source, c.url,
                           to_jsonb(c)->>'property_type' AS property_type,
                           NULLIF(to_jsonb(c)->>'beds', '')::INTEGER AS beds,
                           NULLIF(to_jsonb(c)->>'lat', '')::DOUBLE PRECISION AS lat,
                           NULLIF(to_jsonb(c)->>'lng', '')::DOUBLE PRECISION AS lng,
                           r.id AS reference_id,
                           r.neighborhood AS reference_neighborhood,
                           r.property_type AS reference_property_type
                    FROM regional_market_comparables c
                    JOIN regional_market_prices r ON r.id = c.reference_id
                    WHERE r.uf = :uf AND r.city = :city
                    ORDER BY c.price_per_m2
                """), {
                    "uf": row["uf"] or "", "city": row["city"] or "",
                }).mappings().all()
                parsed_enrichment = _refresh_confidence_level(
                    parsed_enrichment, row, comparable_rows, force=stale_confidence,
                )
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Catalog database unavailable") from exc

    card = _catalog_card(row, include_edital_data=True)
    card["enrichment"] = parsed_enrichment
    return card


@app.post("/catalog/{property_id}/analyze")
def analyze_catalog_item(property_id: int) -> dict:
    """Build an analysis and persist it only outside branch previews."""
    property_query = f"SELECT {_CATALOG_DETAIL_COLUMNS} FROM properties WHERE id = :id"
    reference_query = """
        SELECT id, neighborhood, property_type, price_per_m2
        FROM regional_market_prices
        WHERE uf = :uf AND city = :city
          AND price_per_m2 > 0
    """
    try:
        with _get_engine().begin() as connection:
            row = connection.execute(text(property_query), {"id": property_id}).mappings().one_or_none()
            if row is None:
                raise HTTPException(status_code=404, detail="Property not found")

            is_land = _is_land_property_type(row["property_type"])
            canonical_type = _canonical_property_type(row["property_type"])
            references = [item for item in connection.execute(text(reference_query), {
                "uf": row["uf"] or "", "city": row["city"] or "",
            }).mappings().all() if _canonical_property_type(item["property_type"]) == canonical_type]
            wanted_neighborhood = _normalize_text(row["neighborhood"])
            exact = next((item for item in references if
                _normalize_text(item["neighborhood"]) == wanted_neighborhood
                and bool(_normalize_text(item["neighborhood"]))
            ), None)
            if exact:
                reference = {**dict(exact), "scope": "neighborhood"}
            elif references:
                reference = {
                    "id": None, "scope": "city",
                    "price_per_m2": float(median(item["price_per_m2"] for item in references)),
                }
            else:
                reference = None
            if not is_land and reference is None:
                job_table_exists = connection.execute(
                    text("SELECT to_regclass('public.market_reference_jobs')")
                ).scalar_one_or_none()
                if job_table_exists:
                    _execute_persistent_write(connection, """
                        INSERT INTO market_reference_jobs
                            (uf, city, neighborhood, property_type, representative_property_id,
                             status, priority, attempt_count, last_error, updated_at)
                        VALUES (:uf, :city, '', :property_type, :property_id,
                                'pending', 0, 0, '', :updated_at)
                        ON CONFLICT (uf, city, neighborhood, property_type) DO UPDATE SET
                            representative_property_id = EXCLUDED.representative_property_id,
                            priority = LEAST(market_reference_jobs.priority, 0),
                            status = CASE WHEN market_reference_jobs.status = 'successful'
                                          THEN 'pending' ELSE market_reference_jobs.status END,
                            next_attempt_at = CASE WHEN market_reference_jobs.status = 'successful'
                                                   THEN NULL ELSE market_reference_jobs.next_attempt_at END,
                            updated_at = EXCLUDED.updated_at
                    """, {
                        "uf": row["uf"] or "", "city": row["city"] or "",
                        "property_type": canonical_type, "property_id": property_id,
                        "updated_at": datetime.now(timezone.utc),
                    })
                detail = (
                    "Referência de mercado ainda indisponível neste preview. "
                    "Nenhuma alteração foi salva."
                    if _is_preview() and not _preview_allows_writes()
                    else (
                        "Referência de mercado ainda indisponível. A coleta foi priorizada "
                        "e normalmente fica disponível em até 90 minutos."
                    )
                )
                return JSONResponse(
                    status_code=409,
                    content={"detail": detail},
                )

            comparables = []
            if reference is not None:
                if reference["scope"] == "neighborhood":
                    comparable_query = """
                        SELECT address, price, area_m2, price_per_m2, source, url,
                               to_jsonb(regional_market_comparables)->>'property_type' AS property_type,
                               NULLIF(to_jsonb(regional_market_comparables)->>'beds', '')::INTEGER AS beds,
                               NULLIF(to_jsonb(regional_market_comparables)->>'lat', '')::DOUBLE PRECISION AS lat,
                               NULLIF(to_jsonb(regional_market_comparables)->>'lng', '')::DOUBLE PRECISION AS lng
                        FROM regional_market_comparables
                        WHERE reference_id = :reference_id ORDER BY price_per_m2
                    """
                    comparable_params = {"reference_id": reference["id"]}
                else:
                    comparable_query = """
                        SELECT c.address, c.price, c.area_m2, c.price_per_m2, c.source, c.url,
                               to_jsonb(c)->>'property_type' AS property_type,
                               NULLIF(to_jsonb(c)->>'beds', '')::INTEGER AS beds,
                               NULLIF(to_jsonb(c)->>'lat', '')::DOUBLE PRECISION AS lat,
                               NULLIF(to_jsonb(c)->>'lng', '')::DOUBLE PRECISION AS lng
                        FROM regional_market_comparables c
                        JOIN regional_market_prices r ON r.id = c.reference_id
                        WHERE r.uf = :uf AND r.city = :city AND r.property_type = :property_type
                        ORDER BY c.price_per_m2
                    """
                    comparable_params = {
                        "uf": row["uf"] or "", "city": row["city"] or "",
                        "property_type": canonical_type,
                    }
                comparables = connection.execute(text(comparable_query), comparable_params).mappings().all()
            # Rollout-safe: Vercel can be deployed before the migration worker.
            # PostgreSQL's to_regclass avoids querying a table that does not yet exist.
            expense_table_exists = connection.execute(
                text("SELECT to_regclass('public.city_expense_references')")
            ).scalar_one_or_none()
            expense_reference = None
            if expense_table_exists:
                expense_reference = connection.execute(text("""
                    SELECT uf, city, annual_iptu_rate, condo_per_m2_monthly,
                           reference_year, source
                    FROM city_expense_references
                    WHERE uf = :uf AND UPPER(city) = UPPER(:city)
                    ORDER BY updated_at DESC
                    LIMIT 1
                """), {"uf": row["uf"] or "", "city": row["city"] or ""}).mappings().one_or_none()
            result_json = json.dumps(
                _build_persisted_enrichment(
                    row, reference or {"price_per_m2": 0}, comparables, expense_reference,
                ),
                ensure_ascii=False,
            )
            _execute_persistent_write(connection, """
                INSERT INTO enrichments (property_id, result_json, pipeline_version, computed_at)
                VALUES (:property_id, :result_json, :pipeline_version, :computed_at)
                ON CONFLICT (property_id) DO UPDATE SET
                    result_json = EXCLUDED.result_json,
                    pipeline_version = EXCLUDED.pipeline_version,
                    computed_at = EXCLUDED.computed_at
            """, {
                "property_id": property_id, "result_json": result_json,
                "pipeline_version": PIPELINE_VERSION, "computed_at": datetime.now(timezone.utc),
            })
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Catalog database unavailable") from exc

    return _safe_enrichment(result_json, row["property_type"])
