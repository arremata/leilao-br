"""Testes do motor determinístico da trilha extrajudicial.

Todo prazo e todo piso testado aqui foi conferido contra o texto literal da
Lei 9.514/97 no Planalto (redação vigente, com as alterações da Lei
14.711/2023). Se um número mudar por alteração legislativa, estes testes
falham — é o comportamento desejado.
"""

from __future__ import annotations

from datetime import date

import pytest

from graph.extrajudicial_calc import (
    FatosExtrajudicial,
    Gravidade,
    Status,
    avaliar,
)


def _achado(parecer, id_):
    for a in parecer.achados:
        if a.id == id_:
            return a
    raise AssertionError(f"achado {id_} não produzido")


# ---------------------------------------------------------------------------
# Disciplina da lacuna: sem entrada, NUNCA se presume conformidade
# ---------------------------------------------------------------------------

def test_sem_nenhuma_entrada_tudo_e_nao_verificavel():
    """O caso mais importante do arquivo.

    Um agente que recebe zero documento não pode devolver "sem riscos".
    Todos os itens têm de sair como lacuna declarada, e a cobertura, zero.
    """
    p = avaliar(FatosExtrajudicial())

    assert p.cobertura == 0.0
    assert all(a.status == Status.NAO_VERIFICAVEL for a in p.achados)
    assert p.recomendacao == "cautela"
    # e cada lacuna diz o que buscar
    assert all(a.providencia for a in p.lacunas)


def test_lacuna_nao_conta_como_bloqueante():
    """Falta de documento é lacuna, não é vício. Confundir os dois é
    exatamente o que faz o cliente perder confiança."""
    p = avaliar(FatosExtrajudicial())
    assert p.bloqueantes == []


# ---------------------------------------------------------------------------
# Notificação — art. 26. O único grupo que trava a posse.
# ---------------------------------------------------------------------------

def test_consolidacao_antes_dos_15_dias_e_vicio_que_trava_posse():
    """art. 26, § 1º e § 7º: averbar antes de expirar o prazo de purgação
    priva o devedor de direito legal — e notificação é a exceção do
    art. 30, § único."""
    p = avaliar(
        FatosExtrajudicial(
            residencial=False,
            intimacao_por_edital=False,
            data_intimacao_pessoal=date(2026, 3, 1),
            data_averbacao_consolidacao=date(2026, 3, 10),  # 9 dias
        )
    )
    a = _achado(p, "purgacao.prazo")

    assert a.status == Status.NAO_CONFORME
    assert a.trava_posse is True
    assert a.bloqueante is True
    assert a.gravidade == Gravidade.CRITICA
    assert "9 dias" in a.calculo
    assert p.recomendacao == "nao"


def test_consolidacao_no_15o_dia_e_conforme():
    p = avaliar(
        FatosExtrajudicial(
            residencial=False,
            intimacao_por_edital=False,
            data_intimacao_pessoal=date(2026, 3, 1),
            data_averbacao_consolidacao=date(2026, 3, 16),  # 15 dias
        )
    )
    assert _achado(p, "purgacao.prazo").status == Status.CONFORME


def test_prazo_por_edital_conta_da_ultima_publicacao():
    """art. 26, § 4º, parte final: "contado o prazo para purgação da mora da
    data da última publicação do edital". Contar da primeira publicação
    inverteria o resultado."""
    fatos = FatosExtrajudicial(
        residencial=False,
        intimacao_por_edital=True,
        certidao_local_ignorado=True,
        dias_publicacao_edital=3,
        data_intimacao_pessoal=date(2026, 3, 1),          # deve ser ignorada
        data_ultima_publicacao_edital=date(2026, 3, 20),
        data_averbacao_consolidacao=date(2026, 3, 28),    # 8 dias da última pub.
    )
    a = _achado(avaliar(fatos), "purgacao.prazo")

    assert a.status == Status.NAO_CONFORME
    assert "20/03/2026" in a.calculo


