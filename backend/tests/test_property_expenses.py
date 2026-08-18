from types import SimpleNamespace

from enrichment.property_expenses import estimate_property_expenses


def _reference():
    return SimpleNamespace(
        uf="PR", city="Curitiba", annual_iptu_rate=0.006,
        condo_per_m2_monthly=7.5, reference_year=2026,
        source="Municipal rule and listing median",
    )


def test_estimates_iptu_from_appraisal_and_condo_from_apartment_area():
    prop = SimpleNamespace(
        avaliacao=300_000, preco=150_000, area_m2=60,
        property_type="Apartamento", descricao_raw="",
    )
    result = estimate_property_expenses(prop, _reference())
    assert result["annualIptu"] == 1_800
    assert result["monthlyIptu"] == 150
    assert result["monthlyCondo"] == 450


def test_ordinary_house_has_no_condo_estimate():
    prop = SimpleNamespace(
        avaliacao=200_000, preco=100_000, area_m2=90,
        property_type="Casa", descricao_raw="Casa desocupada",
    )
    assert estimate_property_expenses(prop, _reference())["monthlyCondo"] == 0


def test_house_explicitly_in_condominium_gets_estimate():
    prop = SimpleNamespace(
        avaliacao=None, preco=100_000, area_m2=80,
        property_type="Casa", descricao_raw="Imóvel em condomínio fechado",
    )
    result = estimate_property_expenses(prop, _reference())
    assert result["annualIptu"] == 600
    assert result["monthlyCondo"] == 600
