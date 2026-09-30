"""Resolve the current event of a Caixa SFI auction from official round facts."""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

SAO_PAULO = ZoneInfo("America/Sao_Paulo")


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=SAO_PAULO) if value.tzinfo is None else value


def _deadline(value: datetime | str | None) -> datetime | None:
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if value is not None and not isinstance(value, datetime):
        return None
    return _aware(value)


def _positive(value: float | None) -> float | None:
    number = float(value or 0)
    return number if number > 0 else None


def resolve_current_auction(
    *,
    modalidade: str | None,
    minimum_price: float | None,
    first_at: datetime | None,
    second_at: datetime | None,
    first_price: float | None,
    second_price: float | None,
    online_end_at: datetime | str | None = None,
    now: datetime | None = None,
) -> tuple[int | None, float | None, datetime | None]:
    """Return ``(round, price, date)`` for the event the buyer can act on.

    Caixa's CSV minimum can lag behind the property page when the first SFI
    round closes. The round-specific detail fields therefore take precedence.
    Other modalities keep their single published minimum and date.
    """
    first = _aware(first_at)
    second = _aware(second_at)
    fallback_price = _positive(minimum_price)
    normalized_modality = (modalidade or "").casefold()
    reference = _aware(now) or datetime.now(timezone.utc)
    if "venda direta" in normalized_modality:
        official_deadline = _deadline(online_end_at)
        if (
            official_deadline is not None
            and official_deadline.astimezone(timezone.utc)
            > reference.astimezone(timezone.utc)
        ):
            return None, fallback_price, official_deadline
        return None, fallback_price, None
    if "sfi" not in normalized_modality:
        return None, fallback_price, first

    if first and first.astimezone(timezone.utc) >= reference.astimezone(timezone.utc):
        return 1, _positive(first_price) or fallback_price, first
    if second is not None:
        return 2, _positive(second_price) or fallback_price, second
    if first is not None:
        return 1, _positive(first_price) or fallback_price, first
    return None, fallback_price, None
