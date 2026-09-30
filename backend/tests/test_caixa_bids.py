import asyncio
from datetime import datetime, timezone

from ingestion.adapters.caixa_bids import (
    caixa_online_bid_state,
    fetch_caixa_online_bid_status,
    parse_caixa_bid_table,
    parse_kleiloes_lot,
)


CAIXA_DETAIL_WITH_BIDS = """
  <span id="disputa">Imóvel em disputa</span>
  <a>Acompanhe aqui os lances registrados nessa disputa.</a>
"""

CAIXA_BID_TABLE = """
  <h6>Lances registrados nesta disputa:</h6>
  <table><tbody>
    <tr><td>1º</td><td>***</td><td align="right">R$234.000,00<br>29/09/2026</td></tr>
    <tr><td>2º</td><td>***</td><td align="right">R$231.000,00<br>29/09/2026</td></tr>
  </tbody></table>
"""


def test_caixa_online_state_distinguishes_dispute_and_open_proposal_surface():
    assert caixa_online_bid_state(CAIXA_DETAIL_WITH_BIDS) == "registered"
    assert caixa_online_bid_state("""
      <a>Regras da Venda Online</a><button>Fazer uma proposta</button>
    """) == "open"
    assert caixa_online_bid_state("<p>Leilão SFI</p>") is None


def test_caixa_bid_table_keeps_only_count_and_highest_amount():
    result = parse_caixa_bid_table(
        CAIXA_BID_TABLE,
        source_url="https://venda-imoveis.caixa.gov.br/detail",
        observed_at=datetime(2026, 9, 30, 3, tzinfo=timezone.utc),
    )

    assert result == {
        "status": "registered",
        "count": 2,
        "highestAmount": 234000.0,
        "sourceLabel": "Caixa",
        "sourceUrl": "https://venda-imoveis.caixa.gov.br/detail",
        "fetchedAt": "2026-09-30T03:00:00+00:00",
    }
    assert "***" not in str(result)


def test_caixa_bid_fetch_uses_the_public_property_endpoint():
    calls = []

    class Response:
        text = CAIXA_BID_TABLE

        def raise_for_status(self):
            return None

    class Client:
        async def post(self, url, **kwargs):
            calls.append((url, kwargs))
            return Response()

    result = asyncio.run(fetch_caixa_online_bid_status(
        Client(),
        "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=8787716885305",
        CAIXA_DETAIL_WITH_BIDS,
    ))

    assert result["highestAmount"] == 234000.0
    assert calls[0][0].endswith("/sistema/venda-online/carregaLances.asp")
    assert calls[0][1]["data"]["p_hdnImovel"] == "8787716885305"


def test_caixa_zero_requires_the_public_endpoint_to_confirm_no_data():
    detail_html = """
      <a>Regras da Venda Online</a><button>Fazer uma proposta</button>
    """
    calls = []

    class Response:
        text = "Não há dados."

        def raise_for_status(self):
            return None

    class Client:
        async def post(self, url, **kwargs):
            calls.append((url, kwargs))
            return Response()

    result = asyncio.run(fetch_caixa_online_bid_status(
        Client(),
        "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=1",
        detail_html,
    ))

    assert result["status"] == "none"
    assert result["count"] == 0
    assert len(calls) == 1


def test_caixa_open_surface_without_endpoint_evidence_stays_unknown():
    class Client:
        async def post(self, _url, **_kwargs):
            raise TimeoutError

    result = asyncio.run(fetch_caixa_online_bid_status(
        Client(),
        "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=1",
        '<a>Regras da Venda Online</a><button>Fazer uma proposta</button>',
    ))

    assert result is None


def test_kleiloes_lot_parses_zero_and_registered_bid_without_bidder_data():
    zero = parse_kleiloes_lot("""
      <span id="ctl00_ContentPlaceHolder1_NumeroLote">256</span>
      <p>Matrícula: 184967</p>
      <td class="text-right total-lances">0</td>
    """, source_url="https://www.kleiloes.com.br/lote/256",
        expected_lot="256", expected_matricula="184967")
    assert zero["status"] == "none"
    assert zero["count"] == 0
    assert "highestAmount" not in zero

    registered = parse_kleiloes_lot("""
      <span id="ctl00_ContentPlaceHolder1_NumeroLote">28</span>
      <p>Matrícula: 53471</p>
      <td class="lance-atual text-right">R$ 205.698,12</td>
      <td class="text-right total-lances">1</td>
      <td class="bidder">A PARTICIPANT NAME THAT MUST NOT LEAK</td>
    """, source_url="https://www.kleiloes.com.br/lote/28",
        expected_lot="28", expected_matricula="53471")
    assert registered["status"] == "registered"
    assert registered["count"] == 1
    assert registered["highestAmount"] == 205698.12
    assert "PARTICIPANT" not in str(registered)


def test_kleiloes_lot_rejects_a_search_result_for_another_property():
    assert parse_kleiloes_lot("""
      <span id="ctl00_ContentPlaceHolder1_NumeroLote">255</span>
      <p>Matrícula: 999</p>
      <td class="text-right total-lances">0</td>
    """, source_url="https://www.kleiloes.com.br/lote/255",
        expected_lot="256", expected_matricula="184967") is None
