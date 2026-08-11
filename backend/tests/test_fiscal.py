from fiscal import get_itbi


def test_itbi_lookup_is_municipal_and_accent_insensitive():
    result = get_itbi("pr", "Curitiba")
    assert result["rate"] == 0.027
    assert "Prefeitura" in result["source"]


def test_unknown_city_has_no_invented_default_rate():
    assert get_itbi("PR", "Município sem tabela") is None
