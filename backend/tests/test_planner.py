import json
from unittest.mock import patch, MagicMock

from graph.state import AuctionState
from graph.planner import planner_node


def test_planner_extracts_metadata():
    """Test that planner node extracts property metadata from PDF text and creates a research plan."""
    state = AuctionState(
        pdf_texts="Edital de Leilão Judicial\n"
                  "Endereço: Rua das Flores, 123, Centro, São Paulo - SP\n"
                  "Área: 80m²\n"
                  "Valor de Avaliação: R$ 500.000,00\n"
                  "Valor de 1ª Praça: R$ 350.000,00\n"
                  "Matrícula: 123.456\n"
                  "Leiloeiro: João da Silva\n"
                  "Data do Leilão: 15/06/2025\n"
                  "Tipo: Apartamento",
        pdf_sources=["edital.pdf"],
    )

    mock_response = MagicMock()
    mock_response.choices = [
        MagicMock(
            message=MagicMock(
                content=json.dumps({
                    "property_metadata": {
                        "address": "Rua das Flores, 123, Centro, São Paulo - SP",
                        "property_type": "Apartamento",
                        "area_m2": 80.0,
                        "auction_price": 350000.0,
                        "market_value_estimate": 500000.0,
                        "auction_date": "15/06/2025",
                        "auction_type": "Judicial",
                        "matricula": "123.456",
                        "court_or_leiloeiro": "João da Silva",
                        "city": "São Paulo",
                        "neighborhood": "Centro",
                        "state": "SP",
                    },
                    "research_plan": "Research market prices in Centro, São Paulo. Check legal status of matrícula 123.456.",
                })
            )
        )
    ]

    with patch("graph.planner._call_planner_llm", return_value=mock_response):
        result = planner_node(state)

        assert result["property_metadata"].city == "São Paulo"
        assert result["property_metadata"].area_m2 == 80.0
        assert "research_plan" in result
        assert "Centro" in result["research_plan"]


def test_planner_handles_empty_text():
    """Test that planner handles empty PDF text gracefully.

    Sem PDF, o planner NÃO devolve property_metadata — preserva o que o
    discovery já extraiu (comportamento de páginas Caixa sem PDFs).
    """
    state = AuctionState(pdf_texts="", pdf_sources=[])

    result = planner_node(state)

    assert "property_metadata" not in result
    assert "errors" in result
