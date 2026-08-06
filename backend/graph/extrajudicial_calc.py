"""Motor determinístico da trilha EXTRAJUDICIAL (Lei 9.514/1997).

Nada aqui passa por LLM. O modelo de linguagem tem um único papel no
pipeline: extrair as ENTRADAS de documento, com citação de página e trecho
(ver `tools/doc_ingest.py`). O julgamento de conformidade é aritmética e
comparação de datas — e portanto é auditável, testável e não alucina.

Por que isso importa comercialmente: o cliente pode conferir cada número.
"Lance de R$ 253.345 contra piso de R$ 268.900 = R$ 15.555 abaixo do
referencial do art. 27, § 2º" é verificável com uma calculadora. Já
"risco médio" não é verificável por ninguém.

--------------------------------------------------------------------------
A ASSIMETRIA QUE ORGANIZA TODO O MÓDULO
--------------------------------------------------------------------------
Lei 9.514, art. 30, parágrafo único (red. Lei 14.711/2023):

    "Arrematado o imóvel [...] as ações judiciais que tenham por objeto
    controvérsias sobre as estipulações contratuais ou os requisitos
    procedimentais de cobrança e leilão, EXCETUADA A EXIGÊNCIA DE
    NOTIFICAÇÃO DO DEVEDOR [...] não obstarão a reintegração de posse
    [...] e serão resolvidas em perdas e danos."

Ou seja: quase todo vício do procedimento extrajudicial NÃO tira o imóvel
do arrematante — vira indenização entre devedor e credor. A exceção
escrita na lei é a notificação.

Daí o campo `trava_posse` em cada achado. Ele separa o que é risco real
de perder o bem do que é ruído que o mercado vende como se fosse risco.
Vender "análise de nulidade" em leilão extrajudicial sem essa distinção é
vender medo.

Contagem de prazos: DIAS CORRIDOS. Os prazos da Lei 9.514 são de direito
material, em procedimento extrajudicial — não incide a regra de dias úteis
do art. 219 do CPC, que é restrita a prazos processuais.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from typing import Optional

# --------------------------------------------------------------------------
# Prazos legais, com a fonte ao lado. Nenhum número mágico solto no código.
# --------------------------------------------------------------------------
PRAZO_PURGACAO_DIAS = 15          # art. 26, § 1º
PRAZO_CARENCIA_PADRAO_DIAS = 15   # art. 26, § 2º-A (se o contrato silencia)
PRAZO_EDITAL_PUBLICACAO_DIAS = 3  # art. 26, § 4º (mínimo de publicação)
PRAZO_ELETRONICO_ANTECEDENCIA = 15  # art. 26, § 4º-B (antes do edital)
PRAZO_CONSOLIDACAO_RESIDENCIAL = 30  # art. 26-A, § 1º
PRAZO_PRIMEIRO_LEILAO_DIAS = 60   # art. 27, caput
PRAZO_SEGUNDO_LEILAO_DIAS = 15    # art. 27, § 1º
PRAZO_ENTREGA_SOBRA_DIAS = 5      # art. 27, § 4º
PRAZO_DENUNCIA_LOCACAO_DIAS = 90  # art. 27, § 7º (prazo para denunciar)
PRAZO_DESOCUPACAO_LOCACAO_DIAS = 30  # art. 27, § 7º
PRAZO_DESOCUPACAO_LIMINAR_DIAS = 60  # art. 30, caput
TAXA_OCUPACAO_MENSAL = 0.01       # art. 37-A (1% ao mês ou fração)
PERCENTUAL_VALVULA_CREDOR = 0.50  # art. 27, § 2º (metade da avaliação)


class Status(str, Enum):
    CONFORME = "conforme"
    NAO_CONFORME = "nao_conforme"
    ATENCAO = "atencao"
    # Entrada ausente. NUNCA se presume conformidade — a lacuna é declarada.
    NAO_VERIFICAVEL = "nao_verificavel"
    NAO_APLICAVEL = "nao_aplicavel"


class Gravidade(str, Enum):
    NENHUMA = "nenhuma"
    BAIXA = "baixa"
    MEDIA = "media"
    ALTA = "alta"
    CRITICA = "critica"


@dataclass
class Achado:
    """Um item verificado, com a conta à mostra.

    `calculo` existe para ser lido pelo cliente. É a diferença entre
    "risco médio" e "faltam R$ 15.555 para o piso legal".
    """

    id: str
    titulo: str
    status: Status
    base_legal: str
    conclusao: str
    calculo: str = ""
    gravidade: Gravidade = Gravidade.NENHUMA
    # art. 30, § único: só a notificação obsta a reintegração de posse.
    # Todo o resto se resolve em perdas e danos entre devedor e credor.
    trava_posse: bool = False
    # o que o usuário precisa obter para fechar um item NAO_VERIFICAVEL
    providencia: str = ""

    @property
    def bloqueante(self) -> bool:
        return self.status == Status.NAO_CONFORME and self.trava_posse


@dataclass
class FatosExtrajudicial:
    """Entradas extraídas dos documentos, cada uma opcional.

    `None` significa "não consta nos documentos analisados" — e produz
    `NAO_VERIFICAVEL`, não uma suposição otimista. É essa disciplina que
    permite ao relatório dizer com precisão o que não sabe.
    """

    # --- regime ---
    # art. 26-A: financiamento para aquisição/construção de residência do
    # devedor. Muda prazo de consolidação e elimina a válvula dos 50%.
    residencial: Optional[bool] = None

    # --- notificação / purgação (art. 26) ---
    data_intimacao_pessoal: Optional[date] = None
    intimacao_por_edital: Optional[bool] = None
    data_ultima_publicacao_edital: Optional[date] = None
    dias_publicacao_edital: Optional[int] = None
    certidao_local_ignorado: Optional[bool] = None  # § 4º
    contrato_tem_contato_eletronico: Optional[bool] = None  # § 4º-B
    data_envio_intimacao_eletronica: Optional[date] = None
    data_averbacao_consolidacao: Optional[date] = None  # § 7º

    # --- leilões (art. 27) ---
    data_1o_leilao: Optional[date] = None
    data_2o_leilao: Optional[date] = None
    datas_comunicadas_ao_devedor: Optional[bool] = None  # § 2º-A

    # --- valores ---
    valor_contratual_art24: Optional[float] = None  # art. 24, VI
    base_calculo_itbi: Optional[float] = None       # art. 24, § único
    valor_avaliacao: Optional[float] = None
    divida: Optional[float] = None                   # art. 27, § 3º, I
    despesas: Optional[float] = None                 # art. 27, § 3º, II
    encargos_imovel: Optional[float] = None          # art. 27, § 3º, III
    lance: Optional[float] = None
    leilao_do_lance: Optional[int] = None            # 1 ou 2

    # --- ocupação ---
    imovel_ocupado: Optional[bool] = None
    locacao_existente: Optional[bool] = None
    locacao_prazo_superior_1_ano: Optional[bool] = None  # art. 37-B
    locacao_anuencia_escrita_fiduciario: Optional[bool] = None
    data_denuncia_locacao: Optional[date] = None
    meses_estimados_ate_imissao: Optional[int] = None

    # data de referência da análise (para prazos ainda em curso)
    hoje: Optional[date] = None


@dataclass
class Parecer:
    achados: list[Achado] = field(default_factory=list)

    @property
    def bloqueantes(self) -> list[Achado]:
        """Itens que efetivamente impedem/travam a posse."""
        return [a for a in self.achados if a.bloqueante]

    @property
    def nao_conformes(self) -> list[Achado]:
        return [a for a in self.achados if a.status == Status.NAO_CONFORME]

    @property
    def lacunas(self) -> list[Achado]:
        return [a for a in self.achados if a.status == Status.NAO_VERIFICAVEL]

    @property
    def cobertura(self) -> float:
        """Fração de itens aplicáveis que foi possível verificar.

        Métrica honesta de qualidade da análise: cobertura de 40% significa
        que 60% dos itens dependem de documento não obtido. Isso vai na
        cara do relatório, não no rodapé.
        """
        aplicaveis = [a for a in self.achados if a.status != Status.NAO_APLICAVEL]
        if not aplicaveis:
            return 0.0
        verificados = [a for a in aplicaveis if a.status != Status.NAO_VERIFICAVEL]
        return len(verificados) / len(aplicaveis)

    @property
    def recomendacao(self) -> str:
        """Derivada, não opinada."""
        if self.bloqueantes:
            return "nao"
        if self.nao_conformes or self.lacunas:
            return "cautela"
        return "participar"


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _brl(v: float) -> str:
    s = f"{v:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"R$ {s}"


def _dias(a: date, b: date) -> int:
    """Dias corridos de `a` até `b` (negativo se b < a)."""
    return (b - a).days


def _na(id: str, titulo: str, base: str, motivo: str) -> Achado:
    return Achado(id=id, titulo=titulo, status=Status.NAO_APLICAVEL,
                  base_legal=base, conclusao=motivo)


def _falta(id: str, titulo: str, base: str, falta: str, providencia: str,
           gravidade: Gravidade = Gravidade.MEDIA, trava: bool = False) -> Achado:
    return Achado(
        id=id, titulo=titulo, status=Status.NAO_VERIFICAVEL, base_legal=base,
        conclusao=f"Não consta nos documentos analisados: {falta}.",
        gravidade=gravidade, trava_posse=trava, providencia=providencia,
    )


# --------------------------------------------------------------------------
# Checagens — notificação (o único grupo que trava a posse)
# --------------------------------------------------------------------------

def _check_purgacao(f: FatosExtrajudicial) -> Achado:
    """Prazo de 15 dias para purgar, contado corretamente conforme a via."""
    base = "Lei 9.514/97, art. 26, §§ 1º e 4º"
    titulo = "Prazo de purgação da mora (15 dias)"

    if f.intimacao_por_edital:
        marco = f.data_ultima_publicacao_edital
        origem = "última publicação do edital (art. 26, § 4º)"
    else:
        marco = f.data_intimacao_pessoal
        origem = "intimação pessoal (art. 26, § 1º)"

    if marco is None or f.data_averbacao_consolidacao is None:
        return _falta(
            "purgacao.prazo", titulo, base,
            "data da intimação e/ou da averbação da consolidação",
            "Certidão do procedimento no Registro de Imóveis (requerimento, "
            "AR/certidão de diligência e certidão de decurso de prazo do art. 26, § 7º).",
            gravidade=Gravidade.ALTA, trava=True,
        )

    decorridos = _dias(marco, f.data_averbacao_consolidacao)
    calculo = (
        f"{marco.strftime('%d/%m/%Y')} ({origem}) → "
        f"{f.data_averbacao_consolidacao.strftime('%d/%m/%Y')} (averbação) = "
        f"{decorridos} dias corridos · mínimo legal {PRAZO_PURGACAO_DIAS}"
    )

    if decorridos < PRAZO_PURGACAO_DIAS:
        return Achado(
            "purgacao.prazo", titulo, Status.NAO_CONFORME, base,
            f"Consolidação averbada {PRAZO_PURGACAO_DIAS - decorridos} dia(s) antes de "
            f"expirar o prazo de purgação. O devedor foi privado de prazo legal — "
            f"vício na notificação, que é a única matéria capaz de obstar a "
            f"reintegração de posse (art. 30, § único).",
            calculo, Gravidade.CRITICA, trava_posse=True,
        )

    return Achado(
        "purgacao.prazo", titulo, Status.CONFORME, base,
        "Prazo de purgação respeitado antes da consolidação.", calculo,
        Gravidade.NENHUMA, trava_posse=True,
    )


def _check_via_intimacao(f: FatosExtrajudicial) -> Achado:
    """Edital só é lícito nas hipóteses do § 4º — e há um pré-requisito
    eletrônico frequentemente ignorado no § 4º-B."""
    base = "Lei 9.514/97, art. 26, §§ 3º, 4º, 4º-B e 4º-C"
    titulo = "Via da intimação (pessoal x edital)"

    if f.intimacao_por_edital is None:
        return _falta(
            "purgacao.via", titulo, base, "a via utilizada para intimar o devedor",
            "Certidão do procedimento no RI indicando se houve intimação pessoal, "
            "por RTD, por correio com AR ou por edital.",
            gravidade=Gravidade.ALTA, trava=True,
        )

    if not f.intimacao_por_edital:
        return Achado(
            "purgacao.via", titulo, Status.CONFORME, base,
            "Intimação pessoal — via regra do art. 26, § 3º.", "",
            Gravidade.NENHUMA, trava_posse=True,
        )

    # Intimação por edital: exige certidão de local ignorado/incerto/inacessível
    problemas: list[str] = []
    if f.certidao_local_ignorado is False:
        problemas.append(
            "edital utilizado sem certidão de local ignorado, incerto ou inacessível (§ 4º)"
        )
    if (
        f.contrato_tem_contato_eletronico
        and f.data_envio_intimacao_eletronica is None
    ):
        problemas.append(
            "contrato previa contato eletrônico e não consta o envio eletrônico prévio, "
            "que o § 4º-B qualifica como imprescindível"
        )
    if (
        f.contrato_tem_contato_eletronico
        and f.data_envio_intimacao_eletronica
        and f.data_ultima_publicacao_edital
    ):
        antec = _dias(f.data_envio_intimacao_eletronica, f.data_ultima_publicacao_edital)
        if antec < PRAZO_ELETRONICO_ANTECEDENCIA:
            problemas.append(
                f"envio eletrônico com {antec} dias de antecedência do edital "
                f"(§ 4º-B exige no mínimo {PRAZO_ELETRONICO_ANTECEDENCIA})"
            )

    if (
        f.dias_publicacao_edital is not None
        and f.dias_publicacao_edital < PRAZO_EDITAL_PUBLICACAO_DIAS
    ):
        problemas.append(
            f"edital publicado por {f.dias_publicacao_edital} dia(s); "
            f"§ 4º exige no mínimo {PRAZO_EDITAL_PUBLICACAO_DIAS}"
        )

    if problemas:
        return Achado(
            "purgacao.via", titulo, Status.NAO_CONFORME, base,
            "Intimação por edital com irregularidade: " + "; ".join(problemas) + ".",
            "", Gravidade.CRITICA, trava_posse=True,
        )

    if f.certidao_local_ignorado is None:
        return _falta(
            "purgacao.via", titulo, base,
            "certidão do serventuário atestando local ignorado, incerto ou inacessível",
            "Certidão de diligência do oficial, exigida pelo art. 26, § 4º, como "
            "pressuposto do uso de edital.",
            gravidade=Gravidade.ALTA, trava=True,
        )

    return Achado(
        "purgacao.via", titulo, Status.ATENCAO, base,
        "Intimação por edital com pressupostos aparentemente atendidos. Via "
        "excepcional — é o ponto mais atacado do procedimento extrajudicial.",
        "", Gravidade.MEDIA, trava_posse=True,
    )


def _check_consolidacao_residencial(f: FatosExtrajudicial) -> Achado:
    """Regime do art. 26-A dá 30 dias extra antes da averbação."""
    base = "Lei 9.514/97, art. 26-A, §§ 1º e 2º"
    titulo = "Janela extra de purgação em imóvel residencial (30 dias)"

    if f.residencial is None:
        return _falta(
            "consolidacao.residencial", titulo, base,
            "se o financiamento é para aquisição/construção de residência do devedor",
            "Contrato de alienação fiduciária registrado (finalidade do financiamento).",
            gravidade=Gravidade.ALTA, trava=True,
        )

    if not f.residencial:
        return _na("consolidacao.residencial", titulo, base,
                   "Não é financiamento residencial do devedor — art. 26-A não incide.")

    marco = (
        f.data_ultima_publicacao_edital if f.intimacao_por_edital else f.data_intimacao_pessoal
    )
    if marco is None or f.data_averbacao_consolidacao is None:
        return _falta(
            "consolidacao.residencial", titulo, base,
            "datas da intimação e da averbação da consolidação",
            "Certidão do procedimento no RI + matrícula com a data da averbação.",
            gravidade=Gravidade.ALTA, trava=True,
        )

    minimo = PRAZO_PURGACAO_DIAS + PRAZO_CONSOLIDACAO_RESIDENCIAL
    decorridos = _dias(marco, f.data_averbacao_consolidacao)
    calculo = (
        f"{decorridos} dias corridos da intimação até a averbação · "
        f"mínimo {minimo} ({PRAZO_PURGACAO_DIAS} de purgação + "
        f"{PRAZO_CONSOLIDACAO_RESIDENCIAL} do art. 26-A, § 1º)"
    )

    if decorridos < minimo:
        return Achado(
            "consolidacao.residencial", titulo, Status.NAO_CONFORME, base,
            f"Averbação {minimo - decorridos} dia(s) precoce. Em imóvel residencial a "
            f"consolidação só pode ser averbada 30 dias após expirar o prazo de "
            f"purgação, e até a averbação o devedor podia pagar e fazer o contrato "
            f"convalescer (§ 2º).",
            calculo, Gravidade.CRITICA, trava_posse=True,
        )

    return Achado(
        "consolidacao.residencial", titulo, Status.CONFORME, base,
        "Janela de 30 dias do art. 26-A respeitada.", calculo,
        Gravidade.NENHUMA, trava_posse=True,
    )


# --------------------------------------------------------------------------
# Checagens — prazos dos leilões (NÃO travam a posse: art. 30, § único)
# --------------------------------------------------------------------------

def _check_prazo_1o_leilao(f: FatosExtrajudicial) -> Achado:
    base = "Lei 9.514/97, art. 27, caput"
    titulo = "1º leilão dentro de 60 dias da consolidação"

    if f.data_averbacao_consolidacao is None or f.data_1o_leilao is None:
        return _falta(
            "leilao.prazo_1o", titulo, base,
            "data da averbação da consolidação e/ou do 1º leilão",
            "Matrícula (data da averbação) e edital/ata do 1º leilão.",
            gravidade=Gravidade.BAIXA,
        )

    decorridos = _dias(f.data_averbacao_consolidacao, f.data_1o_leilao)
    calculo = (
        f"{f.data_averbacao_consolidacao.strftime('%d/%m/%Y')} → "
        f"{f.data_1o_leilao.strftime('%d/%m/%Y')} = {decorridos} dias corridos · "
        f"limite {PRAZO_PRIMEIRO_LEILAO_DIAS}"
    )

    if decorridos > PRAZO_PRIMEIRO_LEILAO_DIAS:
        return Achado(
            "leilao.prazo_1o", titulo, Status.NAO_CONFORME, base,
            f"1º leilão realizado {decorridos - PRAZO_PRIMEIRO_LEILAO_DIAS} dia(s) "
            f"além do prazo legal. Irregularidade procedimental — pelo art. 30, "
            f"§ único, resolve-se em perdas e danos e NÃO obsta a posse do "
            f"arrematante.",
            calculo, Gravidade.BAIXA,
        )

    return Achado("leilao.prazo_1o", titulo, Status.CONFORME, base,
                  "Prazo de 60 dias respeitado.", calculo)


def _check_prazo_2o_leilao(f: FatosExtrajudicial) -> Achado:
    base = "Lei 9.514/97, art. 27, § 1º"
    titulo = "2º leilão nos 15 dias seguintes ao 1º"

    if f.data_1o_leilao is None or f.data_2o_leilao is None:
        return _falta(
            "leilao.prazo_2o", titulo, base, "datas do 1º e do 2º leilão",
            "Editais/atas dos dois leilões.", gravidade=Gravidade.BAIXA,
        )

    intervalo = _dias(f.data_1o_leilao, f.data_2o_leilao)
    calculo = f"intervalo de {intervalo} dias corridos · limite {PRAZO_SEGUNDO_LEILAO_DIAS}"

    if intervalo < 0:
        return Achado("leilao.prazo_2o", titulo, Status.NAO_CONFORME, base,
                      "2º leilão datado antes do 1º — inconsistência documental.",
                      calculo, Gravidade.MEDIA)
    if intervalo > PRAZO_SEGUNDO_LEILAO_DIAS:
        return Achado(
            "leilao.prazo_2o", titulo, Status.NAO_CONFORME, base,
            f"2º leilão {intervalo - PRAZO_SEGUNDO_LEILAO_DIAS} dia(s) além dos 15 "
            f"dias. Irregularidade procedimental — perdas e danos, não obsta a posse "
            f"(art. 30, § único).",
            calculo, Gravidade.BAIXA,
        )

    return Achado("leilao.prazo_2o", titulo, Status.CONFORME, base,
                  "Intervalo de 15 dias respeitado.", calculo)


# --------------------------------------------------------------------------
# Checagens — valores
# --------------------------------------------------------------------------

def _valor_minimo_1o_leilao(f: FatosExtrajudicial) -> Optional[float]:
    """art. 24, VI + § único: valor contratual, com piso na base do ITBI."""
    if f.valor_contratual_art24 is None and f.base_calculo_itbi is None:
        return None
    candidatos = [v for v in (f.valor_contratual_art24, f.base_calculo_itbi) if v is not None]
    return max(candidatos)


def _check_valor_1o_leilao(f: FatosExtrajudicial) -> Achado:
    base = "Lei 9.514/97, art. 24, VI e parágrafo único; art. 27, § 1º"
    titulo = "Valor mínimo do 1º leilão"

    minimo = _valor_minimo_1o_leilao(f)
    if minimo is None:
        return _falta(
            "valor.minimo_1o", titulo, base,
            "valor do imóvel convencionado no contrato (art. 24, VI) e base de cálculo do ITBI",
            "Contrato de AF registrado + guia/base de cálculo do ITBI recolhido na consolidação.",
            gravidade=Gravidade.MEDIA,
        )

    if (
        f.valor_contratual_art24 is not None
        and f.base_calculo_itbi is not None
        and f.base_calculo_itbi > f.valor_contratual_art24
    ):
        calculo = (
            f"contratual {_brl(f.valor_contratual_art24)} < base ITBI "
            f"{_brl(f.base_calculo_itbi)} → mínimo legal = {_brl(minimo)}"
        )
        conclusao = (
            "O valor contratual é inferior à base do ITBI, então o mínimo do 1º "
            "leilão é a base do ITBI (art. 24, § único) — não o valor do contrato."
        )
    else:
        calculo = f"mínimo do 1º leilão = {_brl(minimo)}"
        conclusao = "Valor mínimo do 1º leilão identificado."

    return Achado("valor.minimo_1o", titulo, Status.CONFORME, base, conclusao, calculo)


def _piso_2o_leilao(f: FatosExtrajudicial) -> Optional[float]:
    """art. 27, § 2º / art. 26-A, § 3º: dívida + despesas + encargos."""
    partes = (f.divida, f.despesas, f.encargos_imovel)
    if all(p is None for p in partes):
        return None
    # Somar com None tratado como ausência é perigoso: subestima o piso.
    # Exigimos ao menos a dívida, e sinalizamos incompletude no achado.
    if f.divida is None:
        return None
    return f.divida + (f.despesas or 0.0) + (f.encargos_imovel or 0.0)


def _check_piso_2o_leilao(f: FatosExtrajudicial) -> Achado:
    residencial = bool(f.residencial)
    base = (
        "Lei 9.514/97, art. 26-A, § 3º" if residencial else "Lei 9.514/97, art. 27, § 2º"
    )
    titulo = "Piso do 2º leilão (referencial mínimo para arrematação)"

    piso = _piso_2o_leilao(f)
    if piso is None:
        return _falta(
            "valor.piso_2o", titulo, base,
            "demonstrativo da dívida, das despesas e dos encargos na data do leilão",
            "Demonstrativo do credor fiduciário (art. 27, § 3º, I a III). Sem ele o "
            "piso legal do 2º leilão não é calculável.",
            gravidade=Gravidade.ALTA,
        )

    incompleto = f.despesas is None or f.encargos_imovel is None
    composicao = f"dívida {_brl(f.divida)}"
    if f.despesas is not None:
        composicao += f" + despesas {_brl(f.despesas)}"
    if f.encargos_imovel is not None:
        composicao += f" + encargos {_brl(f.encargos_imovel)}"
    calculo = f"{composicao} = piso {_brl(piso)}"
    if incompleto:
        calculo += " (composição incompleta — piso real é maior ou igual a este)"

    if f.lance is None or f.leilao_do_lance != 2:
        status = Status.ATENCAO if incompleto else Status.CONFORME
        return Achado(
            "valor.piso_2o", titulo, status, base,
            "Piso do 2º leilão calculado."
            + (" Composição incompleta: trate como limite inferior." if incompleto else ""),
            calculo, Gravidade.BAIXA if incompleto else Gravidade.NENHUMA,
        )

    calculo += f" · lance {_brl(f.lance)}"

    if f.lance >= piso:
        return Achado("valor.piso_2o", titulo, Status.CONFORME, base,
                      "Lance atinge o referencial mínimo legal.", calculo)

    diferenca = piso - f.lance

    if residencial:
        # art. 26-A, § 3º não tem a válvula dos 50%; e o § 4º manda extinguir
        # a dívida se ninguém alcança o piso. Arrematar abaixo é anômalo.
        return Achado(
            "valor.piso_2o", titulo, Status.NAO_CONFORME, base,
            f"Lance {_brl(diferenca)} abaixo do referencial mínimo em regime "
            f"residencial, onde NÃO existe a válvula de 'metade da avaliação' do "
            f"art. 27, § 2º. Pelo art. 26-A, § 4º, não havendo lance que atinja o "
            f"piso, a dívida se extingue — arrematação abaixo dele é anômala e "
            f"atacável.",
            calculo, Gravidade.ALTA,
        )

    # Regime geral: o credor PODE aceitar >= 50% da avaliação, a exclusivo critério
    if f.valor_avaliacao:
        meia = f.valor_avaliacao * PERCENTUAL_VALVULA_CREDOR
        calculo += f" · 50% da avaliação {_brl(meia)}"
        if f.lance >= meia:
            return Achado(
                "valor.piso_2o", titulo, Status.ATENCAO, base,
                f"Lance abaixo do referencial mínimo ({_brl(diferenca)} a menos), mas "
                f"acima de metade da avaliação. O art. 27, § 2º permite ao credor "
                f"aceitar, a seu EXCLUSIVO critério — não é direito do arrematante. "
                f"Confirmar a aceitação formal do credor antes de contar com a "
                f"adjudicação.",
                calculo, Gravidade.MEDIA,
            )
        return Achado(
            "valor.piso_2o", titulo, Status.NAO_CONFORME, base,
            f"Lance abaixo do referencial mínimo E abaixo de metade da avaliação — "
            f"fora de qualquer patamar admitido pelo art. 27, § 2º.",
            calculo, Gravidade.ALTA,
        )

    return _falta(
        "valor.piso_2o", titulo, base,
        "valor de avaliação, necessário para testar a válvula dos 50% do art. 27, § 2º",
        "Laudo/valor de avaliação usado pelo credor.", gravidade=Gravidade.MEDIA,
    )


def _check_preferencia_fiduciante(f: FatosExtrajudicial) -> Achado:
    """§ 2º-B: risco de PERDER O NEGÓCIO, não de nulidade. Distinção que
    o mercado costuma errar."""
    base = "Lei 9.514/97, art. 27, § 2º-B"
    titulo = "Direito de preferência do fiduciante"

    if f.data_2o_leilao is None:
        return _falta(
            "valor.preferencia", titulo, base, "data do 2º leilão",
            "Edital do 2º leilão.", gravidade=Gravidade.BAIXA,
        )

    hoje = f.hoje or date.today()
    if hoje < f.data_2o_leilao:
        restam = _dias(hoje, f.data_2o_leilao)
        return Achado(
            "valor.preferencia", titulo, Status.ATENCAO, base,
            f"Janela de preferência do fiduciante ABERTA por mais {restam} dia(s). "
            f"Até a data do 2º leilão ele pode adquirir o imóvel pelo valor da "
            f"dívida e despesas. Isso não gera nulidade — gera risco de o negócio "
            f"não se concretizar depois de custos de análise e deslocamento.",
            f"hoje {hoje.strftime('%d/%m/%Y')} → 2º leilão "
            f"{f.data_2o_leilao.strftime('%d/%m/%Y')}",
            Gravidade.BAIXA,
        )

    return Achado("valor.preferencia", titulo, Status.CONFORME, base,
                  "Janela de preferência do art. 27, § 2º-B encerrada.", "")


# --------------------------------------------------------------------------
# Checagens — economia da posse
# --------------------------------------------------------------------------

def _check_taxa_ocupacao(f: FatosExtrajudicial) -> Achado:
    """art. 37-A: 1% ao mês OU FRAÇÃO — crédito do arrematante, raramente
    contabilizado pelo mercado."""
    base = "Lei 9.514/97, art. 37-A"
    titulo = "Taxa de ocupação a favor do arrematante (1%/mês)"

    valor_ref = _valor_minimo_1o_leilao(f)
    if valor_ref is None or f.meses_estimados_ate_imissao is None:
        return _falta(
            "posse.taxa_ocupacao", titulo, base,
            "valor do art. 24 e/ou prazo estimado até a imissão na posse",
            "Contrato de AF registrado (valor do art. 24, VI) + estimativa de prazo "
            "da reintegração na comarca.",
            gravidade=Gravidade.BAIXA,
        )

    meses = max(1, math.ceil(f.meses_estimados_ate_imissao))
    total = valor_ref * TAXA_OCUPACAO_MENSAL * meses
    return Achado(
        "posse.taxa_ocupacao", titulo, Status.CONFORME, base,
        "O arrematante, como sucessor, tem crédito de taxa de ocupação contra o "
        "fiduciante desde a consolidação até a imissão na posse. Compensa "
        "parcialmente o custo da desocupação — e quase nunca entra na conta do "
        "mercado.",
        f"{_brl(valor_ref)} × 1% × {meses} mês(es) = {_brl(total)}",
        Gravidade.NENHUMA,
    )


def _check_desocupacao(f: FatosExtrajudicial) -> Achado:
    base = "Lei 9.514/97, art. 30"
    titulo = "Reintegração de posse (liminar, 60 dias)"

    if f.imovel_ocupado is None:
        return _falta(
            "posse.desocupacao", titulo, base, "situação de ocupação do imóvel",
            "Vistoria/constatação no local. O edital costuma declarar, mas não supre "
            "verificação de fato.",
            gravidade=Gravidade.MEDIA,
        )

    if not f.imovel_ocupado:
        return Achado("posse.desocupacao", titulo, Status.CONFORME, base,
                      "Imóvel desocupado — sem custo de imissão na posse.", "")

    return Achado(
        "posse.desocupacao", titulo, Status.ATENCAO, base,
        f"Imóvel ocupado. O arrematante tem legitimidade PRÓPRIA para pedir "
        f"reintegração, concedida liminarmente, com {PRAZO_DESOCUPACAO_LIMINAR_DIAS} "
        f"dias para desocupação. É a diferença mais relevante em relação ao leilão "
        f"judicial: aqui a lei dá liminar ao adquirente.",
        "", Gravidade.MEDIA,
    )


def _check_locacao(f: FatosExtrajudicial) -> Achado:
    base = "Lei 9.514/97, art. 27, § 7º; art. 37-B"
    titulo = "Locação vigente sobre o imóvel"

    if f.locacao_existente is None:
        return _falta(
            "posse.locacao", titulo, base, "existência de locação sobre o imóvel",
            "Vistoria + matrícula (averbação de locação, se houver) + declaração do credor.",
            gravidade=Gravidade.BAIXA,
        )

    if not f.locacao_existente:
        return Achado("posse.locacao", titulo, Status.CONFORME, base,
                      "Sem locação vigente identificada.", "")

    if (
        f.locacao_prazo_superior_1_ano
        and f.locacao_anuencia_escrita_fiduciario is False
    ):
        return Achado(
            "posse.locacao", titulo, Status.CONFORME, base,
            "Locação superior a 1 ano sem anuência escrita do fiduciário é INEFICAZ "
            "perante o fiduciário e seus sucessores (art. 37-B) — não se opõe ao "
            "arrematante.",
            "", Gravidade.BAIXA,
        )

    return Achado(
        "posse.locacao", titulo, Status.ATENCAO, base,
        f"Locação vigente. A denúncia deve ocorrer em até "
        f"{PRAZO_DENUNCIA_LOCACAO_DIAS} dias da consolidação, com "
        f"{PRAZO_DESOCUPACAO_LOCACAO_DIAS} dias para desocupar, e exige cláusula "
        f"contratual destacada (art. 27, § 7º). Perdido o prazo de denúncia, a "
        f"locação tende a se manter — atrasa a posse.",
        "", Gravidade.MEDIA,
    )


def _check_comunicacao_datas(f: FatosExtrajudicial) -> Achado:
    base = "Lei 9.514/97, art. 27, § 2º-A"
    titulo = "Comunicação das datas dos leilões ao devedor"

    if f.datas_comunicadas_ao_devedor is None:
        return _falta(
            "leilao.comunicacao", titulo, base,
            "comprovação de comunicação das datas, horários e locais ao devedor",
            "Comprovantes de correspondência do credor (inclusive endereço eletrônico).",
            gravidade=Gravidade.BAIXA,
        )

    if f.datas_comunicadas_ao_devedor:
        return Achado("leilao.comunicacao", titulo, Status.CONFORME, base,
                      "Datas comunicadas ao devedor.", "")

    return Achado(
        "leilao.comunicacao", titulo, Status.NAO_CONFORME, base,
        "Datas não comunicadas ao devedor. É requisito procedimental do leilão — "
        "pelo art. 30, § único resolve-se em perdas e danos e NÃO obsta a posse do "
        "arrematante. Não confundir com a notificação da mora, que é a exceção legal.",
        "", Gravidade.BAIXA,
    )


# --------------------------------------------------------------------------
# Orquestração
# --------------------------------------------------------------------------

_CHECKS = (
    # notificação — o grupo que trava a posse
    _check_via_intimacao,
    _check_purgacao,
    _check_consolidacao_residencial,
    # leilão
    _check_prazo_1o_leilao,
    _check_prazo_2o_leilao,
    _check_comunicacao_datas,
    # valores
    _check_valor_1o_leilao,
    _check_piso_2o_leilao,
    _check_preferencia_fiduciante,
    # posse
    _check_desocupacao,
    _check_locacao,
    _check_taxa_ocupacao,
)


def avaliar(fatos: FatosExtrajudicial) -> Parecer:
    """Roda todas as checagens determinísticas da trilha extrajudicial.

    A ordem dos achados é estável e agrupada por tema — o relatório
    depende disso para renderizar sempre igual.
    """
    return Parecer(achados=[check(fatos) for check in _CHECKS])
