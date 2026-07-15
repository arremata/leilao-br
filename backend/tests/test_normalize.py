import pytest

from ingestion.normalize import parse_brl_number, compute_discount


@pytest.mark.parametrize("text,expected", [
    ("150.000,00", 150000.00),
    ("68.816,17", 68816.17),
    ("90000", 90000.0),
    ("1.200.000,50", 1200000.50),
    ("R$ 250.000,00", 250000.00),
    ("", 0.0),
    ("n/a", 0.0),
])
def test_parse_brl_number(text, expected):
    assert parse_brl_number(text) == pytest.approx(expected)


def test_compute_discount_normal():
    assert compute_discount(150000.0, 250000.0) == pytest.approx(40.0)


def test_compute_discount_zero_appraisal_returns_none():
    assert compute_discount(150000.0, 0.0) is None
    assert compute_discount(150000.0, None) is None


def test_compute_discount_negative_clamped_to_zero():
    # preco above avaliacao -> no discount, not a negative number
    assert compute_discount(300000.0, 250000.0) == 0.0


from ingestion.normalize import parse_description


def test_parse_description_apartment_with_area_and_beds():
    d = parse_description(
        "Apartamento, CENTRO, CURITIBA, com área privativa de 65,00 m2, 2 quartos."
    )
    assert d["property_type"] == "Apartamento"
    assert d["area_m2"] == pytest.approx(65.0)
    assert d["beds"] == 2


def test_parse_description_house_total_area():
    d = parse_description("Casa, JARDIM, LONDRINA, área total 120,00 m2, 3 quartos.")
    assert d["property_type"] == "Casa"
    assert d["area_m2"] == pytest.approx(120.0)
    assert d["beds"] == 3


def test_parse_description_terreno_no_beds():
    d = parse_description("Terreno, ZONA RURAL, área total 500,00 m2.")
    assert d["property_type"] == "Terreno"
    assert d["area_m2"] == pytest.approx(500.0)
    assert d["beds"] is None


def test_parse_description_empty():
    d = parse_description("")
    assert d == {"property_type": None, "area_m2": None, "beds": None}
