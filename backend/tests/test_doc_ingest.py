"""Testes da camada de ingestão e do validador de citação.

O teste mais importante deste arquivo é `test_trecho_inventado_e_negado`:
ele é o que impede o agente jurídico de afirmar o que não leu. Se ele
passar a falhar, a promessa de precisão do produto caiu — trate como
regressão bloqueante, não como teste chato.
"""

from __future__ import annotations

from pathlib import Path

import fitz
import pytest

from tools.doc_ingest import (
    Document,
    ingest_many,
    ingest_pdf,
    _classify,
    _normalize,
    find_in_docs,
)

# Autos reais fornecidos pelo escritório. Quando ausentes (CI limpo), os
# testes que dependem deles são pulados — não falham.
AUTOS = Path("/mnt/user-data/uploads/PROJETO ARGOS/LEILOES NEGATIVOS")


def _make_pdf(tmp_path: Path, pages: list[str], name: str = "doc.pdf") -> Path:
    doc = fitz.open()
    for text in pages:
        page = doc.new_page()
        page.insert_text((72, 72), text, fontsize=11)
    path = tmp_path / name
    doc.save(path)
    doc.close()
    return path


# ---------------------------------------------------------------------------
# Paginação — o que o parser antigo destruía
# ---------------------------------------------------------------------------

def test_paginacao_preservada(tmp_path):
    """Cada página vira um objeto próprio, com offsets no texto completo."""
    p = _make_pdf(tmp_path, ["primeira pagina", "segunda pagina", "terceira pagina"])
    doc = ingest_pdf(p, ocr=False)

    assert doc.n_paginas == 3
    assert [pg.n for pg in doc.pages] == [1, 2, 3]
    # invariante que sustenta o char_range de qualquer citação
    for pg in doc.pages:
        assert doc.full_text[pg.char_start : pg.char_end] == pg.text


def test_offset_mapeia_para_pagina_correta(tmp_path):
    p = _make_pdf(tmp_path, ["alpha unico", "bravo unico", "charlie unico"])
    doc = ingest_pdf(p, ocr=False)

    m = doc.locate("charlie unico")
    assert m is not None
    assert m.pagina == 3


def test_sha256_versiona_o_documento(tmp_path):
    """Documento alterado muda o hash — permite invalidar análise antiga."""
    a = _make_pdf(tmp_path, ["edital versao um"], "a.pdf")
    b = _make_pdf(tmp_path, ["edital versao dois"], "b.pdf")

    assert ingest_pdf(a, ocr=False).sha256 != ingest_pdf(b, ocr=False).sha256
    assert ingest_pdf(a, ocr=False).sha256 == ingest_pdf(a, ocr=False).sha256


def test_documentos_nao_sao_concatenados(tmp_path):
    """Regressão do bug central: o parser antigo juntava tudo e cortava em 8k.

    Ingerindo N documentos devem sair N objetos independentes, cada um com
    seu próprio hash, tipo e paginação. Nada de string única.
    """
    a = _make_pdf(tmp_path, ["conteudo do primeiro"], "um.pdf")
    b = _make_pdf(tmp_path, ["conteudo do segundo"], "dois.pdf")

    docs = ingest_many([a, b], ocr=False)
    assert len(docs) == 2
    assert docs[0].sha256 != docs[1].sha256
    assert "segundo" not in docs[0].full_text
    assert "primeiro" not in docs[1].full_text


def test_sem_truncagem(tmp_path):
    """Documento longo é ingerido inteiro — nada de [:8000].

    Era o bug mais grave do parser antigo: `pdf_texts[:8000]` cortava em
    silêncio um edital de 40 mil caracteres, e o agente respondia como se
    tivesse lido tudo.
    """
    # insert_text não faz wrap — precisa de linhas explícitas para encher
    pages = [
        f"pagina {i} " + "\n".join("texto de enchimento nesta linha" for _ in range(20))
        for i in range(30)
    ]
    doc = ingest_pdf(_make_pdf(tmp_path, pages), ocr=False)

    assert len(doc.full_text) > 8000
    # o trecho buscado só existe muito além do antigo corte de 8.000 chars
    m = doc.locate("pagina 29 texto de enchimento")
    assert m is not None
    assert m.char_start > 8000


