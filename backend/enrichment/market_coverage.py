"""Canonical market-reference keys and fallback resolution.

All background and request paths use this module so a property cannot be
analyzable in one deployment and "missing" in another.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from statistics import median

from sqlalchemy import select

from db.models import MarketReferenceJob, RegionalMarketPrice
from graph.market import is_land_property_type


def normalize_text(value: str | None) -> str:
    ascii_value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    return " ".join(ascii_value.casefold().split())


def canonical_property_type(value: str | None) -> str:
    """Collapse ingestion spelling variants without mixing asset classes."""
    normalized = normalize_text(value)
    mappings = (
        (r"\b(apartamento|apto|flat|kitnet|studio)\b", "Apartamento"),
        (r"\b(casa|sobrado|residencia)\b", "Casa"),
        (r"\b(loja|sala|comercial|escritorio)\b", "Comercial"),
        (r"\b(galpao|industrial|armazem)\b", "Industrial"),
        (r"\b(rural|fazenda|sitio|chacara)\b", "Rural"),
        (r"\b(terreno|lote|gleba)\b", "Terreno"),
    )
    for pattern, canonical in mappings:
        if re.search(pattern, normalized):
            return canonical
    return (value or "").strip()


def is_eligible_market_property(prop) -> bool:
    return bool(
        prop.status == "active"
        and prop.uf and prop.city and prop.area_m2 and prop.area_m2 > 0
        and canonical_property_type(prop.property_type)
        and not is_land_property_type(prop.property_type)
    )


@dataclass(frozen=True)
class ResolvedMarketReference:
    price_per_m2: float
    scope: str
    reference_ids: tuple[int, ...]
    computed_at: object | None


def resolve_market_reference(session, prop) -> ResolvedMarketReference | None:
    """Resolve exact neighborhood first, then the city's type median."""
    canonical_type = canonical_property_type(prop.property_type)
    refs = session.execute(select(RegionalMarketPrice).where(
        RegionalMarketPrice.uf == (prop.uf or "").strip().upper(),
        RegionalMarketPrice.city == (prop.city or "").strip(),
        RegionalMarketPrice.property_type == canonical_type,
        RegionalMarketPrice.price_per_m2 > 0,
    )).scalars().all()
    wanted = normalize_text(prop.neighborhood)
    exact = next((ref for ref in refs if ref.neighborhood and normalize_text(ref.neighborhood) == wanted), None)
    if exact:
        return ResolvedMarketReference(
            exact.price_per_m2, "neighborhood", (exact.id,), exact.computed_at,
        )
    city_ref = next((ref for ref in refs if not normalize_text(ref.neighborhood)), None)
    if city_ref:
        return ResolvedMarketReference(
            city_ref.price_per_m2, "city", (city_ref.id,), city_ref.computed_at,
        )
    if refs:
        return ResolvedMarketReference(
            float(median(ref.price_per_m2 for ref in refs)), "city",
            tuple(ref.id for ref in refs),
            max(refs, key=lambda ref: str(ref.computed_at or "")).computed_at,
        )
    return None


def queue_city_reference(session, prop, priority: int = 0) -> MarketReferenceJob | None:
    """Idempotently prioritize a property's city/type baseline."""
    if not is_eligible_market_property(prop):
        return None
    key = {
        "uf": (prop.uf or "").strip().upper(), "city": (prop.city or "").strip(),
        "neighborhood": "", "property_type": canonical_property_type(prop.property_type),
    }
    job = session.execute(select(MarketReferenceJob).where(
        MarketReferenceJob.uf == key["uf"], MarketReferenceJob.city == key["city"],
        MarketReferenceJob.neighborhood == "",
        MarketReferenceJob.property_type == key["property_type"],
    )).scalar_one_or_none()
    if job is None:
        job = MarketReferenceJob(
            **key, representative_property_id=prop.id, status="pending", priority=priority,
        )
        session.add(job)
    else:
        job.representative_property_id = prop.id
        job.priority = min(job.priority, priority)
        if job.status == "successful":
            job.status = "pending"
            job.next_attempt_at = None
    return job
