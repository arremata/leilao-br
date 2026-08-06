"""Guardrails do chat do agente jurídico.

Este módulo NÃO gera respostas. Ele decide o que pode ser respondido, monta
o contexto mínimo autorizado e valida o que o modelo produziu antes de
qualquer coisa chegar à tela.

Ordem deliberada: o guardrail existe antes do gerador. Chat jurídico sem
validação funcionando é passivo, não ativo — todo print de conversa vira
prova documental contra quem opera o serviço.

--------------------------------------------------------------------------
PRINCÍPIO
--------------------------------------------------------------------------
O chat é leitor do parecer, não advogado. Ele pode:

  1. explicar um achado que o motor determinístico já calculou
  2. localizar um trecho nos documentos, com página (via doc_ingest.locate)
  3. recalcular cenários pelo mesmo motor determinístico

Pergunta que exija fato fora dessas três fontes tem uma resposta correta:
"não verifiquei — e é isto que seria preciso para verificar".

--------------------------------------------------------------------------
POR QUE A CLASSIFICAÇÃO É DETERMINÍSTICA
--------------------------------------------------------------------------
A detecção de pedido de conselho ("devo dar lance?") roda por padrão de
texto ANTES de qualquer chamada de LLM. Não se delega ao modelo a decisão
de recusar: um modelo persuadido responde; uma regex não.

O LLM entra depois, como camada adicional — suspensório, nunca cinto.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Sequence

from graph.extrajudicial_calc import Parecer, Status
from tools.doc_ingest import Document, find_in_docs


class Classe(str, Enum):
    EXPLICAR = "explicar"        # por que este item está assim
    LOCALIZAR = "localizar"      # onde está escrito
    CALCULAR = "calcular"        # e se o lance for X
    LACUNA = "lacuna"            # item não verificável — momento de diligência
    ACONSELHAR = "aconselhar"    # RECUSA — é consulta jurídica
    FORA_ESCOPO = "fora_escopo"  # RECUSA — assunto alheio
    OUTRO_IMOVEL = "outro_imovel"  # RECUSA — escopo é um imóvel


#: Classes que jamais chegam ao gerador.
RECUSAS = frozenset({Classe.ACONSELHAR, Classe.FORA_ESCOPO, Classe.OUTRO_IMOVEL})


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s).strip().lower()


# ---------------------------------------------------------------------------
# Padrões de recusa — avaliados primeiro, sempre
# ---------------------------------------------------------------------------

# Pedido de conselho. É consulta jurídica: recomendação personalizada sobre
# conduta. Não é o produto, e é o que expõe a OAB de quem opera.
_ACONSELHAR = [
    r"\b(devo|deveria|posso)\b.{0,30}\b(dar|fazer|ofertar|arrematar|comprar|lance|lancar|investir)",
    r"\bvale a pena\b",
    r"\bcompensa\b",
    r"\be um bom negocio\b",
    r"\bvoce (compraria|arremataria|investiria|faria)\b",
    r"\bo que voce (faria|acha|recomenda|sugere)\b",
    r"\bme (recomenda|aconselha|indica)\b",
    r"\bqual (o )?melhor (imovel|opcao|escolha)\b",
    r"\bposso confiar\b",
    r"\be seguro (comprar|arrematar|investir)\b",
    r"\barremato\?|\bdou o lance\?",
]

# Assunto alheio à análise jurídica do imóvel. Cuidado: ITBI, emolumentos e
# custo de desocupação ESTÃO no escopo — são custo do arrematante.
_FORA_ESCOPO = [
    r"\bfinanciament|\bemprestim|\bconsorcio\b|\bcredito imobiliario\b",
    r"\bimposto de renda\b|\bdeclaracao de ir\b|\bganho de capital\b",
    r"\b(qual|que) banco\b|\btaxa de juros\b|\bcdi\b|\bselic\b",
    r"\bcorretor\b|\bimobiliaria\b|\bcomo (vender|alugar|anunciar)\b",
    r"\breforma\b.{0,20}\b(quanto|custo|orcament)",
    r"\bonde (invisto|aplico)\b|\bmelhor investimento\b",
]

# Escopo é UM imóvel. Comparação e referência cruzada saem do contexto
# carregado e convidam o modelo a inventar.
_OUTRO_IMOVEL = [
    r"\b(outro|outros|aquele|aquela|os outros)\b.{0,20}\b(imovel|imoveis|apartamento|casa|lote|leilao)\b",
    r"\bcompara(r|ndo|cao)?\b.{0,25}\b(com|entre)\b.{0,25}\b(imovel|apartamento|casa|leilao)\b",
    r"\bqual (deles|dos dois|dos tres)\b",
]

_LOCALIZAR = [
    r"\bonde\b.{0,30}\b(diz|esta|consta|fala|escrito|aparece|menciona)\b",
    r"\bem que (pagina|documento|parte)\b",
    r"\bqual (documento|pagina)\b",
    r"\b(me )?(mostra|mostre|cita|cite|prova|comprova)\b",
    r"\bde onde (veio|saiu|tirou)\b",
    r"\bcade\b",
]

_CALCULAR = [
    r"\be se\b",
    r"\bcaso (eu|o lance)\b",
    r"\bsimul(a|e|ar)\b",
    r"\bcom (um )?lance de\b",
    r"\bquanto\b.{0,30}\b(fica|daria|custa|sobra|falta|total|pagar)\b",
    r"\bse eu (der|ofertar|pagar|lancar)\b",
]


def _bate(padroes: Sequence[str], texto: str) -> bool:
    return any(re.search(p, texto) for p in padroes)


def classificar(pergunta: str) -> Classe:
    """Classifica a intenção. Recusas têm precedência absoluta.

    A ordem não é estética: uma pergunta como "quanto vale a pena pagar?"
    contém padrão de cálculo E de conselho. Conselho vence — na dúvida,
    recusa-se e roteia-se ao escritório, que é o caminho seguro e, não por
    acaso, o que monetiza.
    """
    p = _norm(pergunta)

    if _bate(_ACONSELHAR, p):
        return Classe.ACONSELHAR
    if _bate(_OUTRO_IMOVEL, p):
        return Classe.OUTRO_IMOVEL
    if _bate(_FORA_ESCOPO, p):
        return Classe.FORA_ESCOPO
    if _bate(_LOCALIZAR, p):
        return Classe.LOCALIZAR
    if _bate(_CALCULAR, p):
        return Classe.CALCULAR
    return Classe.EXPLICAR


# ---------------------------------------------------------------------------
# Resolução pergunta → achados
# ---------------------------------------------------------------------------

_TERMOS: dict[str, tuple[str, ...]] = {
    "purgacao.via": ("intimacao", "notificacao", "notificado", "intimado", "edital", "citacao", "avisado"),
    "purgacao.prazo": ("purgacao", "purgar", "mora", "15 dias", "quitar a divida", "pagar a divida"),
    "consolidacao.residencial": ("consolidacao", "consolidado", "residencial", "moradia", "26-a", "30 dias"),
    "leilao.prazo_1o": ("primeiro leilao", "1o leilao", "60 dias", "prazo do leilao"),
    "leilao.prazo_2o": ("segundo leilao", "2o leilao", "15 dias entre"),
    "leilao.comunicacao": ("comunicacao", "comunicado", "avisou o devedor", "datas do leilao"),
    "valor.minimo_1o": ("valor minimo", "avaliacao", "itbi", "valor do imovel"),
    "valor.piso_2o": ("piso", "referencial minimo", "lance minimo", "divida", "quanto vale o lance"),
    "valor.preferencia": ("preferencia", "fiduciante", "devedor pode comprar", "recomprar"),
    "posse.desocupacao": ("desocupacao", "desocupar", "ocupado", "posse", "imissao", "reintegracao", "despejo", "morador"),
    "posse.locacao": ("locacao", "locatario", "inquilino", "alugado", "aluguel"),
    "posse.taxa_ocupacao": ("taxa de ocupacao", "1%", "37-a", "indenizacao pela ocupacao"),
}


def achados_relevantes(pergunta: str, parecer: Parecer) -> list:
    """Achados cujo tema aparece na pergunta.

    Vazio significa que o chat não sabe do que se trata — e responder "não
    identifiquei a que item você se refere" é melhor do que despejar o
    parecer inteiro e deixar o modelo escolher.
    """
    p = _norm(pergunta)
    ids = {aid for aid, termos in _TERMOS.items() if any(t in p for t in termos)}
    return [a for a in parecer.achados if a.id in ids]


@dataclass
class Contexto:
    """O que o gerador tem direito de ver. Nada além disto."""

    classe: Classe
    pergunta: str
    achados: list = field(default_factory=list)
    documentos: list[Document] = field(default_factory=list)
    permite_gerar: bool = True
    motivo_recusa: str = ""

    @property
    def ids_autorizados(self) -> set[str]:
        return {a.id for a in self.achados}


_MOTIVOS = {
    Classe.ACONSELHAR: (
        "Esta pergunta pede recomendação sobre o que fazer, o que é consulta "
        "jurídica e depende de análise de um advogado sobre o seu caso. Posso "
        "explicar o que foi verificado, mostrar onde está escrito nos documentos "
        "e refazer os cálculos com outro lance."
    ),
    Classe.FORA_ESCOPO: (
        "Esta pergunta está fora da análise jurídica deste imóvel. Aqui eu cubro "
        "regularidade do procedimento, prazos legais, valores mínimos e condições "
        "de posse."
    ),
    Classe.OUTRO_IMOVEL: (
        "Esta análise cobre apenas este imóvel. Para outro, abra a análise "
        "correspondente — assim cada resposta continua ancorada nos documentos "
        "certos."
    ),
}


def montar_contexto(
    pergunta: str,
    parecer: Parecer,
    documentos: Optional[list[Document]] = None,
) -> Contexto:
    """Monta o contexto mínimo que a classe autoriza.

    Contexto que não chega ao modelo não pode ser mal usado. Numa pergunta
    de localização ele recebe documentos; numa de explicação, achados. Nunca
    tudo, sempre.
    """
    classe = classificar(pergunta)

    if classe in RECUSAS:
        return Contexto(
            classe=classe, pergunta=pergunta,
            permite_gerar=False, motivo_recusa=_MOTIVOS[classe],
        )

    achados = achados_relevantes(pergunta, parecer)

    # LACUNA não é uma intenção do usuário — é uma propriedade da resposta.
    # Se o item perguntado não pôde ser verificado, o modo de resposta muda:
    # declara-se a lacuna e oferece-se a diligência que a fecha.
    if classe == Classe.EXPLICAR and achados:
        if all(a.status == Status.NAO_VERIFICAVEL for a in achados):
            classe = Classe.LACUNA

    docs = documentos or []
    return Contexto(
        classe=classe,
        pergunta=pergunta,
        achados=achados,
        # documentos só entram quando a pergunta é de localização
        documentos=docs if classe == Classe.LOCALIZAR else [],
    )


# ---------------------------------------------------------------------------
# Validação da resposta gerada
# ---------------------------------------------------------------------------

# O gerador referencia achados por id entre colchetes duplos: [[purgacao.via]].
# O renderizador injeta o texto canônico do achado — o modelo não reescreve
# conteúdo jurídico, apenas aponta para ele.
_REF = re.compile(r"\[\[([a-z0-9_.]+)\]\]")

# Trechos citados de documento vêm entre aspas curvas ou retas.
_CITACAO = re.compile(r"[\"“]([^\"”]{12,400})[\"”]")


@dataclass
class Validacao:
    texto_seguro: str
    ids_validos: list[str] = field(default_factory=list)
    ids_invalidos: list[str] = field(default_factory=list)
    citacoes_validas: list[tuple[str, str, int]] = field(default_factory=list)
    citacoes_rejeitadas: list[str] = field(default_factory=list)
    bloqueada: bool = False

    @property
    def limpa(self) -> bool:
        return not self.ids_invalidos and not self.citacoes_rejeitadas


def _sentencas(texto: str) -> list[str]:
    partes = re.split(r"(?<=[.!?])\s+", texto)
    return [p for p in partes if p.strip()]


def validar_resposta(
    texto: str,
    contexto: Contexto,
    documentos: Optional[list[Document]] = None,
) -> Validacao:
    """Valida antes de exibir. O que não se sustenta é REMOVIDO.

    Não sinalizado — removido. Resposta com aviso continua sendo resposta
    errada na tela, e é a errada que o cliente guarda em print.

    Duas checagens:
      - todo id referenciado tem de estar entre os achados autorizados
      - todo trecho entre aspas tem de existir nos documentos (locate)

    Se sobrar pouco, a resposta inteira é bloqueada e cai no fallback seguro.
    """
    docs = documentos if documentos is not None else contexto.documentos

    ids_validos: list[str] = []
    ids_invalidos: list[str] = []
    citacoes_validas: list[tuple[str, str, int]] = []
    citacoes_rejeitadas: list[str] = []

    sentencas_ok: list[str] = []

    for sent in _sentencas(texto):
        descartar = False

        for id_ in _REF.findall(sent):
            if id_ in contexto.ids_autorizados:
                ids_validos.append(id_)
            else:
                ids_invalidos.append(id_)
                descartar = True

        for trecho in _CITACAO.findall(sent):
            achado = find_in_docs(docs, trecho) if docs else None
            if achado:
                doc, match = achado
                citacoes_validas.append((trecho, doc.arquivo, match.pagina))
            else:
                citacoes_rejeitadas.append(trecho)
                descartar = True

        if not descartar:
            sentencas_ok.append(sent)

    texto_seguro = " ".join(sentencas_ok).strip()

    # Se a validação comeu a resposta, não se entrega um fragmento sem sentido.
    bloqueada = not texto_seguro or (
        len(sentencas_ok) < len(_sentencas(texto)) / 2 and bool(citacoes_rejeitadas or ids_invalidos)
    )

    return Validacao(
        texto_seguro="" if bloqueada else texto_seguro,
        ids_validos=ids_validos,
        ids_invalidos=ids_invalidos,
        citacoes_validas=citacoes_validas,
        citacoes_rejeitadas=citacoes_rejeitadas,
        bloqueada=bloqueada,
    )


FALLBACK_SEGURO = (
    "Não consigo responder isso com segurança a partir dos documentos que "
    "analisei. Posso mostrar o que foi verificado item a item, ou encaminhar "
    "sua dúvida ao escritório."
)


# ---------------------------------------------------------------------------
# Perguntas sugeridas — derivadas do parecer daquele imóvel
# ---------------------------------------------------------------------------

def perguntas_sugeridas(parecer: Parecer, max_itens: int = 4) -> list[str]:
    """Sugestões derivadas dos achados reais.

    Caixa de texto em branco convida "devo comprar?". Sugestão derivada
    conduz para o que é respondível — e a última pergunta é permanente e
    proposital: oferecer ao cliente "o que você não sabe?" comunica
    confiança que nenhum selo comunica.
    """
    sugestoes: list[str] = []

    if parecer.bloqueantes:
        sugestoes.append("Por que este leilão é desaconselhado?")
    elif parecer.nao_conformes:
        sugestoes.append("Quais irregularidades foram encontradas e o que elas significam?")

    if parecer.lacunas:
        sugestoes.append("O que falta para completar a análise?")

    for a in parecer.achados:
        if a.id == "posse.desocupacao" and a.status == Status.ATENCAO:
            sugestoes.append("Quanto tempo e quanto custa para desocupar o imóvel?")
        if a.id == "valor.piso_2o" and a.status in (Status.ATENCAO, Status.NAO_CONFORME):
            sugestoes.append("O meu lance atinge o valor mínimo exigido por lei?")

    sugestoes.append("O que este relatório NÃO verificou?")

    vistos: set[str] = set()
    unicas = [s for s in sugestoes if not (s in vistos or vistos.add(s))]
    return unicas[:max_itens]


# ---------------------------------------------------------------------------
# Log de auditoria
# ---------------------------------------------------------------------------

@dataclass
class RegistroAuditoria:
    """Toda resposta é registrada com sua base.

    Se o cliente arrematar, perder o imóvel e apresentar o print da conversa,
    é isto que documenta o que foi dito e com base em quê.
    """

    imovel_id: str
    pergunta: str
    classe: str
    respondida: bool
    achados_usados: list[str] = field(default_factory=list)
    citacoes: list[str] = field(default_factory=list)
    documentos_sha256: list[str] = field(default_factory=list)
    cobertura: float = 0.0


def registrar(
    imovel_id: str,
    contexto: Contexto,
    validacao: Optional[Validacao],
    parecer: Parecer,
    documentos: Optional[list[Document]] = None,
) -> RegistroAuditoria:
    return RegistroAuditoria(
        imovel_id=imovel_id,
        pergunta=contexto.pergunta,
        classe=contexto.classe.value,
        respondida=bool(validacao and not validacao.bloqueada),
        achados_usados=sorted(set(validacao.ids_validos)) if validacao else [],
        citacoes=[c[0] for c in validacao.citacoes_validas] if validacao else [],
        documentos_sha256=[d.sha256 for d in (documentos or [])],
        cobertura=parecer.cobertura,
    )


def encaminhar_ao_escritorio(
    imovel_id: str, contexto: Contexto, parecer: Parecer
) -> dict:
    """Payload de escalonamento com contexto — não um 'fale conosco' genérico.

    O advogado abre já sabendo o imóvel, a dúvida, o que falta e por quê.
    Reduzir o custo de atendimento é o que decide se o premium fecha a conta.
    """
    return {
        "imovel_id": imovel_id,
        "pergunta": contexto.pergunta,
        "classe": contexto.classe.value,
        "achados_relacionados": sorted(contexto.ids_autorizados),
        "documentos_faltantes": sorted(
            {a.providencia for a in parecer.lacunas if a.providencia}
        ),
        "cobertura_atual": parecer.cobertura,
        "recomendacao_atual": parecer.recomendacao,
    }