def test_edital_sem_certidao_de_local_ignorado_e_vicio():
    """art. 26, § 4º: edital é via excepcional, pressupõe certidão."""
    p = avaliar(
        FatosExtrajudicial(intimacao_por_edital=True, certidao_local_ignorado=False)
    )
    a = _achado(p, "purgacao.via")

    assert a.status == Status.NAO_CONFORME
    assert a.trava_posse is True
    assert "sem certidão" in a.conclusao


def test_edital_sem_envio_eletronico_previo_e_vicio():
    """art. 26, § 4º-B: se o contrato traz contato eletrônico, o envio por
    essa via é "imprescindível" antes do edital."""
    p = avaliar(
        FatosExtrajudicial(
            intimacao_por_edital=True,
            certidao_local_ignorado=True,
            contrato_tem_contato_eletronico=True,
            data_envio_intimacao_eletronica=None,
        )
    )
    a = _achado(p, "purgacao.via")

    assert a.status == Status.NAO_CONFORME
    assert "imprescindível" in a.conclusao


def test_envio_eletronico_com_menos_de_15_dias_de_antecedencia():
    p = avaliar(
        FatosExtrajudicial(
            intimacao_por_edital=True,
            certidao_local_ignorado=True,
            contrato_tem_contato_eletronico=True,
            data_envio_intimacao_eletronica=date(2026, 3, 10),
            data_ultima_publicacao_edital=date(2026, 3, 18),  # 8 dias
        )
    )
    a = _achado(p, "purgacao.via")

    assert a.status == Status.NAO_CONFORME
    assert "8 dias de antecedência" in a.conclusao


def test_edital_publicado_por_menos_de_3_dias():
    p = avaliar(
        FatosExtrajudicial(
            intimacao_por_edital=True,
            certidao_local_ignorado=True,
            dias_publicacao_edital=2,
        )
    )
    assert _achado(p, "purgacao.via").status == Status.NAO_CONFORME


def test_intimacao_pessoal_e_conforme():
    a = _achado(avaliar(FatosExtrajudicial(intimacao_por_edital=False)), "purgacao.via")
    assert a.status == Status.CONFORME
    assert a.trava_posse is True


# ---------------------------------------------------------------------------
# Regime residencial — art. 26-A
# ---------------------------------------------------------------------------

def test_residencial_exige_15_mais_30_dias():
    """art. 26-A, § 1º: consolidação averbada 30 dias APÓS expirar o prazo
    de purgação. Total mínimo de 45 dias desde a intimação."""
    fatos = FatosExtrajudicial(
        residencial=True,
        intimacao_por_edital=False,
        data_intimacao_pessoal=date(2026, 3, 1),
        data_averbacao_consolidacao=date(2026, 4, 5),  # 35 dias — insuficiente
    )
    a = _achado(avaliar(fatos), "consolidacao.residencial")

    assert a.status == Status.NAO_CONFORME
    assert a.trava_posse is True
    assert "45" in a.calculo


def test_residencial_com_45_dias_e_conforme():
    fatos = FatosExtrajudicial(
        residencial=True,
        intimacao_por_edital=False,
        data_intimacao_pessoal=date(2026, 3, 1),
        data_averbacao_consolidacao=date(2026, 4, 15),  # 45 dias
    )
    assert _achado(avaliar(fatos), "consolidacao.residencial").status == Status.CONFORME


def test_nao_residencial_torna_o_item_inaplicavel():
    a = _achado(avaliar(FatosExtrajudicial(residencial=False)), "consolidacao.residencial")
    assert a.status == Status.NAO_APLICAVEL


def test_inaplicavel_nao_penaliza_cobertura():
    """Item que não incide no caso não pode ser contado como lacuna."""
    p = avaliar(FatosExtrajudicial(residencial=False))
    ids = [a.id for a in p.achados if a.status == Status.NAO_APLICAVEL]
    assert "consolidacao.residencial" in ids


# ---------------------------------------------------------------------------
# Prazos dos leilões — NÃO travam a posse (art. 30, § único)
# ---------------------------------------------------------------------------

