from ingestion.adapters.base import RawListing, NormalizedProperty


def test_raw_listing_holds_source_and_dict():
    raw = RawListing(source="caixa", source_id="42", raw={"UF": "PR"})
    assert raw.source == "caixa"
    assert raw.source_id == "42"
    assert raw.raw["UF"] == "PR"


def test_normalized_property_defaults():
    n = NormalizedProperty(source="caixa", source_id="42", uf="PR", address="Rua A")
    assert n.preco == 0.0
    assert n.beds is None
    assert n.raw == {}
