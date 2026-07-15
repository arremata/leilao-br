from ingestion.adapters.caixa_detail import parse_detail_html

DETAIL_HTML = """
<html><body>
  <img src="/fotos/F8444401234567.jpg" alt="Foto do imóvel">
  <div id="dadosImovel">
    Apartamento com 2 quartos, sala, cozinha. Área privativa de 65,00 m2.
  </div>
  <a href="/editais/edital_123.pdf">Edital</a>
  <a href="/editais/matricula_123.pdf">Matrícula</a>
</body></html>
"""


def test_parse_detail_html_extracts_photo_and_docs():
    data = parse_detail_html(
        DETAIL_HTML, base_url="https://venda-imoveis.caixa.gov.br"
    )
    assert data["photo_url"] == "https://venda-imoveis.caixa.gov.br/fotos/F8444401234567.jpg"
    assert "Apartamento com 2 quartos" in data["full_description"]
    assert any("edital_123.pdf" in u for u in data["document_urls"])
    assert any("matricula_123.pdf" in u for u in data["document_urls"])


def test_parse_detail_html_empty_is_safe():
    data = parse_detail_html("", base_url="https://x")
    assert data["photo_url"] is None
    assert data["document_urls"] == []
    assert data["full_description"] == ""
