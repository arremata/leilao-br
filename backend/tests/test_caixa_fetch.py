from ingestion.adapters.caixa_csv import CaixaCsvAdapter

SAMPLE = (
    "N° do imóvel;UF;Cidade;Bairro;Endereço;Preço;Valor de avaliação;Desconto;"
    "Descrição;Modalidade de venda;Link de acesso\n"
    "111;PR;CURITIBA;CENTRO;RUA A, 1;10.000,00;20.000,00;50,0;"
    "Casa, CENTRO, área total 50,00 m2, 1 quarto.;Venda Online;http://x\n"
)


def test_fetch_raw_uses_injected_bytes_without_playwright():
    adapter = CaixaCsvAdapter(uf="PR", csv_bytes=SAMPLE.encode("latin-1"))
    rows = adapter.fetch_raw()
    assert len(rows) == 1
    assert rows[0].source_id == "111"


def test_csv_url_for_uf():
    adapter = CaixaCsvAdapter(uf="pr")
    assert adapter.csv_url() == (
        "https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_PR.csv"
    )
