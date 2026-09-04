"""Deterministic confidence rule for comparable-based market estimates."""

from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations
from math import asin, cos, radians, sin, sqrt
from statistics import median
from typing import Literal
import re
import unicodedata


MAX_COMPARABLES = 5
MAX_RADIUS_KM = 2.0


@dataclass(frozen=True)
class MarketConfidence:
    score: float
    level: Literal["low", "medium", "high"]
    quantity_score: float
    subject_similarity_score: float
    group_consistency_score: float


def _value(item, name: str, default=None):
    if isinstance(item, dict):
        return item.get(name, default)
    return getattr(item, name, default)


def canonical_property_type(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    normalized = " ".join(normalized.casefold().split())
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


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return the great-circle distance between two WGS84 points."""
    earth_radius_km = 6371.0088
    lat1_rad, lat2_rad = radians(lat1), radians(lat2)
    delta_lat = radians(lat2 - lat1)
    delta_lng = radians(lng2 - lng1)
    value = (
        sin(delta_lat / 2) ** 2
        + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lng / 2) ** 2
    )
    return earth_radius_km * 2 * asin(sqrt(value))


def comparable_distance_km(subject, comparable) -> float | None:
    subject_lat = _value(subject, "lat")
    subject_lng = _value(subject, "lng")
    comparable_lat = _value(comparable, "lat")
    comparable_lng = _value(comparable, "lng")
    if None not in (subject_lat, subject_lng, comparable_lat, comparable_lng):
        return haversine_km(
            float(subject_lat), float(subject_lng),
            float(comparable_lat), float(comparable_lng),
        )
    distance = _value(comparable, "distance_km")
    return float(distance) if distance is not None else None


def _relative_difference(left: float, right: float) -> float | None:
    left, right = float(left or 0), float(right or 0)
    if left <= 0 or right <= 0:
        return None
    return abs(left - right) / left


def _pair_relative_difference(left: float, right: float) -> float | None:
    left, right = float(left or 0), float(right or 0)
    midpoint = (left + right) / 2
    return abs(left - right) / midpoint if left > 0 and right > 0 else None


def _similarity_band(difference: float | None) -> float:
    if difference is None:
        return 0.0
    if difference <= 0.10:
        return 1.0
    if difference <= 0.20:
        return 0.75
    if difference <= 0.35:
        return 0.50
    return 0.0


def _price_similarity_band(difference: float | None) -> float:
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


def _subject_proximity(distance: float | None) -> float:
    if distance is None or distance > MAX_RADIUS_KM:
        return 0.0
    return 1.0 if distance <= 1.0 else 0.75


def _pair_proximity(left, right) -> float:
    values = (
        _value(left, "lat"), _value(left, "lng"),
        _value(right, "lat"), _value(right, "lng"),
    )
    if any(value is None for value in values):
        return 0.0
    distance = haversine_km(*(float(value) for value in values))
    if distance <= 1.0:
        return 1.0
    if distance <= 2.0:
        return 0.75
    if distance <= 4.0:
        return 0.50
    return 0.0


def _group_consistency(comparables: list) -> float:
    count = len(comparables)
    if count < 2:
        return 0.0

    pair_scores = []
    for left, right in combinations(comparables, 2):
        price_difference = _pair_relative_difference(
            _value(left, "price_per_m2"), _value(right, "price_per_m2"),
        )
        area_difference = _pair_relative_difference(
            _value(left, "area_m2"), _value(right, "area_m2"),
        )
        pair_scores.append(
            0.50 * _price_similarity_band(price_difference)
            + 0.25 * _similarity_band(area_difference)
            + 0.15 * _bed_similarity(_value(left, "beds"), _value(right, "beds"))
            + 0.10 * _pair_proximity(left, right)
        )

    average_similarity = sum(pair_scores) / len(pair_scores)
    coverage = (count - 1) / (MAX_COMPARABLES - 1)
    return 20.0 * coverage * average_similarity


def _has_complete_high_confidence_data(subject, comparables: list) -> bool:
    if any(_value(subject, field) in (None, "") for field in (
        "property_type", "area_m2", "beds", "lat", "lng",
    )):
        return False
    subject_type = canonical_property_type(_value(subject, "property_type"))
    return all(
        all(_value(item, field) not in (None, "") for field in (
            "property_type", "area_m2", "beds", "price_per_m2", "lat", "lng",
        ))
        and canonical_property_type(_value(item, "property_type")) == subject_type
        for item in comparables
    )


def _is_scoreable(subject, comparable) -> bool:
    if any(_value(subject, field) in (None, "") for field in (
        "property_type", "area_m2", "beds", "lat", "lng",
    )):
        return False
    if any(_value(comparable, field) in (None, "") for field in (
        "property_type", "area_m2", "beds", "price_per_m2", "lat", "lng",
    )):
        return False
    if canonical_property_type(_value(subject, "property_type")) != canonical_property_type(
        _value(comparable, "property_type")
    ):
        return False
    distance = comparable_distance_km(subject, comparable)
    return distance is not None and distance <= MAX_RADIUS_KM


def calculate_market_confidence(subject, comparables: list) -> MarketConfidence:
    """Apply the 50/30/20 business rule to at most five comparables.

    The numeric result remains internal. Public consumers receive only the
    low/medium/high level derived from it.
    """
    selected = [
        item for item in comparables if _is_scoreable(subject, item)
    ][:MAX_COMPARABLES]
    count = len(selected)
    quantity_score = count * 10.0
    price_values = [
        float(_value(item, "price_per_m2") or 0)
        for item in selected if float(_value(item, "price_per_m2") or 0) > 0
    ]
    group_price_median = float(median(price_values)) if price_values else 0.0

    subject_similarity_score = 0.0
    for item in selected:
        distance = comparable_distance_km(subject, item)
        area_difference = _relative_difference(
            _value(subject, "area_m2"), _value(item, "area_m2"),
        )
        price_difference = _relative_difference(
            group_price_median, _value(item, "price_per_m2"),
        )
        # Each comparable is worth at most six points: 35% location,
        # 40% area, 15% bedrooms and 10% price/m².
        subject_similarity_score += (
            2.10 * _subject_proximity(distance)
            + 2.40 * _similarity_band(area_difference)
            + 0.90 * _bed_similarity(_value(subject, "beds"), _value(item, "beds"))
            + 0.60 * _price_similarity_band(price_difference)
        )

    group_consistency_score = _group_consistency(selected)
    raw_score = quantity_score + subject_similarity_score + group_consistency_score
    qualifies_as_high = (
        count >= 4
        and subject_similarity_score >= 21.0
        and group_consistency_score >= 12.0
        and _has_complete_high_confidence_data(subject, selected)
    )
    score = min(raw_score, 100.0)
    if score <= 30:
        level: Literal["low", "medium", "high"] = "low"
    elif score <= 70 or not qualifies_as_high:
        level = "medium"
        score = min(score, 70.0)
    else:
        level = "high"

    return MarketConfidence(
        score=round(score, 2),
        level=level,
        quantity_score=round(quantity_score, 2),
        subject_similarity_score=round(subject_similarity_score, 2),
        group_consistency_score=round(group_consistency_score, 2),
    )
