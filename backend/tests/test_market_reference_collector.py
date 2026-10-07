import asyncio

import pytest

from graph.state import PropertyMetadata
from tools.market_reference_collector import (
    MarketReferenceCollector,
    parse_chavesnamao_html,
    parse_imovelweb_html,
    parse_quintoandar_html,
)
from tools.property_scraper import ComparableSourceBlockedError


def _metadata():
    return PropertyMetadata(
        address="Rua das Flores, 123",
        property_type="Apartamento",
        area_m2=80,
        auction_price=300_000,
        city="São Paulo",
        neighborhood="Moema",
        state="SP",
    )


QUINTO_HTML = """
<html><body><a href="/imovel/123?search=x">
  <div class="abc-FindHouseCard-xyz" role="group"
       aria-label="Exclusivo. Moema, São Paulo, Rua das Flores. 80 m², 2 quartos, Apartamento">
    Apartamento 2 quartos 80 m² R$ 500.000
  </div>
</a></body></html>
"""

CHAVES_HTML = """
<html><body>
  <a href="/imovel/apartamento-80m2-123?tracking=x"
     title="Apartamento para Venda em São Paulo, Moema, 2 dormitórios">
    Apartamento 2 dormitórios 80 m² R$ 510.000
  </a>
</body></html>
"""

IMOVELWEB_HTML = """
<html><body>
  <div data-qa="posting PROPERTY" data-to-posting="/propriedades/apartamento-456.html?tracking=x">
    <span data-qa="POSTING_CARD_LOCATION">Rua Gaivota, Moema, São Paulo</span>
    Apartamento 2 quartos 80 m² R$ 520.000 São Paulo
  </div>
</body></html>
"""


def test_direct_html_parsers_preserve_each_portal_contract():
    quinto = parse_quintoandar_html(QUINTO_HTML)
    chaves = parse_chavesnamao_html(CHAVES_HTML)
    imovelweb = parse_imovelweb_html(IMOVELWEB_HTML, _metadata())

    assert quinto[0].url == "https://www.quintoandar.com.br/imovel/123"
    assert chaves[0].url == "https://www.chavesnamao.com.br/imovel/apartamento-80m2-123"
    assert imovelweb[0].url == "https://www.imovelweb.com.br/propriedades/apartamento-456.html"
    assert [items[0].price for items in (quinto, chaves, imovelweb)] == [
        500_000, 510_000, 520_000,
    ]


class _ConcurrentUnlocker:
    def __init__(self, delay=0.02):
        self.delay = delay
        self.active = 0
        self.max_active = 0

    async def fetch_html(self, source, _url):
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        try:
            await asyncio.sleep(self.delay)
            return {
                "QuintoAndar": QUINTO_HTML,
                "Chaves na Mão": CHAVES_HTML,
                "ImovelWeb": IMOVELWEB_HTML,
            }[source]
        finally:
            self.active -= 1


@pytest.mark.asyncio
async def test_collector_runs_sources_concurrently_and_emits_metrics():
    unlocker = _ConcurrentUnlocker()
    collector = MarketReferenceCollector(unlocker)

    result = await collector.collect(_metadata())

    assert unlocker.max_active == 3
    assert len(result) == 3
    metrics = collector.metrics_summary()
    assert set(metrics) == {"QuintoAndar", "Chaves na Mão", "ImovelWeb"}
    assert all(item["requests"] == 1 for item in metrics.values())


@pytest.mark.asyncio
async def test_collector_enforces_a_wall_clock_deadline_per_source():
    collector = MarketReferenceCollector(
        _ConcurrentUnlocker(delay=0.1), source_deadline_seconds=0.01,
    )

    with pytest.raises(ComparableSourceBlockedError, match="sources were unavailable"):
        await collector.collect(_metadata())

    assert all(item["failed"] == 1 for item in collector.metrics_summary().values())
