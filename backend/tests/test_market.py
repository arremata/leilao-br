import json
from unittest.mock import patch, MagicMock, AsyncMock

from graph.state import AuctionState, PropertyMetadata, ComparableProperty
from graph.market import market_node


def _make_state(**overrides):
    defaults = dict(
        pdf_texts="Edital de Leilao",
        pdf_sources=["edital.pdf"],
        property_metadata=PropertyMetadata(
            address="Rua das Flores, 123, Centro, Sao Paulo - SP",
            property_type="Apartamento",
            area_m2=80.0,
            auction_price=350000.0,
            auction_date="15/06/2025",
            auction_type="Judicial",
            city="Sao Paulo",
            neighborhood="Centro",
            state="SP",
        ),
        research_plan="Research market prices in Centro, Sao Paulo",
    )
    defaults.update(overrides)
    return AuctionState(**defaults)


def _mock_llm_response(data: dict) -> MagicMock:
    mock = MagicMock()
    mock.choices = [
        MagicMock(
            message=MagicMock(content=json.dumps(data))
        )
    ]
    return mock


class TestMarketNode:
    def test_market_node_returns_market_result(self):
        state = _make_state()

        mock_search_results = [
            {"title": "Preco m2", "url": "http://x", "content": "R$ 12.000/m2 no Centro"}
        ]

        llm_data = {
            "price_per_m2_neighborhood": 12000.0,
            "price_per_m2_city": 9500.0,
            "comparable_properties": [],
            "reform_estimate": 25000.0,
            "area_appreciation_1y": 5.0,
            "area_appreciation_3y": 15.0,
            "area_appreciation_5y": 30.0,
            "city_appreciation_1y": 4.0,
            "liquidity_days": 45,
            "tendences": "Mercado em alta",
            "discount_percentage": 30.0,
            "market_score": 7,
            "raw_findings": "Search results indicate strong market",
        }

        with patch("graph.market._run_market_searches", new_callable=AsyncMock, return_value=[]), \
             patch("graph.market._call_market_llm", return_value=_mock_llm_response(llm_data)):
            result = market_node(state)

            assert result["market_result"].price_per_m2_neighborhood == 12000.0
            assert result["market_result"].market_score == 7

    def test_market_node_no_metadata(self):
        state = _make_state(property_metadata=None)

        result = market_node(state)

        assert result["market_result"].market_score == 0
        assert "errors" in result

    def test_market_node_llm_parse_failure(self):
        state = _make_state()

        mock_llm_response = MagicMock()
        mock_llm_response.choices = [
            MagicMock(message=MagicMock(content="not valid json"))
        ]

        with patch("graph.market._run_market_searches", new_callable=AsyncMock, return_value=[]), \
             patch("graph.market._call_market_llm", return_value=mock_llm_response):
            result = market_node(state)

            assert result["market_result"].market_score == 0
            assert "not valid json" in result["market_result"].raw_findings

    def test_market_node_with_comparable_properties(self):
        state = _make_state()

        llm_data = {
            "price_per_m2_neighborhood": 12000.0,
            "price_per_m2_city": 9500.0,
            "comparable_properties": [
                {
                    "address": "Rua A, 45",
                    "price": 960000.0,
                    "area_m2": 80.0,
                    "price_per_m2": 12000.0,
                    "source": "Zap",
                    "url": "http://zap.com/1",
                }
            ],
            "reform_estimate": 25000.0,
            "area_appreciation_1y": 5.0,
            "area_appreciation_3y": 15.0,
            "area_appreciation_5y": 30.0,
            "city_appreciation_1y": 4.0,
            "liquidity_days": 45,
            "tendences": "Mercado em alta",
            "discount_percentage": 30.0,
            "market_score": 8,
            "raw_findings": "Found comparable",
        }

        with patch("graph.market._run_market_searches", new_callable=AsyncMock, return_value=[]), \
             patch("graph.market._call_market_llm", return_value=_mock_llm_response(llm_data)):
            result = market_node(state)

            assert result["market_result"].market_score == 8
            assert len(result["market_result"].comparable_properties) == 1
            assert result["market_result"].comparable_properties[0].address == "Rua A, 45"

    def test_market_node_returns_dict(self):
        state = _make_state()

        llm_data = {
            "price_per_m2_neighborhood": 10000.0,
            "price_per_m2_city": 8000.0,
            "comparable_properties": [],
            "reform_estimate": 20000.0,
            "area_appreciation_1y": 3.0,
            "area_appreciation_3y": 10.0,
            "area_appreciation_5y": 25.0,
            "city_appreciation_1y": 2.5,
            "liquidity_days": 60,
            "tendences": "Estavel",
            "discount_percentage": 15.0,
            "market_score": 6,
            "raw_findings": "Stable market",
        }

        with patch("graph.market._run_market_searches", new_callable=AsyncMock, return_value=[]), \
             patch("graph.market._call_market_llm", return_value=_mock_llm_response(llm_data)):
            result = market_node(state)

            assert isinstance(result, dict)
            assert "market_result" in result


class TestMarketNodeScraperIntegration:
    def test_market_node_uses_scraper_comps_first(self):
        """Scraped comparable properties are passed directly to the LLM."""
        state = _make_state()
        comp = ComparableProperty(
            address="Rua A, 45",
            price=960000.0,
            area_m2=80.0,
            price_per_m2=12000.0,
            source="ZAP Imóveis",
            url="https://zapimoveis.com.br/imovel/1",
        )
        llm_data = {
            "price_per_m2_neighborhood": 12000.0,
            "price_per_m2_city": 9500.0,
            "comparable_properties": [
                {"address": "Rua A, 45", "price": 960000.0, "area_m2": 80.0, "price_per_m2": 12000.0, "source": "ZAP", "url": "https://zap/1"},
            ],
            "reform_estimate": 25000.0,
            "area_appreciation_1y": 5.0,
            "area_appreciation_3y": 15.0,
            "area_appreciation_5y": 30.0,
            "city_appreciation_1y": 4.0,
            "liquidity_days": 45,
            "tendencies": "Mercado em alta",
            "discount_percentage": 30.0,
            "market_score": 8,
            "raw_findings": "Scraped comparable data",
        }

        with patch("graph.market.scrape_comparables", new_callable=AsyncMock, return_value=[comp, comp, comp]) as mock_scrape, \
             patch("graph.market._call_market_llm", return_value=_mock_llm_response(llm_data)) as mock_llm:
            result = market_node(state)

        assert result["market_result"].market_score == 8
        mock_scrape.assert_called_once()
        assert len(mock_llm.call_args.args[1]) == 3

    def test_market_node_handles_empty_scraper_results(self):
        """The LLM still runs when listing scrapers return no comparables."""
        state = _make_state()
        llm_data = {
            "price_per_m2_neighborhood": 10000.0,
            "price_per_m2_city": 8000.0,
            "comparable_properties": [],
            "reform_estimate": 20000.0,
            "area_appreciation_1y": 3.0,
            "area_appreciation_3y": 10.0,
            "area_appreciation_5y": 25.0,
            "city_appreciation_1y": 2.5,
            "liquidity_days": 60,
            "tendencies": "Estavel",
            "discount_percentage": 15.0,
            "market_score": 6,
            "raw_findings": "No scraped comparables",
        }

        with patch("graph.market.scrape_comparables", new_callable=AsyncMock, return_value=[]) as mock_scrape, \
             patch("graph.market._call_market_llm", return_value=_mock_llm_response(llm_data)) as mock_llm:
            result = market_node(state)

        assert result["market_result"].market_score == 6
        mock_scrape.assert_called_once()
        assert mock_llm.call_args.args[1] == []
