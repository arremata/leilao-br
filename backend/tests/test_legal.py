import json
from unittest.mock import MagicMock, patch

from graph.legal import legal_node
from graph.state import AuctionState, PropertyMetadata


def _state(pdf_texts="Edital sem ônus"):
    return AuctionState(
        pdf_texts=pdf_texts,
        property_metadata=PropertyMetadata(
            address="Rua A", property_type="Apartamento", auction_price=100_000,
            matricula="123", city="Curitiba", neighborhood="Centro", state="PR",
        ),
    )


def _response(payload):
    response = MagicMock()
    response.choices = [MagicMock(message=MagicMock(content=json.dumps(payload)))]
    return response


def test_legal_node_parses_evidence_from_document_analysis():
    payload = {
        "registration_status": "Registrado", "liens": [],
        "judicial_disputes": [], "occupation_status": "Desocupado",
        "risk_level": "low", "risk_details": "Sem ressalvas",
    }
    with patch("graph.legal._call_legal_llm", return_value=_response(payload)) as call:
        result = legal_node(_state("Texto oficial do edital"))

    assert result["legal_result"].risk_level == "low"
    assert result["legal_result"].registration_status == "Registrado"
    assert call.call_args.args[1] == "Texto oficial do edital"


def test_legal_node_parses_critical_risk():
    payload = {
        "liens": ["Penhora", "Hipoteca"], "judicial_disputes": ["Execução"],
        "occupation_status": "Posseiro", "risk_level": "critical",
    }
    with patch("graph.legal._call_legal_llm", return_value=_response(payload)):
        legal = legal_node(_state())["legal_result"]
    assert legal.risk_level == "critical"
    assert len(legal.liens) == 2


def test_legal_node_no_metadata_does_not_call_llm():
    with patch("graph.legal._call_legal_llm") as call:
        result = legal_node(AuctionState(pdf_texts="texto"))
    assert result["legal_result"].risk_level == "critical"
    assert "errors" in result
    call.assert_not_called()


def test_legal_node_invalid_json_is_safe():
    response = MagicMock()
    response.choices = [MagicMock(message=MagicMock(content="not json"))]
    with patch("graph.legal._call_legal_llm", return_value=response):
        legal = legal_node(_state())["legal_result"]
    assert legal.risk_level == "critical"
    assert "Parse error" in legal.risk_details
    assert legal.raw_findings == "not json"


def test_legal_node_ignores_unknown_llm_fields():
    with patch("graph.legal._call_legal_llm", return_value=_response({
        "risk_level": "low", "invented_field": "ignored",
    })):
        legal = legal_node(_state())["legal_result"]
    assert legal.risk_level == "low"
    assert not hasattr(legal, "invented_field")
