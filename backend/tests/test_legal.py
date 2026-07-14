import json
from unittest.mock import patch, MagicMock

from graph.state import AuctionState, PropertyMetadata
from graph.legal import legal_node, _chunk_text, _prepare_edital_text, CHUNK_THRESHOLD


def _make_state(**overrides):
    """Helper to build an AuctionState with sensible defaults."""
    defaults = dict(
        pdf_texts="Edital de Leilao Judicial\nMatricula: 123.456\nPenhora: Nenhuma",
        pdf_sources=["edital.pdf"],
        property_metadata=PropertyMetadata(
            address="Rua das Flores, 123, Centro, Sao Paulo - SP",
            property_type="Apartamento",
            area_m2=80.0,
            auction_price=350000.0,
            auction_date="15/06/2025",
            auction_type="Judicial",
            matricula="123.456",
            city="Sao Paulo",
            neighborhood="Centro",
            state="SP",
        ),
        research_plan="Check legal status of matricula 123.456",
    )
    defaults.update(overrides)
    return AuctionState(**defaults)


def _mock_llm_response(parsed_dict: dict) -> MagicMock:
    """Build a mock LiteLLM response whose content is the JSON of parsed_dict."""
    mock = MagicMock()
    mock.choices = [
        MagicMock(
            message=MagicMock(content=json.dumps(parsed_dict))
        )
    ]
    return mock


LOW_RISK_RESPONSE = {
    "registration_status": "Registrado",
    "liens": [],
    "judicial_disputes": [],
    "tax_debts_iptu": "Nenhum debito",
    "tax_debts_itbi": "Nenhum debito",
    "condominium_debts": "N/A",
    "federal_state_debts": "Nenhum debito",
    "zoning_compliance": "Residencial conforme",
    "construction_permits": "Habite-se OK",
    "occupation_status": "Desocupado",
    "usufruct_rights": "Nenhum",
    "risk_level": "low",
    "risk_details": "Nenhum risco significativo",
    "raw_findings": "Property clean",
    "modalidade": "judicial",
    "eviction_deadline": "",
    "eviction_cost_estimate": None,
}

HIGH_RISK_RESPONSE = {
    "registration_status": "Registrado com pendencias",
    "liens": ["Penhora judicial R$ 200.000", "Hipoteca bancaria"],
    "judicial_disputes": ["Execucao fiscal", "Acao reivindicatoria"],
    "tax_debts_iptu": "Debito de R$ 15.000",
    "tax_debts_itbi": "Pendente",
    "condominium_debts": "Debito R$ 8.000",
    "federal_state_debts": "Divida Ativa Federal",
    "zoning_compliance": "Irregular",
    "construction_permits": "Sem habite-se",
    "occupation_status": "Posseiro",
    "usufruct_rights": "Usufruto vitalicio",
    "risk_level": "critical",
    "risk_details": "Multiplos onus e acoes judiciais",
    "raw_findings": "Multiple issues found",
    "modalidade": "judicial",
    "eviction_deadline": "60 dias",
    "eviction_cost_estimate": 12000.0,
}

