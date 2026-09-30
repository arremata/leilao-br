from datetime import datetime
from zoneinfo import ZoneInfo

from auction_round import resolve_current_auction


def test_sfi_second_round_replaces_stale_csv_minimum_after_first_round_closes():
    tz = ZoneInfo("America/Sao_Paulo")

    round_number, price, event_at = resolve_current_auction(
        modalidade="Leilão SFI",
        minimum_price=344_000,
        first_at=datetime(2026, 9, 28, 10, 0, tzinfo=tz),
        second_at=datetime(2026, 10, 2, 10, 0, tzinfo=tz),
        first_price=344_000,
        second_price=230_100.35,
        now=datetime(2026, 9, 29, 12, 0, tzinfo=tz),
    )

    assert round_number == 2
    assert price == 230_100.35
    assert event_at == datetime(2026, 10, 2, 10, 0, tzinfo=tz)


def test_non_sfi_sale_keeps_its_single_minimum_and_date():
    tz = ZoneInfo("America/Sao_Paulo")
    first_at = datetime(2026, 10, 5, 10, 0, tzinfo=tz)

    round_number, price, event_at = resolve_current_auction(
        modalidade="Licitação Aberta",
        minimum_price=406_733.59,
        first_at=first_at,
        second_at=None,
        first_price=None,
        second_price=None,
    )

    assert round_number is None
    assert price == 406_733.59
    assert event_at == first_at