def test_leilao_fora_dos_60_dias_nao_trava_posse():
    """A distinção comercial central: irregularidade de leilão vira perdas
    e danos, não perda do imóvel."""
    fatos = FatosExtrajudicial(
        data_averbacao_consolidacao=date(2026, 1, 10),
        data_1o_leilao=date(2026, 4, 1),  # 81 dias
    )
    a = _achado(avaliar(fatos), "leilao.prazo_1o")

    assert a.status == Status.NAO_CONFORME
    assert a.trava_posse is False
    assert a.bloqueante is False
    assert a.gravidade == Gravidade.BAIXA
    assert "perdas e danos" in a.conclusao


def test_leilao_no_60o_dia_e_conforme():
    fatos = FatosExtrajudicial(
        data_averbacao_consolidacao=date(2026, 1, 10),
        data_1o_leilao=date(2026, 3, 11),  # exatamente 60 dias
    )
    assert _achado(avaliar(fatos), "leilao.prazo_1o").status == Status.CONFORME


def test_segundo_leilao_alem_de_15_dias():
    fatos = FatosExtrajudicial(
        data_1o_leilao=date(2026, 3, 1), data_2o_leilao=date(2026, 3, 25)
    )
    a = _achado(avaliar(fatos), "leilao.prazo_2o")
    assert a.status == Status.NAO_CONFORME
    assert a.trava_posse is False


def test_segundo_leilao_antes_do_primeiro_e_inconsistencia():
    fatos = FatosExtrajudicial(
        data_1o_leilao=date(2026, 3, 20), data_2o_leilao=date(2026, 3, 1)
    )
    a = _achado(avaliar(fatos), "leilao.prazo_2o")
    assert a.status == Status.NAO_CONFORME
    assert "inconsistência" in a.conclusao


def test_datas_nao_comunicadas_nao_travam_posse():
    a = _achado(
        avaliar(FatosExtrajudicial(datas_comunicadas_ao_devedor=False)),
        "leilao.comunicacao",
    )
    assert a.status == Status.NAO_CONFORME
    assert a.trava_posse is False
    assert "Não confundir" in a.conclusao


# ---------------------------------------------------------------------------
# Valores
# ---------------------------------------------------------------------------

def test_base_itbi_maior_que_contratual_eleva_o_minimo():
    """art. 24, § único: se o valor contratual for inferior à base do ITBI,
    esta última é o mínimo do 1º leilão."""
    fatos = FatosExtrajudicial(valor_contratual_art24=200_000, base_calculo_itbi=260_000)
    a = _achado(avaliar(fatos), "valor.minimo_1o")

    assert a.status == Status.CONFORME
    assert "260.000,00" in a.calculo
    assert "base do ITBI" in a.conclusao


def test_piso_2o_leilao_soma_divida_despesas_encargos():
    """art. 27, § 2º e § 3º, I a III."""
    fatos = FatosExtrajudicial(
        residencial=False,
        divida=240_000, despesas=8_000, encargos_imovel=12_000,
        lance=260_000, leilao_do_lance=2,
    )
    a = _achado(avaliar(fatos), "valor.piso_2o")

    assert a.status == Status.CONFORME
    assert "260.000,00" in a.calculo


def test_lance_abaixo_do_piso_mas_acima_de_metade_depende_do_credor():
    """art. 27, § 2º: a válvula dos 50% é faculdade do credor "a seu
    exclusivo critério" — não é direito do arrematante. Vender isso como
    garantia seria erro grave."""
    fatos = FatosExtrajudicial(
        residencial=False,
        divida=300_000, despesas=0, encargos_imovel=0,
        valor_avaliacao=400_000,
        lance=250_000, leilao_do_lance=2,  # < 300k, mas > 200k
    )
    a = _achado(avaliar(fatos), "valor.piso_2o")

    assert a.status == Status.ATENCAO
    assert "exclusivo critério" in a.conclusao.lower()
    assert "não é direito do arrematante" in a.conclusao
    assert a.trava_posse is False


def test_lance_abaixo_de_metade_da_avaliacao_e_nao_conforme():
    fatos = FatosExtrajudicial(
        residencial=False,
        divida=300_000, despesas=0, encargos_imovel=0,
        valor_avaliacao=400_000,
        lance=150_000, leilao_do_lance=2,
    )
    a = _achado(avaliar(fatos), "valor.piso_2o")

    assert a.status == Status.NAO_CONFORME
    assert a.gravidade == Gravidade.ALTA