VALID_DETAIL = {
    "modalidade": "judicial",
    "modalidade_label": "Leilão judicial eletrônico",
    "base_legal": "CPC, arts. 879-903",
    "conclusao": {
        "recomendacao": "cautela",
        "principal_risco": "Intimacoes do art. 889 nao verificaveis pelo edital",
        "providencia": "Obter certidao de intimacao nos autos",
    },
    "processo": {"tipo": "Execucao", "numero": "1234-56.2025.8.26.0100", "foro": "Foro Central", "fase": "Leilao designado", "link": None},
    "partes": {"credor": "Banco X", "devedor": "Executado Y", "observacao": ""},
    "divida": {"valor": None, "data_atualizacao": "", "memoria_calculo": "nao-localizado", "impugnacao": ""},
    "matricula": {"numero": "123.456", "cartorio": "1o CRI de Sao Paulo", "proprietario": "Executado Y", "titularidade": "Integral",
                  "onus": [{"tipo": "Penhora", "descricao": "Averbada nos autos", "gravidade": "warn"}]},
    "edital_analise": {"data_publicacao": "01/06/2025", "antecedencia": "Adequada", "valor_avaliacao": 500000.0,
                       "lance_minimo": 350000.0, "debitos": "IPTU sub-roga no preco", "desocupacao": "Desocupado",
                       "divergencias": []},
    "avaliacao": {"data": "", "valor": 500000.0, "avaliador": "Judicial", "vistoria": "nao-localizado",
                  "atualidade": "Lance em 70% da avaliacao", "impugnacao": ""},
    "riscos": [{"tipo": "Preco vil (art. 891)", "nivel": "baixo", "verificacao": "verificado",
                "fonte": "lance minimo de 70% da avaliacao"}],
    "verificacoes": [{"item": "Intimacao do leilao (art. 889)", "estado": "requer-humano", "fonte": "Autos", "nota": ""}],
    "documentos": [{"tipo": "Edital", "nome": "Edital de leilao", "origem": "tribunal", "url": None, "data": None,
                    "status": "baixado", "baseou": "Datas, valores e onus"}],
}


def test_legal_node_returns_legal_result_with_low_risk():
    """legal_node should return a LegalResult with correct fields for a clean property."""
    state = _make_state()

    with patch("graph.legal._call_legal_llm", return_value=_mock_llm_response(LOW_RISK_RESPONSE)):
        result = legal_node(state)

    assert "legal_result" in result
    legal = result["legal_result"]
    assert legal.risk_level == "low"
    assert legal.registration_status == "Registrado"
    assert legal.liens == []
    assert legal.judicial_disputes == []
    assert legal.occupation_status == "Desocupado"
    assert legal.modalidade == "judicial"
    assert legal.detail is None  # sem detail na resposta -> None


def test_legal_node_returns_critical_risk():
    """legal_node should return a LegalResult with critical risk for a problematic property."""
    state = _make_state()

    with patch("graph.legal._call_legal_llm", return_value=_mock_llm_response(HIGH_RISK_RESPONSE)):
        result = legal_node(state)

    legal = result["legal_result"]
    assert legal.risk_level == "critical"
    assert len(legal.liens) == 2
    assert len(legal.judicial_disputes) == 2
    assert legal.occupation_status == "Posseiro"
    assert legal.eviction_cost_estimate == 12000.0
    assert legal.eviction_deadline == "60 dias"


def test_legal_node_validates_detail():
    """A valid `detail` object should be validated and stored as a dict."""
    state = _make_state()
    response = dict(LOW_RISK_RESPONSE, detail=VALID_DETAIL)

    with patch("graph.legal._call_legal_llm", return_value=_mock_llm_response(response)):
        result = legal_node(state)

    legal = result["legal_result"]
    assert legal.detail is not None
    assert legal.detail["modalidade"] == "judicial"
    assert legal.detail["conclusao"]["recomendacao"] == "cautela"
    assert legal.detail["riscos"][0]["verificacao"] == "verificado"


def test_legal_node_retries_on_invalid_detail_then_falls_back_to_unknown():
    """Invalid detail schema triggers one retry; persistent failure -> risk_level 'unknown'."""
    state = _make_state()
    bad_detail = dict(VALID_DETAIL, conclusao={"recomendacao": "talvez", "principal_risco": "x", "providencia": "y"})
    bad_response = _mock_llm_response(dict(LOW_RISK_RESPONSE, detail=bad_detail))

    with patch("graph.legal._call_legal_llm", return_value=bad_response) as mock_llm:
        result = legal_node(state)

    assert mock_llm.call_count == 2  # tentativa + retry com feedback
    # o retry recebe o feedback do erro como 3o argumento
    assert mock_llm.call_args_list[1][0][2] is not None
    legal = result["legal_result"]
    assert legal.risk_level == "unknown"
    assert "Parse error" in legal.risk_details


