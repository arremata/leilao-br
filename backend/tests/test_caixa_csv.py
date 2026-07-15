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


from ingestion.adapters.caixa_csv import CaixaCsvAdapter


def _raw_row():
    return RawListing(
        source="caixa",
        source_id="8444401234567",
        raw={
            "source_id": "8444401234567",
            "uf": "PR",
            "city": "CURITIBA",
            "neighborhood": "CENTRO",
            "address": "RUA XV DE NOVEMBRO, N. 100, APT 302",
            "preco": "150.000,00",
            "avaliacao": "250.000,00",
            "desconto_csv": "40,00000",
            "descricao": "Apartamento, CENTRO, CURITIBA, com área privativa de 65,00 m2, 2 quartos.",
            "modalidade": "Venda Online",
            "detail_url": "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=8444401234567",
        },
    )


def test_normalize_maps_caixa_row_to_canonical():
    adapter = CaixaCsvAdapter(uf="PR")
    n = adapter.normalize(_raw_row())
    assert n.source == "caixa"
    assert n.source_id == "8444401234567"
    assert n.uf == "PR"
    assert n.city == "CURITIBA"
    assert n.neighborhood == "CENTRO"
    assert n.preco == 150000.0
    assert n.avaliacao == 250000.0
    assert n.desconto_oficial == 40.0
    assert n.property_type == "Apartamento"
    assert n.area_m2 == 65.0
    assert n.beds == 2
    assert n.modalidade == "Venda Direta Online"
    assert "detalhe-imovel.asp" in n.detail_url
    assert n.address.startswith("RUA XV")

from ingestion.adapters.caixa_csv import parse_caixa_csv

SAMPLE_CSV_TEXT = (
    "Lista de Imóveis Caixa\n"
    "\n"
    "N° do imóvel;UF;Cidade;Bairro;Endereço;Preço;Valor de avaliação;Desconto;"
    "Descrição;Modalidade de venda;Link de acesso\n"
    "8444401234567;PR;CURITIBA;CENTRO;RUA XV DE NOVEMBRO, N. 100, APT 302;"
    "150.000,00;250.000,00;40,00000;"
    "Apartamento, CENTRO, CURITIBA, com área privativa de 65,00 m2, 2 quartos.;"
    "Venda Online;"
    "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=8444401234567\n"
    "8444407654321;PR;LONDRINA;JARDIM;RUA A, N. 50;90.000,00;90.000,00;0,00000;"
    "Casa, JARDIM, LONDRINA, área total 120,00 m2, 3 quartos.;"
    "Leilão SFI - Edital Único;"
    "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=8444407654321\n"
)


def test_parse_caixa_csv_extracts_rows_with_latin1_bytes():
    raw_bytes = SAMPLE_CSV_TEXT.encode("latin-1")
    rows = parse_caixa_csv(raw_bytes)
    assert len(rows) == 2
    first = rows[0]
    assert first.source == "caixa"
    assert first.source_id == "8444401234567"
    assert first.raw["city"] == "CURITIBA"
    assert first.raw["preco"] == "150.000,00"
    assert first.raw["modalidade"] == "Venda Online"


def test_parse_caixa_csv_skips_preamble_and_blank_rows():
    raw_bytes = (SAMPLE_CSV_TEXT + "\n\n").encode("latin-1")
    rows = parse_caixa_csv(raw_bytes)
    assert all(r.source_id for r in rows)
    assert len(rows) == 2
