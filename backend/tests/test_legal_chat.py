"""Testes dos guardrails do chat jurídico.

Os testes de RECUSA são os mais importantes do arquivo. Um chat jurídico
que responde "acho que vale a pena" no site de um escritório é passivo
regulatório e reputacional — e o print da conversa vira prova.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import fitz
import pytest

from graph.extrajudicial_calc import FatosExtrajudicial, Status, avaliar
from graph.legal_chat import (
    Classe,
    FALLBACK_SEGURO,
    achados_relevantes,
    classificar,
    encaminhar_ao_escritorio,
    montar_contexto,
    perguntas_sugeridas,
    registrar,
    validar_resposta,
)
from tools.doc_ingest import ingest_pdf


@pytest.fixture
def parecer_com_lacunas():
    """Caso real: só edital e matrícula, sem dossiê do cartório."""
    return avaliar(
        FatosExtrajudicial(
            residencial=True,
            data_averbacao_consolidacao=date(2026, 4, 2),
            data_1o_leilao=date(2026, 5, 29),
            data_2o_leilao=date(2026, 6, 11),
            valor_contratual_art24=253_345,
            imovel_ocupado=True,
            meses_estimados_ate_imissao=9,
            hoje=date(2026, 7, 29),
        )
    )


@pytest.fixture
def parecer_bloqueante():
    return avaliar(
        FatosExtrajudicial(
            residencial=False,
            intimacao_por_edital=False,
            data_intimacao_pessoal=date(2026, 3, 1),
            data_averbacao_consolidacao=date(2026, 3, 8),  # antes dos 15 dias
        )
    )


@pytest.fixture
def doc(tmp_path):
    pdf = fitz.open()
    page = pdf.new_page()
    page.insert_text(
        (60, 60),
        "EDITAL DE LEILAO\nO imovel encontra-se ocupado por terceiros.\n"
        "A desocupacao correra por conta do arrematante.",
        fontsize=11,
    )
    path = tmp_path / "edital.pdf"
    pdf.save(path)
    pdf.close()
    return ingest_pdf(path, ocr=False)


# ---------------------------------------------------------------------------
# RECUSAS — a parte que protege o escritório
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "pergunta",
    [
        "devo dar o lance nesse imóvel?",
        "vale a pena arrematar?",
        "compensa comprar esse apartamento?",
        "você compraria esse imóvel?",
        "o que você acha, arremato?",
        "me recomenda participar?",
        "posso confiar nesse leilão?",
        "é seguro arrematar aqui?",
        "eu deveria investir nisso?",
    ],
)
def test_pedido_de_conselho_e_sempre_recusado(pergunta):
    """Recomendação personalizada sobre conduta é consulta jurídica.

    Detectado por padrão de texto ANTES de qualquer LLM: um modelo
    persuadido responde; uma regex não.
    """
    assert classificar(pergunta) == Classe.ACONSELHAR


@pytest.mark.parametrize(
    "pergunta",
    [
        "consigo financiamento para esse imóvel?",
        "quanto vou pagar de imposto de renda na revenda?",
        "qual banco tem a melhor taxa de juros?",
        "vocês têm corretor para revender depois?",
        "onde invisto o que sobrar?",
    ],
)
def test_assunto_alheio_e_recusado(pergunta):
    assert classificar(pergunta) == Classe.FORA_ESCOPO


def test_itbi_e_desocupacao_nao_sao_fora_de_escopo():
    """Cuidado no filtro: ITBI e custo de desocupação SÃO do escopo — são
    custo do arrematante. Recusar isso quebraria o produto."""
    assert classificar("o ITBI entra no custo?") != Classe.FORA_ESCOPO
    assert classificar("quem paga a desocupação?") != Classe.FORA_ESCOPO


@pytest.mark.parametrize(
    "pergunta",
    [
        "e aquele outro imóvel de Londrina?",
        "qual dos dois é melhor?",
        "compara esse com o apartamento de Curitiba",
    ],
)
def test_pergunta_sobre_outro_imovel_e_recusada(pergunta):
    assert classificar(pergunta) == Classe.OUTRO_IMOVEL


def test_conselho_vence_calculo_em_pergunta_ambigua():
    """"Quanto vale a pena pagar?" contém padrão de cálculo E de conselho.
    Na dúvida, recusa — o caminho seguro é também o que monetiza."""
    assert classificar("quanto vale a pena pagar nesse imóvel?") == Classe.ACONSELHAR


def test_recusa_nao_monta_contexto(parecer_com_lacunas):
    ctx = montar_contexto("devo dar o lance?", parecer_com_lacunas)

    assert ctx.permite_gerar is False
    assert ctx.achados == []
    assert ctx.documentos == []
    assert "consulta jurídica" in ctx.motivo_recusa


def test_recusa_explica_o_que_pode_fazer(parecer_com_lacunas):
    """Recusa que só nega frustra. Recusa que redireciona converte."""
    ctx = montar_contexto("vale a pena?", parecer_com_lacunas)
    assert "posso explicar" in ctx.motivo_recusa.lower()


# ---------------------------------------------------------------------------
# Classes respondíveis
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "pergunta",
    ["onde diz que o imóvel está ocupado?", "em que página consta isso?",
     "me mostra onde está escrito", "de onde veio essa informação?"],
)
def test_localizar(pergunta):
    assert classificar(pergunta) == Classe.LOCALIZAR


@pytest.mark.parametrize(
    "pergunta",
    ["e se eu der lance de 240 mil?", "simula com lance de R$ 200.000",
     "quanto falta para atingir o piso?", "se eu ofertar 300 mil, dá certo?"],
)
def test_calcular(pergunta):
    assert classificar(pergunta) == Classe.CALCULAR


def test_explicar_e_o_padrao():
    assert classificar("o que significa purgação da mora?") == Classe.EXPLICAR


# ---------------------------------------------------------------------------
# LACUNA — o momento de conversão
# ---------------------------------------------------------------------------

def test_pergunta_sobre_item_nao_verificado_vira_lacuna(parecer_com_lacunas):
    """A pergunta mais valiosa do chat é a que ele não consegue responder."""
    ctx = montar_contexto(
        "a notificação do devedor foi feita direito?", parecer_com_lacunas
    )

    assert ctx.classe == Classe.LACUNA
    assert ctx.achados
    assert all(a.status == Status.NAO_VERIFICAVEL for a in ctx.achados)
    # e cada achado carrega a diligência que fecha a lacuna
    assert all(a.providencia for a in ctx.achados)


def test_item_verificado_nao_vira_lacuna(parecer_com_lacunas):
    ctx = montar_contexto("o primeiro leilão respeitou o prazo?", parecer_com_lacunas)
    assert ctx.classe == Classe.EXPLICAR


# ---------------------------------------------------------------------------
# Resolução pergunta → achados
# ---------------------------------------------------------------------------

def test_achados_relevantes_por_tema(parecer_com_lacunas):
    ids = {a.id for a in achados_relevantes("e a desocupação do imóvel?", parecer_com_lacunas)}
    assert "posse.desocupacao" in ids


def test_pergunta_sem_tema_reconhecido_nao_traz_achado(parecer_com_lacunas):
    """Melhor dizer "não identifiquei a que item você se refere" do que
    despejar o parecer inteiro e deixar o modelo escolher."""
    assert achados_relevantes("bom dia, tudo bem?", parecer_com_lacunas) == []


def test_contexto_de_explicar_nao_carrega_documentos(parecer_com_lacunas, doc):
    """Contexto que não chega ao modelo não pode ser mal usado."""
    ctx = montar_contexto("o que é purgação da mora?", parecer_com_lacunas, [doc])
    assert ctx.documentos == []


def test_contexto_de_localizar_carrega_documentos(parecer_com_lacunas, doc):
    ctx = montar_contexto("onde diz que está ocupado?", parecer_com_lacunas, [doc])
    assert ctx.documentos == [doc]


# ---------------------------------------------------------------------------
# Validação da resposta — herda a disciplina anti-alucinação do relatório
# ---------------------------------------------------------------------------

def test_citacao_inventada_e_removida(parecer_com_lacunas, doc):
    """O trecho não existe no edital. A sentença inteira sai."""
    ctx = montar_contexto("onde diz que está ocupado?", parecer_com_lacunas, [doc])
    texto = (
        'O imóvel está desocupado. O edital afirma que "o imovel foi entregue '
        'livre e desimpedido ao credor".'
    )
    v = validar_resposta(texto, ctx, [doc])

    assert v.citacoes_rejeitadas
    assert "livre e desimpedido" not in v.texto_seguro


def test_citacao_real_e_preservada_com_pagina(parecer_com_lacunas, doc):
    ctx = montar_contexto("onde diz que está ocupado?", parecer_com_lacunas, [doc])
    texto = 'O edital informa que "O imovel encontra-se ocupado por terceiros".'
    v = validar_resposta(texto, ctx, [doc])

    assert v.limpa
    assert v.citacoes_validas
    trecho, arquivo, pagina = v.citacoes_validas[0]
    assert arquivo == "edital.pdf"
    assert pagina == 1
    assert v.texto_seguro == texto


def test_referencia_a_achado_inexistente_e_removida(parecer_com_lacunas):
    """O modelo não pode inventar id de achado — nem citar achado que não
    foi autorizado para aquela pergunta."""
    ctx = montar_contexto("e a desocupação?", parecer_com_lacunas)
    texto = "O imóvel está ocupado [[posse.desocupacao]]. Não há penhora [[onus.penhora]]."
    v = validar_resposta(texto, ctx)

    assert "onus.penhora" in v.ids_invalidos
    assert "penhora" not in v.texto_seguro


def test_resposta_majoritariamente_invalida_e_bloqueada(parecer_com_lacunas, doc):
    """Sobrando pouco, não se entrega fragmento. Cai no fallback seguro."""
    ctx = montar_contexto("onde diz que está ocupado?", parecer_com_lacunas, [doc])
    texto = (
        'O edital diz "o imovel esta totalmente livre". '
        'A matricula informa "nao ha qualquer onus registrado". '
        'O laudo conclui "avaliacao de R$ 900.000,00".'
    )
    v = validar_resposta(texto, ctx, [doc])

    assert v.bloqueada is True
    assert v.texto_seguro == ""


def test_resposta_sem_citacao_nem_id_passa_intacta(parecer_com_lacunas):
    """Explicação conceitual (glossário) não precisa de citação documental."""
    ctx = montar_contexto("o que é purgação da mora?", parecer_com_lacunas)
    texto = "Purgação da mora é o pagamento das parcelas em atraso para regularizar a dívida."
    v = validar_resposta(texto, ctx)

    assert v.limpa
    assert v.texto_seguro == texto


def test_fallback_nao_afirma_nada():
    assert "não consigo responder" in FALLBACK_SEGURO.lower()
    assert "escritório" in FALLBACK_SEGURO.lower()


# ---------------------------------------------------------------------------
# Perguntas sugeridas
# ---------------------------------------------------------------------------

def test_sugestao_sempre_oferece_a_pergunta_desconfortavel(parecer_com_lacunas):
    """Oferecer "o que você não verificou?" comunica confiança que nenhum
    selo comunica."""
    assert "O que este relatório NÃO verificou?" in perguntas_sugeridas(parecer_com_lacunas)


def test_sugestao_reflete_o_parecer(parecer_com_lacunas, parecer_bloqueante):
    com_lacuna = perguntas_sugeridas(parecer_com_lacunas)
    com_vicio = perguntas_sugeridas(parecer_bloqueante)

    assert any("falta" in s.lower() for s in com_lacuna)
    assert any("desaconselhado" in s.lower() for s in com_vicio)


def test_sugestoes_sao_unicas_e_limitadas(parecer_com_lacunas):
    s = perguntas_sugeridas(parecer_com_lacunas, max_itens=3)
    assert len(s) <= 3
    assert len(s) == len(set(s))


# ---------------------------------------------------------------------------
# Auditoria e escalonamento
# ---------------------------------------------------------------------------

def test_registro_grava_base_da_resposta(parecer_com_lacunas, doc):
    ctx = montar_contexto("onde diz que está ocupado?", parecer_com_lacunas, [doc])
    v = validar_resposta(
        'O edital informa que "O imovel encontra-se ocupado por terceiros".', ctx, [doc]
    )
    reg = registrar("a1", ctx, v, parecer_com_lacunas, [doc])

    assert reg.imovel_id == "a1"
    assert reg.respondida is True
    assert reg.citacoes
    assert reg.documentos_sha256 == [doc.sha256]
    assert 0 < reg.cobertura < 1


def test_registro_marca_recusa_como_nao_respondida(parecer_com_lacunas):
    ctx = montar_contexto("devo dar lance?", parecer_com_lacunas)
    reg = registrar("a1", ctx, None, parecer_com_lacunas)

    assert reg.respondida is False
    assert reg.classe == "aconselhar"


def test_encaminhamento_leva_contexto_estruturado(parecer_com_lacunas):
    """O advogado abre já sabendo o imóvel, a dúvida e o que falta."""
    ctx = montar_contexto("a notificação foi feita direito?", parecer_com_lacunas)
    payload = encaminhar_ao_escritorio("a1", ctx, parecer_com_lacunas)

    assert payload["imovel_id"] == "a1"
    assert payload["classe"] == "lacuna"
    assert payload["achados_relacionados"]
    assert payload["documentos_faltantes"]
    assert payload["recomendacao_atual"] in ("participar", "cautela", "nao")
