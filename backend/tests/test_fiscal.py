from fiscal import REGISTRATION_RATES, get_itbi, get_registration_fee


def test_itbi_lookup_is_municipal_and_accent_insensitive():
    result = get_itbi("pr", "Curitiba")
    assert result["rate"] == 0.027
    assert "Prefeitura" in result["source"]


def test_unknown_city_has_no_invented_default_rate():
    assert get_itbi("PR", "Município sem tabela") is None


def test_registration_table_covers_every_brazilian_state():
    assert len(REGISTRATION_RATES) == 27
    assert get_registration_fee("PR")["rate"] == 0.008
    assert get_registration_fee("SP")["rate"] == 0.009
    assert get_registration_fee("AC")["rate"] == 0.0075


def test_registration_lookup_rejects_unknown_state():
    assert get_registration_fee("XX") is None
