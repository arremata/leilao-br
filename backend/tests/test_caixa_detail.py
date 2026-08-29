import asyncio

import ingestion.adapters.caixa_detail as caixa_detail
from ingestion.adapters.caixa_detail import parse_detail_html

DETAIL_HTML = """
<html><body>
  <img src="/fotos/F8444401234567.jpg" alt="Foto do imóvel">
  <div id="dadosImovel">
    Apartamento com 2 quartos, sala, cozinha. Área privativa de 65,00 m2.
  </div>
  <span>Matrícula(s): <strong>91048</strong></span>
  <a href='#' onclick=javascript:ExibeDoc('/editais/EL00480226CPARE.PDF')>Edital</a>
  <a href='#' onclick=javascript:ExibeDoc('/editais/matricula/PR/8444415531323.pdf')>Matrícula</a>
</body></html>
"""


def test_parse_detail_html_extracts_photo_and_docs():
    data = parse_detail_html(
        DETAIL_HTML, base_url="https://venda-imoveis.caixa.gov.br"
    )
    assert data["photo_url"] == "https://venda-imoveis.caixa.gov.br/fotos/F8444401234567.jpg"
    assert "Apartamento com 2 quartos" in data["full_description"]
    assert data["matricula"] == "91048"
    assert data["edital_url"] == (
        "https://venda-imoveis.caixa.gov.br/editais/EL00480226CPARE.PDF"
    )
    assert data["matricula_url"] == (
        "https://venda-imoveis.caixa.gov.br/editais/matricula/PR/8444415531323.pdf"
    )
    assert len(data["document_urls"]) == 2


def test_parse_detail_html_empty_is_safe():
    data = parse_detail_html("", base_url="https://x")
    assert data["photo_url"] is None
    assert data["document_urls"] == []
    assert data["matricula"] is None
    assert data["edital_url"] is None
    assert data["matricula_url"] is None
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


def test_parse_detail_html_extracts_licitacao_aberta_date():
    data = parse_detail_html(
        "<span>Data da Licitação Aberta - 05/08/2026 - 10h00</span>",
        base_url="https://x",
    )

    assert data["first_auction_at"].isoformat() == "2026-08-05T10:00:00-03:00"
    assert data["second_auction_at"] is None


def test_date_batch_retries_http_200_without_dates_in_fresh_session(monkeypatch):
    sessions_created = 0

    class Response:
        status_code = 200

        def __init__(self, text):
            self.text = text

        def raise_for_status(self):
            return None

    class Session:
        def __init__(self, **kwargs):
            nonlocal sessions_created
            sessions_created += 1
            self.number = sessions_created

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, **kwargs):
            if self.number == 1:
                return Response("<html>temporary bot-manager page</html>")
            return Response("<span>Data do 1º Leilão - 24/08/2026 - 10h00</span>")

    async def no_sleep(_seconds):
        return None

    monkeypatch.setattr(caixa_detail, "AsyncSession", Session)
    monkeypatch.setattr(caixa_detail.asyncio, "sleep", no_sleep)

    results = asyncio.run(caixa_detail.fetch_auction_dates_batch(
        ["https://x/detail"], retries=0, request_interval=0, recovery_rounds=1,
    ))

    assert sessions_created == 2
    assert results[0]["first_auction_at"].isoformat() == "2026-08-24T10:00:00-03:00"


def test_detail_batch_accepts_document_only_caixa_page(monkeypatch):
    class Response:
        status_code = 200
        text = """
            <span>Matrícula(s): <strong>7159</strong></span>
            <a href='#' onclick=javascript:ExibeDoc('/editais/matricula/PR/0000000007159.pdf')>
                Baixar matrícula
            </a>
        """

        def raise_for_status(self):
            return None

    class Session:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, **kwargs):
            return Response()

    monkeypatch.setattr(caixa_detail, "AsyncSession", Session)

    results = asyncio.run(caixa_detail.fetch_auction_dates_batch(
        ["https://x/detail"], retries=0, request_interval=0, recovery_rounds=0,
    ))

    assert results[0]["first_auction_at"] is None
    assert results[0]["matricula"] == "7159"
    assert results[0]["matricula_url"].endswith("0000000007159.pdf")