def test_legal_node_retry_recovers():
    """If the retry returns valid JSON, the node uses it."""
    state = _make_state()
    bad = MagicMock()
    bad.choices = [MagicMock(message=MagicMock(content="not json"))]
    good = _mock_llm_response(dict(LOW_RISK_RESPONSE, detail=VALID_DETAIL))

    with patch("graph.legal._call_legal_llm", side_effect=[bad, good]) as mock_llm:
        result = legal_node(state)

    assert mock_llm.call_count == 2
    assert result["legal_result"].risk_level == "low"
    assert result["legal_result"].detail is not None


def test_legal_node_no_metadata():
    """legal_node should return unknown risk when no property metadata is available."""
    state = AuctionState(
        pdf_texts="Some text",
        pdf_sources=["doc.pdf"],
        property_metadata=None,
    )

    with patch("graph.legal._call_legal_llm"):
        result = legal_node(state)

    assert "legal_result" in result
    assert result["legal_result"].risk_level == "unknown"
    assert "errors" in result
    assert len(result["errors"]) > 0


def test_legal_node_invalid_json_response():
    """legal_node should degrade to 'unknown' (not 'critical') on unparseable output."""
    state = _make_state()

    bad_response = MagicMock()
    bad_response.choices = [MagicMock(message=MagicMock(content="This is not valid JSON"))]

    with patch("graph.legal._call_legal_llm", return_value=bad_response):
        result = legal_node(state)

    legal = result["legal_result"]
    assert legal.risk_level == "unknown"
    assert "Parse error" in legal.risk_details
    assert legal.raw_findings == "This is not valid JSON"


def test_legal_node_passes_pdf_texts_to_llm():
    """legal_node should include full pdf_texts (short editais are not truncated)."""
    state = _make_state(pdf_texts="Important legal text about penhoras")

    with patch("graph.legal._call_legal_llm", return_value=_mock_llm_response(LOW_RISK_RESPONSE)) as mock_llm:
        legal_node(state)

    call_args = mock_llm.call_args
    assert call_args[0][1] == "Important legal text about penhoras"


def test_legal_node_empty_pdf_texts():
    """legal_node should work even with empty pdf_texts."""
    state = _make_state(pdf_texts="")

    with patch("graph.legal._call_legal_llm", return_value=_mock_llm_response(LOW_RISK_RESPONSE)):
        result = legal_node(state)

    assert result["legal_result"].risk_level == "low"


def test_legal_node_long_edital_uses_meta_summarization():
    """Editais above CHUNK_THRESHOLD go through per-chunk fact extraction."""
    long_text = ("Clausula de debito de IPTU. " * 2000)  # > CHUNK_THRESHOLD
    assert len(long_text) > CHUNK_THRESHOLD
    state = _make_state(pdf_texts=long_text)

    with patch("graph.legal._summarize_chunk", return_value="FATO — fonte: 'Clausula de debito de IPTU.'") as mock_chunk, \
         patch("graph.legal._call_legal_llm", return_value=_mock_llm_response(LOW_RISK_RESPONSE)) as mock_llm:
        legal_node(state)

    assert mock_chunk.call_count >= 2
    # o texto final passado ao LLM é a consolidação dos fatos, não o edital cru
    final_text = mock_llm.call_args[0][1]
    assert "FATO — fonte:" in final_text
    assert len(final_text) < len(long_text)


def test_chunk_text_splits_and_preserves_content():
    text = "A" * 45000
    chunks = _chunk_text(text, size=20000)
    assert len(chunks) == 3
    assert "".join(chunks) == text


def test_prepare_edital_text_short_passthrough():
    """Short editais are passed through untouched — no LLM calls."""
    with patch("graph.legal._summarize_chunk") as mock_chunk:
        result = _prepare_edital_text("Edital curto")
    assert result == "Edital curto"
    mock_chunk.assert_not_called()