def test_residencial_nao_tem_valvula_de_metade_da_avaliacao():
    """art. 26-A, § 3º não reproduz a válvula do art. 27, § 2º; e o § 4º
    manda extinguir a dívida se ninguém alcança o piso. Mesmo lance que
    seria "atenção" no regime geral é NÃO CONFORME aqui."""
    comum = dict(
        divida=300_000, despesas=0, encargos_imovel=0,
        valor_avaliacao=400_000, lance=250_000, leilao_do_lance=2,
    )
    geral = _achado(avaliar(FatosExtrajudicial(residencial=False, **comum)), "valor.piso_2o")
    resid = _achado(avaliar(FatosExtrajudicial(residencial=True, **comum)), "valor.piso_2o")

    assert geral.status == Status.ATENCAO
    assert resid.status == Status.NAO_CONFORME
    assert "26-A" in resid.base_legal
    assert "não existe a válvula" in resid.conclusao.lower() or "NÃO existe" in resid.conclusao


def test_piso_incompleto_e_tratado_como_limite_inferior():
    """Somar despesas ausentes como zero subestimaria o piso e poderia
    aprovar um lance irregular. O achado tem de avisar."""
    fatos = FatosExtrajudicial(residencial=False, divida=240_000, lance=245_000, leilao_do_lance=2)
    a = _achado(avaliar(fatos), "valor.piso_2o")

    assert "incompleta" in a.calculo


def test_sem_divida_o_piso_nao_e_calculavel():
    fatos = FatosExtrajudicial(residencial=False, despesas=8_000, encargos_imovel=12_000)
    a = _achado(avaliar(fatos), "valor.piso_2o")

    assert a.status == Status.NAO_VERIFICAVEL
    assert "demonstrativo" in a.providencia.lower()


def test_preferencia_do_fiduciante_aberta_gera_atencao_nao_nulidade():
    """art. 27, § 2º-B: risco de perder o negócio, não de nulidade."""
    fatos = FatosExtrajudicial(data_2o_leilao=date(2026, 8, 20), hoje=date(2026, 8, 1))
    a = _achado(avaliar(fatos), "valor.preferencia")

    assert a.status == Status.ATENCAO
    assert "19 dia" in a.conclusao
    assert a.trava_posse is False


def test_preferencia_encerrada_apos_o_2o_leilao():
    fatos = FatosExtrajudicial(data_2o_leilao=date(2026, 6, 1), hoje=date(2026, 8, 1))
    assert _achado(avaliar(fatos), "valor.preferencia").status == Status.CONFORME


# ---------------------------------------------------------------------------
# Economia da posse
# ---------------------------------------------------------------------------

def test_taxa_de_ocupacao_conta_mes_ou_fracao():
    """art. 37-A: "por mês ou fração" — 6,2 meses conta como 7."""
    fatos = FatosExtrajudicial(
        valor_contratual_art24=250_000, meses_estimados_ate_imissao=7
    )
    a = _achado(avaliar(fatos), "posse.taxa_ocupacao")

    # 250.000 × 1% × 7 = 17.500
    assert "17.500,00" in a.calculo


def test_taxa_de_ocupacao_usa_o_maior_valor_do_art_24():
    fatos = FatosExtrajudicial(
        valor_contratual_art24=200_000,
        base_calculo_itbi=300_000,
        meses_estimados_ate_imissao=10,
    )
    a = _achado(avaliar(fatos), "posse.taxa_ocupacao")
    # usa 300.000 (piso do art. 24, § único): 300.000 × 1% × 10 = 30.000
    assert "30.000,00" in a.calculo


def test_imovel_ocupado_indica_liminar_do_art_30():
    a = _achado(avaliar(FatosExtrajudicial(imovel_ocupado=True)), "posse.desocupacao")
    assert a.status == Status.ATENCAO
    assert "60" in a.conclusao
    assert "liminar" in a.conclusao.lower()


