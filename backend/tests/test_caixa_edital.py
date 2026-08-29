from ingestion.adapters.caixa_edital import merge_edital_data, parse_edital_text


EDITAL_TEXT = """
LICITAÇÃO CAIXA Nº 0027/ 0326 - CPVE/RE
LOCAL DA SESSÃO DO LEILÃO: No site www.fidalgoleiloes.com.br
LEILOEIRO(A) OFICIAL: PATRICIA AVELAR MONTEIRO FIDALGO
INSCRIÇÃO NA JUNTA COMERCIAL (UF): SP
Nº DA INSCRIÇÃO: 1043
TELEFONE: (11) 2653-8583 / 2653-0553
E-MAIL: tania@fidalgoleiloes.com.br
COMISSÃO: 5% da proposta. Paga pelo proponente. Não inclusa do lance.
PRAZO PARA PAGAMENTO DA COMISSÃO DO LEILOEIRO: No dia da arrematação.
PRAZO PARA PAGAMENTO DA PARTE A VISTA: Em até 2 dias após a homologação.
PRAZO PARA APRESENTAÇÃO DA ESCRITURA/CONTRATO REGISTRADO: 30 dias a contar da assinatura do
instrumento de compra e venda.

Estado: PR
Cidade: CURITIBA
175
RUA ANGELO CUNICO N. 777
Casa, 161,52 m2. IPTU: 50100390294000 Matrícula: 69127 Ofício: 02.
10145069
406.733,59
730.000,00
176
Outro imóvel. Imóvel com gravame/penhora averbada na matrícula. Regularização por conta do adquirente.
8787705662369
153.717,24
262.500,00
"""


def test_parse_edital_text_extracts_shared_and_property_facts():
    data = parse_edital_text(EDITAL_TEXT, "10145069")

    assert data["auctionNumber"] == "0027/0326 - CPVE/RE"
    assert data["lotNumber"] == "175"
    assert data["auctioneerName"] == "PATRICIA AVELAR MONTEIRO FIDALGO"
    assert data["auctioneerSite"] == "www.fidalgoleiloes.com.br"
    assert data["auctioneerPhone"] == "(11) 2653-8583 / 2653-0553"
    assert data["auctioneerEmail"] == "tania@fidalgoleiloes.com.br"
    assert data["auctioneerRegistration"] == "SP · 1043"
    assert data["commissionRate"] == 0.05
    assert data["commissionPaymentDeadline"] == "No dia da arrematação"
    assert data["cashPaymentDeadline"] == "Em até 2 dias após a homologação"
    assert data["registeredInstrumentDeadline"] == (
        "30 dias a contar da assinatura do instrumento de compra e venda"
    )
    assert data["minimumSalePrice"] == 406733.59
    assert data["appraisalValue"] == 730000.0
    assert data["iptuRegistration"] == "50100390294000"
    assert data["registryOffice"] == "02"
    assert "alerts" not in data


def test_parse_edital_text_keeps_property_specific_alerts():
    data = parse_edital_text(EDITAL_TEXT, "8787705662369")

    assert data["lotNumber"] == "176"
    assert len(data["alerts"]) == 2
    assert "gravame/penhora" in data["alerts"][0]
    assert "Regularização" in data["alerts"][1]


def test_merge_edital_data_prefers_property_page_and_combines_alerts():
    merged = merge_edital_data(
        {"auctioneerName": "SEM ACENTO", "alerts": ["Alerta A"]},
        {"auctioneerName": "COM ACENTO", "paymentMethods": "À vista", "alerts": ["Alerta B"]},
    )

    assert merged["auctioneerName"] == "COM ACENTO"
    assert merged["paymentMethods"] == "À vista"
    assert merged["alerts"] == ["Alerta A", "Alerta B"]
