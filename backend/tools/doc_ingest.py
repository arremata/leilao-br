"""Ingestão de documentos com paginação preservada e citação verificável.

Substitui `tools/pdf_parser.py`, que concatenava as páginas sem marcador
(`text += page.get_text()`) e por isso destruía a paginação — tornando
impossível citar "página N" em qualquer afirmação do agente jurídico.

Aqui cada documento carrega:
  - `doc_id` estável e `sha256` do arquivo (versiona a análise: se o edital
    for republicado, o hash muda e a análise é invalidada)
  - páginas individuais com offsets de caractere no texto completo
  - flag de OCR por página (OCR é menos confiável e a UI deve dizer isso)
  - tipo de documento inferido (edital, matrícula, termo de penhora, ...)

E expõe `locate()`, que responde: este trecho existe neste documento? Em
qual página, em qual intervalo de caracteres? É a função que sustenta a
regra dura do agente — sem trecho localizável, não há afirmação.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF
from loguru import logger

# Abaixo deste número de caracteres por página, presume-se página-imagem
# e tenta-se OCR. Editais escaneados de comarca pequena são comuns.
_MIN_CHARS_PER_PAGE = 40


# ---------------------------------------------------------------------------
# Normalização e localização de trechos
# ---------------------------------------------------------------------------

def _normalize(text: str) -> tuple[str, list[int]]:
    """Normaliza texto para busca tolerante, mantendo mapa para offsets originais.

    Texto extraído de PDF é sujo de formas que quebram comparação literal
    ingênua: hifenização de fim de linha, espaços múltiplos, quebras no meio
    de frase, acentos compostos vs. pré-compostos, soft hyphen invisível.

    Um LLM que cita um trecho quase sempre normaliza espaços ao transcrever.
    Se exigirmos igualdade byte a byte, a validação rejeita citações corretas
    e o agente vira inútil. Se normalizarmos sem guardar o mapa, perdemos o
    `char_range` que aponta o trecho no documento original.

    Retorna `(texto_normalizado, mapa)` onde `mapa[i]` é o offset, no texto
    original, do caractere que virou `texto_normalizado[i]`.
    """
    out: list[str] = []
    index: list[int] = []

    # Remove hifenização de fim de linha: "arremata-\nção" -> "arrematação".
    # Feito sobre o original com substituição por espaço-zero para não
    # desalinhar o mapa: tratamos o hífen+quebra como caracteres a ignorar.
    i = 0
    n = len(text)
    prev_was_space = True  # evita espaço inicial

    while i < n:
        ch = text[i]

        # hífen (comum ou soft) seguido de quebra de linha => juntar palavra
        if ch in "-­‐‑" and i + 1 < n:
            j = i + 1
            while j < n and text[j] in " \t\r":
                j += 1
            if j < n and text[j] == "\n":
                j += 1
                while j < n and text[j] in " \t\r":
                    j += 1
                i = j
                continue

        # soft hyphen isolado é invisível: descartar
        if ch == "­":
            i += 1
            continue

        if ch.isspace():
            if not prev_was_space:
                out.append(" ")
                index.append(i)
                prev_was_space = True
            i += 1
            continue

        # decompõe e descarta marcas de acento; casefold para comparação
        decomposed = unicodedata.normalize("NFKD", ch)
        folded = "".join(c for c in decomposed if not unicodedata.combining(c))
        folded = folded.casefold()

        if folded:
            # um caractere original pode gerar N normalizados (ex.: "ﬁ" -> "fi").
            # Todos apontam para o mesmo offset original: é o que queremos,
            # porque o intervalo devolvido cobre o caractere de origem.
            for c in folded:
                out.append(c)
                index.append(i)
            prev_was_space = False

        i += 1

    # remove espaço final
    while out and out[-1] == " ":
        out.pop()
        index.pop()

    return "".join(out), index


@dataclass
class Match:
    """Um trecho localizado dentro de um documento.

    `pagina_fim` difere de `pagina` quando a citação atravessa a virada de
    página — o que acontece de verdade em edital e matrícula. Rejeitar
    esses casos perderia citações legítimas; rotular só a primeira página
    seria impreciso. Reportamos o intervalo e a UI diz "p. 4-5".
    """

    pagina: int
    char_start: int
    char_end: int
    trecho_original: str
    exato: bool  # True se casou sem normalização (igualdade literal)
    pagina_fim: int = 0

    def __post_init__(self):
        if not self.pagina_fim:
            self.pagina_fim = self.pagina

    @property
    def atravessa_paginas(self) -> bool:
        return self.pagina_fim > self.pagina

    @property
    def ref_pagina(self) -> str:
        """Referência legível: "p. 4" ou "p. 4-5"."""
        return f"p. {self.pagina}" if not self.atravessa_paginas else f"p. {self.pagina}-{self.pagina_fim}"


@dataclass
class Page:
    n: int  # 1-indexado, como o usuário conta páginas
    text: str
    char_start: int  # offset no full_text do documento
    char_end: int
    ocr: bool = False

    @property
    def vazia(self) -> bool:
        return len(self.text.strip()) < _MIN_CHARS_PER_PAGE


@dataclass
class Document:
    doc_id: str
    arquivo: str
    sha256: str
    n_paginas: int
    pages: list[Page]
    full_text: str
    doc_tipo: str = "indefinido"
    bytes: int = 0
    paginas_ocr: list[int] = field(default_factory=list)
    # cache de normalização — construído sob demanda
    _norm: Optional[tuple[str, list[int]]] = field(default=None, repr=False)

    @property
    def tem_texto(self) -> bool:
        return len(self.full_text.strip()) >= _MIN_CHARS_PER_PAGE

    @property
    def cobertura_texto(self) -> float:
        """Fração de páginas com texto aproveitável.

        Cobertura baixa é informação de produto: significa que a análise
        viu pouco do documento e os itens devem refletir isso.
        """
        if not self.pages:
            return 0.0
        return sum(0 if p.vazia else 1 for p in self.pages) / len(self.pages)

    def pagina_do_offset(self, offset: int) -> int:
        for p in self.pages:
            if p.char_start <= offset < p.char_end:
                return p.n
        return self.pages[-1].n if self.pages else 0

    def _normalized(self) -> tuple[str, list[int]]:
        if self._norm is None:
            self._norm = _normalize(self.full_text)
        return self._norm

    def locate(self, trecho: str, min_chars: int = 12) -> Optional[Match]:
        """Localiza `trecho` no documento. Retorna None se não existir.

        Esta é a função que dá ou nega o direito de afirmar. Um item do
        agente jurídico com `status: verificado` cuja citação retorna None
        aqui é rebaixado para `nao_localizado` — sem exceção e sem confiar
        na palavra do modelo.

        `min_chars` evita que trechos curtos ("art. 5") casem por acidente.
        """
        if not trecho or len(trecho.strip()) < min_chars:
            return None

        # 1) tentativa literal — mais forte, dispensa normalização
        pos = self.full_text.find(trecho)
        if pos != -1:
            end = pos + len(trecho)
            return Match(
                pagina=self.pagina_do_offset(pos),
                pagina_fim=self.pagina_do_offset(max(pos, end - 1)),
                char_start=pos,
                char_end=end,
                trecho_original=self.full_text[pos:end],
                exato=True,
            )

        # 2) tentativa normalizada
        hay, index = self._normalized()
        needle, _ = _normalize(trecho)
        if len(needle) < min_chars:
            return None

        npos = hay.find(needle)
        if npos == -1:
            return None

        start = index[npos]
        last = index[min(npos + len(needle) - 1, len(index) - 1)]
        end = last + 1

        return Match(
            pagina=self.pagina_do_offset(start),
            pagina_fim=self.pagina_do_offset(last),
            char_start=start,
            char_end=end,
            trecho_original=self.full_text[start:end],
            exato=False,
        )


# ---------------------------------------------------------------------------
# Classificação do tipo de documento
# ---------------------------------------------------------------------------

# Marcadores ESTRUTURAIS: identificam o que a peça É, não o que ela cita.
# Uma petição inicial fala de "termo de penhora" a torto e a direito; um
# acórdão cita "carta de arrematação". Classificar por menção produz falso
# positivo — erro observado ao rodar contra autos reais do escritório.
# Estes padrões vêm primeiro justamente por serem identitários.
_ESTRUTURAIS: list[tuple[str, str]] = [
    # cabeçalho de acórdão/decisão de tribunal
    ("acordao", r"\b(ag(?:int|rg)?\s+no\b|recurso\s+especial\s+n[ºo°]|embargos\s+de\s+diverg[eê]ncia)"),
    ("acordao", r"^\s*(relator[ao]?|ementa|ac[oó]rd[aã]o)\s*$"),
    ("acordao", r"\brelator[ao]?\s*:\s*(ministr|desembargador|juiz)"),
    # endereçamento de petição
    ("peticao", r"\b(excelent[ií]ssim|exmo\.?\s*sr|egr[eé]gio|colenda)\b"),
    ("peticao", r"\b(vem,?\s+respeitosamente|juiz\s+de\s+direito\s+d[ae]\b|vara\s+(c[ií]vel|dos\s+feitos))"),
    ("peticao", r"\b(requer|pede\s+deferimento|nestes\s+termos)\b.{0,80}\b(defer|justi[cç]a)"),
]

# Padrões de IDENTIDADE de documento: só valem se aparecerem em posição de
# TÍTULO — linha curta, isolada, nas primeiras linhas do documento.
_IDENTIDADE: list[tuple[str, str]] = [
    ("termo_penhora", r"\b(termo|auto)\s+de\s+penhora\b"),
    ("certidao_intimacao", r"\bcertid[aã]o\b.{0,40}\bintima[cç][aã]o\b"),
    ("carta_precatoria", r"\bcarta\s+precat[oó]ria\b"),
    ("carta_arrematacao", r"\bcarta\s+de\s+arremata[cç][aã]o\b"),
    ("auto_arrematacao", r"\bauto\s+de\s+arremata[cç][aã]o\b"),
    ("laudo_avaliacao", r"\blaudo\b.{0,30}\bavalia[cç][aã]o\b"),
    ("edital_leilao", r"\bedital\b.{0,60}\b(leil[aã]o|hasta|pra[cç]a|aliena[cç][aã]o)\b"),
    ("edital_intimacao", r"\bedital\b.{0,60}\bintima[cç][aã]o\b"),
    ("contrato_af", r"\b(instrumento|contrato)\b.{0,60}\baliena[cç][aã]o\s+fiduci[aá]ria\b"),
]

# Matrícula tem assinatura própria e inconfundível: cabeçalho de RI mais
# numeração de atos (R-1, Av-2, ...). Não depende de posição de título.
_MATRICULA_RI = re.compile(
    r"(registro\s+de\s+im[oó]veis|cart[oó]rio\s+de\s+registro|of[ií]cio\s+de\s+registro)",
    re.IGNORECASE,
)
_MATRICULA_ATOS = re.compile(r"\b(av|r)[-\.\s]?0?\d{1,3}[\s/-]", re.IGNORECASE)


def _title_lines(text: str, max_lines: int = 40) -> list[str]:
    """Primeiras linhas não vazias e curtas — onde vive o título de uma peça."""
    out = []
    for raw in text.split("\n"):
        line = raw.strip()
        if not line:
            continue
        out.append(line)
        if len(out) >= max_lines:
            break
    return out


def _classify(text: str) -> str:
    """Infere o tipo do documento. Determinístico, auditável, sem LLM.

    Estratégia em três passos, aprendida errando contra autos reais:

    1. Matrícula tem assinatura registral inconfundível — testa primeiro.
    2. Marcadores estruturais (endereçamento de petição, cabeçalho de
       acórdão) dizem o que a peça É.
    3. Só então padrões de identidade, e apenas em posição de TÍTULO —
       linha curta e isolada no início. Assim "termo de penhora" citado no
       corpo de uma petição não a transforma em termo de penhora.

    O tipo governa qual extrator roda depois, então errar aqui propaga
    erro para toda a análise. Quando não há sinal claro, devolve
    "indefinido" — e o pipeline trata isso como documento a inspecionar,
    não como documento qualquer.
    """
    head = text[:8000]
    lines = _title_lines(head)
    head_lines = "\n".join(lines)

    # 1) matrícula: cabeçalho de RI + numeração de atos registrais
    if _MATRICULA_RI.search(head) and len(_MATRICULA_ATOS.findall(head)) >= 2:
        return "matricula"

    # 2) estrutura da peça (o que ela é)
    for tipo, pat in _ESTRUTURAIS:
        if re.search(pat, head_lines, re.IGNORECASE | re.MULTILINE):
            return tipo

    # 3) identidade, só em posição de título
    for line in lines[:20]:
        if len(line) > 120:  # linha longa é corpo de texto, não título
            continue
        for tipo, pat in _IDENTIDADE:
            if re.search(pat, line, re.IGNORECASE):
                return tipo

    return "indefinido"


# ---------------------------------------------------------------------------
# Extração
# ---------------------------------------------------------------------------

def _ocr_page(page) -> str:
    try:
        import pytesseract
        from PIL import Image

        pix = page.get_pixmap(dpi=300)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        return pytesseract.image_to_string(img, lang="por")
    except Exception as e:  # pragma: no cover - depende do ambiente
        logger.warning(f"OCR falhou na página {page.number + 1}: {e}")
        return ""


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ingest_pdf(path: str | Path, *, ocr: bool = True, doc_id: str | None = None) -> Document:
    """Lê um PDF preservando a paginação e devolve um `Document` citável.

    `ocr=False` desliga o fallback — útil em testes e em varredura rápida
    de autos de centenas de páginas, onde OCR página a página é caro.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"PDF não encontrado: {path}")

    digest = _sha256(path)
    doc_id = doc_id or f"{path.stem[:40]}_{digest[:8]}"

    pages: list[Page] = []
    ocr_pages: list[int] = []
    buf: list[str] = []
    cursor = 0

    with fitz.open(path) as pdf:
        for idx, page in enumerate(pdf):
            text = page.get_text()
            used_ocr = False

            if ocr and len(text.strip()) < _MIN_CHARS_PER_PAGE:
                ocr_text = _ocr_page(page)
                if len(ocr_text.strip()) > len(text.strip()):
                    text = ocr_text
                    used_ocr = True
                    ocr_pages.append(idx + 1)

            # Garante quebra entre páginas e mantém a invariante exata
            # full_text[char_start:char_end] == page.text — sem isso o
            # char_range devolvido numa citação não é auditável.
            block = text if text.endswith("\n") else text + "\n"
            pages.append(
                Page(
                    n=idx + 1,
                    text=block,
                    char_start=cursor,
                    char_end=cursor + len(block),
                    ocr=used_ocr,
                )
            )
            buf.append(block)
            cursor += len(block)

    full_text = "".join(buf)
    doc = Document(
        doc_id=doc_id,
        arquivo=path.name,
        sha256=digest,
        n_paginas=len(pages),
        pages=pages,
        full_text=full_text,
        doc_tipo=_classify(full_text),
        bytes=path.stat().st_size,
        paginas_ocr=ocr_pages,
    )

    logger.info(
        f"Ingestão: {doc.arquivo} | {doc.n_paginas} págs | tipo={doc.doc_tipo} "
        f"| cobertura={doc.cobertura_texto:.0%} | ocr={len(ocr_pages)} págs"
    )
    return doc


def ingest_many(paths: list[str | Path], *, ocr: bool = True) -> list[Document]:
    """Ingere vários documentos. Cada um permanece separado — de propósito.

    O parser antigo concatenava tudo numa string única e depois cortava em
    8.000 caracteres, o que descartava em silêncio o segundo documento em
    diante. Aqui não há concatenação nem truncagem: quem consome decide o
    que enviar ao modelo, documento por documento.
    """
    docs: list[Document] = []
    for p in paths:
        try:
            docs.append(ingest_pdf(p, ocr=ocr))
        except Exception as e:
            logger.error(f"Falha ao ingerir {p}: {e}")
    return docs


def find_in_docs(docs: list[Document], trecho: str) -> Optional[tuple[Document, Match]]:
    """Procura um trecho no conjunto de documentos. Primeiro que casar vence."""
    for d in docs:
        m = d.locate(trecho)
        if m:
            return d, m
    return None