# ---------------------------------------------------------------------------
# Normalização
# ---------------------------------------------------------------------------

def test_normalize_mapeia_offsets():
    texto = "Penhora   AVERBADA\nna matrícula"
    norm, index = _normalize(texto)

    assert "averbada" in norm
    assert len(norm) == len(index)
    pos = norm.find("averbada")
    assert texto[index[pos]] == "A"


def test_normalize_junta_palavra_hifenizada():
    norm, _ = _normalize("arremata-\nção do imóvel")
    assert "arrematacao" in norm


# ---------------------------------------------------------------------------
# Citação — o coração anti-alucinação
# ---------------------------------------------------------------------------

def test_citacao_literal_e_exata(tmp_path):
    doc = ingest_pdf(_make_pdf(tmp_path, ["somente as devedoras assinaram"]), ocr=False)
    m = doc.locate("somente as devedoras assinaram")

    assert m is not None
    assert m.exato is True
    assert doc.full_text[m.char_start : m.char_end] == "somente as devedoras assinaram"


@pytest.mark.parametrize(
    "variante",
    [
        "SOMENTE AS DEVEDORAS ASSINARAM",          # caixa
        "somente  as   devedoras  assinaram",      # espaços
        "somente as devedoras assinaram",          # idêntico
    ],
)
def test_citacao_tolera_sujeira_de_pdf(tmp_path, variante):
    """Um LLM normaliza espaços ao transcrever. Exigir byte a byte rejeitaria
    citações corretas e tornaria o agente inútil."""
    doc = ingest_pdf(_make_pdf(tmp_path, ["o qual somente as devedoras assinaram"]), ocr=False)
    assert doc.locate(variante) is not None


def test_citacao_tolera_ausencia_de_acento(tmp_path):
    doc = ingest_pdf(_make_pdf(tmp_path, ["nao houve intimação do cônjuge da executada"]), ocr=False)
    assert doc.locate("intimacao do conjuge da executada") is not None


def test_trecho_inventado_e_negado(tmp_path):
    """TESTE BLOQUEANTE — a regra dura do agente jurídico.

    Trecho plausível mas ausente do documento tem de ser negado. É isso que
    rebaixa o item para `nao_localizado` em vez de deixar o modelo afirmar.
    """
    doc = ingest_pdf(
        _make_pdf(tmp_path, ["o qual somente as devedoras assinaram o termo"]), ocr=False
    )

    assert doc.locate("somente as devedoras assinaram o termo de penhora") is None
    assert doc.locate("penhora averbada em favor do Banco Santander") is None
    assert doc.locate("o imovel foi arrematado por R$ 1.500.000,00") is None


def test_trecho_curto_nao_casa_por_acidente(tmp_path):
    """"art. 5" casaria em qualquer peça — exige-se substância mínima."""
    doc = ingest_pdf(_make_pdf(tmp_path, ["fundamento no art. 5 da Constituicao"]), ocr=False)
    assert doc.locate("art. 5") is None


def test_trecho_que_atravessa_paginas_reporta_intervalo(tmp_path):
    """Frase que vira a página é citação legítima — o que não se admite é
    rotulá-la como se estivesse inteira na primeira página.

    Em edital e matrícula isso é comum (descrição do imóvel, cadeia de
    averbações). Rejeitar perderia citação boa; mentir a página destrói a
    confiança. Reporta-se "p. 1-2".
    """
    doc = ingest_pdf(_make_pdf(tmp_path, ["a penhora foi", "regularmente intimada"]), ocr=False)
    m = doc.locate("a penhora foi regularmente intimada")

    assert m is not None
    assert m.pagina == 1
    assert m.pagina_fim == 2
    assert m.atravessa_paginas is True
    assert m.ref_pagina == "p. 1-2"


def test_citacao_em_pagina_unica_nao_reporta_intervalo(tmp_path):
    doc = ingest_pdf(_make_pdf(tmp_path, ["a penhora foi regularmente intimada"]), ocr=False)
    m = doc.locate("a penhora foi regularmente intimada")

    assert m is not None
    assert m.atravessa_paginas is False
    assert m.ref_pagina == "p. 1"


