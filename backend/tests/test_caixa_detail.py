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
    assert data["first_auction_at"] is None
    assert data["second_auction_at"] is None


def test_parse_detail_html_extracts_both_caixa_auction_dates():
    html = """
    <div class="related-box">
      <p>Valor de avaliação: R$ 140.000,00<br>
      Valor mínimo de venda 1º Leilão: R$ 140.000,00<br>
      Valor mínimo de venda 2º Leilão: R$ 94.464,41</p>
      <span>Data do 1º Leilão - 04/08/2026 - 10h00</span><br>
      <span>Data do 2º Leilão - 10/08/2026 - 10h00</span>
    </div>
    """
    data = parse_detail_html(
        html, base_url="https://venda-imoveis.caixa.gov.br"
    )

    assert data["first_auction_at"].isoformat() == "2026-08-04T10:00:00-03:00"
    assert data["second_auction_at"].isoformat() == "2026-08-10T10:00:00-03:00"
    assert data["first_auction_price"] == 140000.0
    assert data["second_auction_price"] == 94464.41


def test_parse_detail_html_accepts_missing_second_date_and_time():
    data = parse_detail_html(
        "<span>Data do 1o Leilao: 04/08/2026</span>", base_url="https://x"
    )

    assert data["first_auction_at"].isoformat() == "2026-08-04T00:00:00-03:00"
    assert data["second_auction_at"] is None
