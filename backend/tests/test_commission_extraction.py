from types import SimpleNamespace

from enrichment.run import extract_commission_rate, metadata_from_property


def test_commission_is_extracted_after_keyword():
    assert extract_commission_rate("Comissão do leiloeiro: 5% sobre o lance") == 0.05


def test_commission_is_extracted_before_keyword():
    assert extract_commission_rate("Será pago 6,5% a título de comissão do leiloeiro.") == 0.065


def test_missing_commission_remains_unknown_in_metadata():
    prop = SimpleNamespace(
        uf="PR", city="Curitiba", descricao_raw="Sem informação de comissão",
        address="", property_type="Apartamento", area_m2=50, preco=100_000,
        avaliacao=150_000, modalidade="Leilão SFI", neighborhood="Centro",
        matricula="", beds=2, photo_url=None,
    )

    assert metadata_from_property(prop).commission_rate is None
