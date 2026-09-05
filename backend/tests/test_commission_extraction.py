from types import SimpleNamespace

from enrichment.run import metadata_from_property


def test_description_commission_is_not_used_without_structured_edital_data():
    prop = SimpleNamespace(
        uf="PR", city="Curitiba", descricao_raw="Comissão do leiloeiro de 8%",
        address="", property_type="Apartamento", area_m2=50, preco=100_000,
        avaliacao=150_000, modalidade="Leilão SFI", neighborhood="Centro",
        matricula="", beds=2, photo_url=None,
    )

    assert metadata_from_property(prop).commission_rate is None


def test_metadata_uses_only_structured_edital_commission():
    prop = SimpleNamespace(
        uf="PR", city="Curitiba",
        descricao_raw="Comissão estimada de 8% na descrição",
        edital_data={"commissionRate": 0.05},
        address="", property_type="Apartamento", area_m2=50, preco=100_000,
        avaliacao=150_000, modalidade="Leilão SFI", neighborhood="Centro",
        matricula="", beds=2, photo_url=None,
    )

    assert metadata_from_property(prop).commission_rate == 0.05
