from fiscal import DEFAULT_ITBI_RATE, REGISTRATION_RATES, get_itbi, get_registration_fee


def test_itbi_lookup_is_municipal_and_accent_insensitive():
    result = get_itbi("pr", "Curitiba")
    assert result["rate"] == 0.027
    assert "Prefeitura" in result["source"]
    assert result["estimated"] is False


def test_city_without_reviewed_reference_gets_explicit_planning_estimate():
    result = get_itbi("PR", "Irati")

    assert result["rate"] == DEFAULT_ITBI_RATE
    assert result["estimated"] is True
    assert "confirme" in result["source"].casefold()


def test_itbi_estimate_covers_cities_in_any_brazilian_state():
    assert get_itbi("SP", "São Paulo")["rate"] == DEFAULT_ITBI_RATE
    assert get_itbi("AM", "Manaus")["estimated"] is True


def test_itbi_lookup_requires_a_brazilian_uf_and_city():
    assert get_itbi("XX", "Cidade") is None
    assert get_itbi("PR", "") is None


def test_registration_table_covers_every_brazilian_state():
    assert len(REGISTRATION_RATES) == 27
    assert get_registration_fee("PR")["rate"] == 0.008
    assert get_registration_fee("SP")["rate"] == 0.009
    assert get_registration_fee("AC")["rate"] == 0.0075


def test_registration_lookup_rejects_unknown_state():
    assert get_registration_fee("XX") is None