def test_find_in_docs_identifica_o_documento(tmp_path):
    a = _make_pdf(tmp_path, ["edital de leilao judicial eletronico"], "a.pdf")
    b = _make_pdf(tmp_path, ["termo de penhora lavrado nesta data"], "b.pdf")
    docs = ingest_many([a, b], ocr=False)

    found = find_in_docs(docs, "termo de penhora lavrado nesta data")
    assert found is not None
    assert found[0].arquivo == "b.pdf"


# ---------------------------------------------------------------------------
# Classificação de tipo
# ---------------------------------------------------------------------------

def test_mencao_nao_define_tipo():
    """Regressão de bug real: petição que CITA termo de penhora não É um
    termo de penhora. Classificar por menção produzia falso positivo em
    3 dos 5 autos reais do escritório."""
    peticao = (
        "EXCELENTISSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 2a VARA CIVEL\n"
        "ALVARO BAZZO GOMES vem, respeitosamente, expor que o termo de penhora\n"
        "foi lavrado sem a devida carta de arrematacao e sem laudo de avaliacao.\n"
    )
    assert _classify(peticao) == "peticao"


def test_classifica_acordao_por_cabecalho():
    assert _classify("AgInt no RECURSO ESPECIAL Nº 1617956 - MG\nRELATORA: MINISTRA X\nEMENTA") == "acordao"


def test_classifica_matricula_por_assinatura_registral():
    matricula = (
        "CARTORIO DE REGISTRO DE IMOVEIS DA COMARCA DE LONDRINA\n"
        "MATRICULA 104.093\n"
        "R-1/104093 - compra e venda\n"
        "Av-2/104093 - penhora nos autos\n"
    )
    assert _classify(matricula) == "matricula"


def test_classifica_edital_em_posicao_de_titulo():
    assert _classify("EDITAL DE LEILAO JUDICIAL ELETRONICO\n\nO Dr. Juiz de Direito...") == "edital_leilao"


def test_sem_sinal_devolve_indefinido():
    assert _classify("Relatorio interno de vistoria predial do condominio.") == "indefinido"


# ---------------------------------------------------------------------------
# Autos reais do escritório (golden set)
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not AUTOS.exists(), reason="autos reais não disponíveis neste ambiente")
def test_golden_set_classificacao():
    esperado = {
        "201602036414_43_202200437839__.pdf": "acordao",
        "201602036414_link_40186591_Petição Inicial_.pdf": "peticao",
        "201802975344_24_202301051016__.pdf": "peticao",
        "201802975344_84_202401095841__.pdf": "acordao",
        "201802975344_link_52633300_Petição inicial_.pdf": "peticao",
    }
    docs = ingest_many(sorted(AUTOS.glob("*.pdf")), ocr=False)
    obtido = {d.arquivo: d.doc_tipo for d in docs}

    for arquivo, tipo in esperado.items():
        if arquivo in obtido:
            assert obtido[arquivo] == tipo, f"{arquivo}: esperado {tipo}, obtido {obtido[arquivo]}"


@pytest.mark.skipif(not AUTOS.exists(), reason="autos reais não disponíveis neste ambiente")
def test_golden_set_citacoes_reais_e_falsas():
    """Trechos verdadeiros dos autos são aceitos; alucinações plausíveis, negadas."""
    docs = ingest_many(sorted(AUTOS.glob("*.pdf")), ocr=False)

    verdadeiros = [
        "somente as devedoras assinaram",
        "NECESSIDADE DE INTIMAÇÃO DO CÔNJUGE DO EXECUTADO",
    ]
    falsos = [
        "somente as devedoras assinaram o termo de penhora",
        "penhora realizada em favor do Banco Santander",
        "o imovel foi arrematado por R$ 1.500.000,00",
    ]

    for t in verdadeiros:
        assert find_in_docs(docs, t) is not None, f"deveria localizar: {t}"
    for t in falsos:
        assert find_in_docs(docs, t) is None, f"deveria NEGAR: {t}"
