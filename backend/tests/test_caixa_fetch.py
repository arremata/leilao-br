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


import pytest
from ingestion.adapters.caixa_csv import looks_like_captcha, CaixaFetchError

# Shape of the Radware Bot Manager response served to automated clients.
CAPTCHA_HTML = (
    b"<head>\n  <title>Radware Bot Manager CAPTCHA</title>"
    b'<script type="text/javascript">window.SSJSInternal = 48397;</script></head>'
)


def test_looks_like_captcha_detects_radware_page():
    assert looks_like_captcha(CAPTCHA_HTML) is True


def test_looks_like_captcha_false_for_valid_csv():
    assert looks_like_captcha(SAMPLE.encode("latin-1")) is False


def test_fetch_raw_raises_on_captcha_response():
    adapter = CaixaCsvAdapter(uf="PR", csv_bytes=CAPTCHA_HTML)
    with pytest.raises(CaixaFetchError):
        adapter.fetch_raw()


def test_fetch_raw_raises_on_empty_response():
    adapter = CaixaCsvAdapter(uf="PR", csv_bytes=b"")
    with pytest.raises(CaixaFetchError):
        adapter.fetch_raw()