def test_locacao_longa_sem_anuencia_e_ineficaz_contra_arrematante():
    """art. 37-B — vira notícia BOA para o arrematante."""
    fatos = FatosExtrajudicial(
        locacao_existente=True,
        locacao_prazo_superior_1_ano=True,
        locacao_anuencia_escrita_fiduciario=False,
    )
    a = _achado(avaliar(fatos), "posse.locacao")

    assert a.status == Status.CONFORME
    assert "INEFICAZ" in a.conclusao


def test_locacao_com_anuencia_atrasa_a_posse():
    fatos = FatosExtrajudicial(
        locacao_existente=True,
        locacao_prazo_superior_1_ano=True,
        locacao_anuencia_escrita_fiduciario=True,
    )
    a = _achado(avaliar(fatos), "posse.locacao")
    assert a.status == Status.ATENCAO


# ---------------------------------------------------------------------------
# Parecer consolidado
# ---------------------------------------------------------------------------

def test_recomendacao_nao_exige_vicio_que_trava_posse():
    """"Não recomendado" fica reservado a vício de notificação. Rebaixar por
    irregularidade de leilão inflaria o alarme e destruiria a credibilidade."""
    so_leilao = avaliar(
        FatosExtrajudicial(
            data_averbacao_consolidacao=date(2026, 1, 10),
            data_1o_leilao=date(2026, 5, 1),  # muito fora do prazo
        )
    )
    assert so_leilao.nao_conformes
    assert so_leilao.recomendacao == "cautela"  # não é "nao"


def test_caso_limpo_recomenda_participar():
    fatos = FatosExtrajudicial(
        residencial=False,
        intimacao_por_edital=False,
        data_intimacao_pessoal=date(2026, 1, 5),
        data_averbacao_consolidacao=date(2026, 1, 25),
        data_1o_leilao=date(2026, 2, 20),
        data_2o_leilao=date(2026, 3, 5),
        datas_comunicadas_ao_devedor=True,
        valor_contratual_art24=300_000,
        base_calculo_itbi=280_000,
        valor_avaliacao=300_000,
        divida=200_000, despesas=5_000, encargos_imovel=5_000,
        lance=215_000, leilao_do_lance=2,
        imovel_ocupado=False,
        locacao_existente=False,
        meses_estimados_ate_imissao=1,
        hoje=date(2026, 3, 10),
    )
    p = avaliar(fatos)

    assert p.recomendacao == "participar"
    assert p.bloqueantes == []
    assert p.cobertura == 1.0


def test_cobertura_reflete_o_que_falta():
    """Métrica que vai na cara do relatório: análise com metade dos
    documentos não pode parecer completa."""
    parcial = avaliar(
        FatosExtrajudicial(
            residencial=False,
            intimacao_por_edital=False,
            data_intimacao_pessoal=date(2026, 1, 5),
            data_averbacao_consolidacao=date(2026, 1, 25),
        )
    )
    assert 0.0 < parcial.cobertura < 1.0


def test_todos_os_achados_tem_base_legal():
    """Nenhum item do relatório pode aparecer sem dispositivo. É a regra que
    separa parecer de opinião."""
    p = avaliar(FatosExtrajudicial())
    for a in p.achados:
        assert a.base_legal, f"{a.id} sem base legal"
        assert "9.514" in a.base_legal


def test_ids_dos_achados_sao_unicos_e_estaveis():
    p = avaliar(FatosExtrajudicial())
    ids = [a.id for a in p.achados]
    assert len(ids) == len(set(ids))


@pytest.mark.parametrize(
    "campo,valor",
    [
        ("residencial", True),
        ("imovel_ocupado", True),
        ("locacao_existente", True),
        ("intimacao_por_edital", True),
    ],
)
def test_avaliar_nunca_lanca_excecao_com_entrada_parcial(campo, valor):
    """Robustez: o motor roda com qualquer subconjunto de fatos. Em
    produção os documentos chegam incompletos — é a regra, não a exceção."""
    p = avaliar(FatosExtrajudicial(**{campo: valor}))
    assert len(p.achados) == 12
