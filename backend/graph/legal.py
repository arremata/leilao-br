"""Nó jurídico: análise ramificada por modalidade com guardrails anti-alucinação.

Segue as práticas do guia Anthropic de sumarização jurídica:
- saída estruturada validada (Pydantic) com retry em falha de schema;
- meta-sumarização para editais longos (chunks -> consolidação), sem truncamento;
- citações literais do edital em cada achado (campo `fonte`);
- estados de verificação anti-alucinação: verificado / nao-localizado / requer-humano.
"""

import json
from dataclasses import fields as _dc_fields

import litellm
from loguru import logger
from pydantic import ValidationError

from config import get_settings
from graph.contracts import LegalDetail
from graph.state import AuctionState, LegalResult

# Editais acima deste tamanho passam por meta-sumarização antes da análise final.
CHUNK_THRESHOLD = 24_000
CHUNK_SIZE = 20_000

LEGAL_SYSTEM_PROMPT = """Você é um analista jurídico especializado em leilões de imóveis no Brasil \
(leilão judicial — CPC arts. 879–903; leilão extrajudicial de alienação fiduciária — Lei 9.514/97; \
e venda direta de bem retomado). Sua tarefa é analisar o edital e os metadados do imóvel e produzir \
uma avaliação de viabilidade jurídica ESTRUTURADA, em português do Brasil.

REGRAS ANTI-ALUCINAÇÃO (obrigatórias):
1. Só afirme o que está EXPLÍCITO nos documentos fornecidos. Para cada achado, informe o estado de verificação:
   - "verificado": consta literalmente no documento — cite o trecho no campo `fonte`.
   - "nao-localizado": a informação não aparece nos documentos disponíveis. NUNCA chute um valor.
   - "requer-humano": só verificável com diligência externa (autos, certidão do RI, síndico).
2. O campo `fonte` de cada risco deve conter o trecho literal (ou paráfrase mínima) do edital que o sustenta,
   ou a justificativa da não-localização.
3. Campos monetários sem informação explícita devem ser null — nunca estime.
4. Metadados do imóvel (endereço, preços) vêm do anúncio; o texto entre <edital></edital> é a fonte primária.
   Em divergência, aponte em `edital_analise.divergencias`.

ANÁLISE RAMIFICADA POR MODALIDADE — identifique primeiro a modalidade e aplique o checklist correspondente:
- "judicial" (CPC): completude do edital (arts. 886/887 — datas de praças, valores, ônus); intimações
  obrigatórias (art. 889 — executado, cônjuge, credores — normalmente `requer-humano`, exige autos);
  preço vil (art. 891 — lance mínimo abaixo de 50% da avaliação é anulável; calcule a razão);
  averbação da penhora (art. 844); riscos de invalidação (art. 903) e bem de família (Lei 8.009/90).
- "extrajudicial" (Lei 9.514/97): regularidade da notificação e purgação da mora (art. 26 — normalmente
  `requer-humano`); consolidação da propriedade averbada; leilões do art. 27; imissão na posse (art. 30).
- "venda-direta": não há nulidade processual nem intimações — foco em matrícula, ônus, ocupação e débitos.

DÉBITOS — regras de ouro:
- Tributos (IPTU): sub-rogam-se no preço (art. 130, § único, CTN; STJ, repetitivo Tema 1.134, out/2024),
  ainda que o edital atribua ao arrematante — cláusula em contrário é questionável; aponte quando ocorrer.
- Condomínio: obrigação propter rem — acompanha o imóvel; verifique se o edital limita a responsabilidade.

DESOCUPAÇÃO: extraia prazo e responsabilidade do edital. Se houver custo estimável explícito, informe;
caso contrário `eviction_cost_estimate` = null.

FORMATO DE SAÍDA — retorne APENAS um objeto JSON (sem markdown) com os campos exatos:
{
  "registration_status": string,
  "liens": [string],
  "judicial_disputes": [string],
  "tax_debts_iptu": string,
  "tax_debts_itbi": string,
  "condominium_debts": string,
  "federal_state_debts": string,
  "zoning_compliance": string,
  "construction_permits": string,
  "occupation_status": string,  // "desocupado" | "ocupado" | "disputado" + detalhe
  "usufruct_rights": string,
  "risk_level": "low" | "medium" | "high" | "critical",
  "risk_details": string,
  "raw_findings": string,       // resumo das fontes usadas
  "modalidade": "judicial" | "extrajudicial" | "venda-direta",
  "eviction_deadline": string,          // "" se não localizado
  "eviction_cost_estimate": number|null,
  "detail": {
    "modalidade": "judicial" | "extrajudicial" | "venda-direta",
    "modalidade_label": string,   // ex.: "Leilão judicial eletrônico"
    "base_legal": string,         // dispositivos aplicáveis à modalidade
    "conclusao": { "recomendacao": "sim"|"cautela"|"nao", "principal_risco": string, "providencia": string },
    "processo": { "tipo": string, "numero": string, "foro": string, "fase": string, "link": string|null },
    "partes": { "credor": string, "devedor": string, "observacao": string },
    "divida": { "valor": number|null, "data_atualizacao": string, "memoria_calculo": string, "impugnacao": string },
    "matricula": { "numero": string, "cartorio": string, "proprietario": string, "titularidade": string,
                   "onus": [{ "tipo": string, "descricao": string, "gravidade": "info"|"warn"|"bad" }] },
    "edital_analise": { "data_publicacao": string, "antecedencia": string, "valor_avaliacao": number|null,
                        "lance_minimo": number|null, "debitos": string, "desocupacao": string,
                        "divergencias": [string] },
    "avaliacao": { "data": string, "valor": number|null, "avaliador": string, "vistoria": string,
                   "atualidade": string, "impugnacao": string },
    "riscos": [{ "tipo": string, "nivel": "baixo"|"medio"|"alto",
                 "verificacao": "verificado"|"nao-localizado"|"requer-humano", "fonte": string }],
    "verificacoes": [{ "item": string, "estado": "verificado"|"nao-localizado"|"requer-humano",
                       "fonte": string, "nota": string }],
    "documentos": [{ "tipo": string, "nome": string, "origem": string, "url": string|null, "data": string|null,
                     "status": "baixado"|"parcial"|"nao-disponivel", "baseou": string }]
  }
}

Diretrizes de risk_level:
- low: título limpo, sem débitos, sem disputas, desocupado
- medium: débitos menores (IPTU), sem disputa judicial, exige papelada
- high: débitos relevantes, ações pendentes ou imóvel ocupado
- critical: múltiplos ônus, litígio ativo, posseiros ou documentação irregular

EXEMPLO (few-shot compacto — trecho de edital judicial e saída parcial esperada):
Trecho: "1ª Praça: 10/08/2026 — lance mínimo igual à avaliação (R$ 200.000,00). 2ª Praça: 20/08/2026 —
lance mínimo de 50% da avaliação. O imóvel encontra-se ocupado pelo executado. Consta penhora nos autos
1234-56.2025.8.26.0100. Eventuais débitos de IPTU correrão por conta do arrematante."
Saída parcial esperada:
- modalidade: "judicial"; lance 2ª praça em exatamente 50% → risco de preço vil "baixo" mas no limite
  (fonte: "lance mínimo de 50% da avaliação"); ocupação "ocupado" verificado (fonte: "encontra-se ocupado
  pelo executado"); penhora verificada com número do processo; cláusula de IPTU ao arrematante apontada em
  edital_analise.debitos como questionável (sub-rogação no preço, STJ 2024); intimações do art. 889 →
  "requer-humano" (não constam do trecho)."""

CHUNK_SYSTEM_PROMPT = """Você é um analista jurídico de leilões de imóveis no Brasil. Este é o trecho \
{part} de {total} de um edital longo. Extraia APENAS os fatos juridicamente relevantes que constam \
LITERALMENTE neste trecho, citando as frases-fonte: modalidade e base legal; datas e valores de praças/avaliação; \
ônus, penhoras, gravames e processos; débitos (IPTU, condomínio, dívida ativa) e quem os assume; \
ocupação e regras de desocupação (prazo/custo); matrícula e cartório; partes (credor/devedor); \
condições de pagamento; divergências ou cláusulas atípicas. \
Responda em português, em tópicos curtos "FATO — fonte: 'trecho literal'". \
Se o trecho não contém fatos jurídicos, responda "SEM FATOS JURÍDICOS NESTE TRECHO"."""


def _chunk_text(text: str, size: int = CHUNK_SIZE) -> list[str]:
    """Divide o texto em chunks de ~`size` chars, quebrando em fim de parágrafo quando possível."""
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            # tenta quebrar no último parágrafo/linha dentro do chunk
            cut = text.rfind("\n", start + size // 2, end)
            if cut > start:
                end = cut
        chunks.append(text[start:end])
        start = end
    return chunks


def _summarize_chunk(chunk: str, part: int, total: int) -> str:
    """Extrai fatos jurídicos de um chunk do edital (etapa 1 da meta-sumarização)."""
    settings = get_settings()
    response = litellm.completion(
        model=settings.legal_model,
        api_key=settings.openrouter_api_key,
        api_base=settings.api_base,
        max_tokens=2048,
        messages=[
            {"role": "system", "content": CHUNK_SYSTEM_PROMPT.format(part=part, total=total)},
            {"role": "user", "content": chunk},
        ],
    )
    return response.choices[0].message.content or ""


def _prepare_edital_text(pdf_texts: str) -> str:
    """Devolve o texto integral (edital curto) ou a meta-sumarização (edital longo).

    Elimina o truncamento silencioso: nenhum conteúdo do edital é descartado
    sem passar por uma etapa de extração de fatos.
    """
    if len(pdf_texts) <= CHUNK_THRESHOLD:
        return pdf_texts

    chunks = _chunk_text(pdf_texts)
    logger.info(f"Legal agent: edital com {len(pdf_texts)} chars — meta-sumarização em {len(chunks)} chunks")
    summaries = []
    for i, chunk in enumerate(chunks, start=1):
        try:
            summaries.append(f"--- Fatos do trecho {i}/{len(chunks)} ---\n{_summarize_chunk(chunk, i, len(chunks))}")
        except Exception as e:  # noqa: BLE001 — um chunk com falha não pode derrubar a análise
            logger.warning(f"Legal agent: falha ao sumarizar chunk {i}: {e}")
            summaries.append(f"--- Trecho {i}/{len(chunks)}: falha na extração ---")
    return "\n\n".join(summaries)


def _call_legal_llm(metadata, pdf_texts: str, error_feedback: str | None = None) -> object:
    """Chama o modelo jurídico (configurável via LEGAL_MODEL) com saída JSON forçada."""
    settings = get_settings()

    def _get(attr):
        return getattr(metadata, attr, "") if hasattr(metadata, attr) else metadata.get(attr, "")

    property_info = (
        f"Imóvel: {_get('property_type')} em {_get('address')}\n"
        f"Matrícula: {_get('matricula') or 'N/A'}\n"
        f"Tipo de leilão (anúncio): {_get('auction_type') or 'N/A'}\n"
        f"Nº do processo (anúncio): {_get('process_number') or 'N/A'}\n"
        f"Preço do leilão: R$ {_get('auction_price')}\n"
        f"Avaliação (anúncio): R$ {_get('market_value_estimate') or 'N/A'}\n"
        f"Localização: {_get('neighborhood')}, {_get('city')} - {_get('state')}\n"
    )

    user_content = (
        f"Metadados do anúncio:\n{property_info}\n"
        f"<edital>\n{pdf_texts}\n</edital>"
    )
    if error_feedback:
        user_content += (
            "\n\nSua resposta anterior falhou na validação de schema com o erro abaixo. "
            "Corrija e devolva o JSON completo novamente:\n" + error_feedback
        )

    return litellm.completion(
        model=settings.legal_model,
        api_key=settings.openrouter_api_key,
        api_base=settings.api_base,
        max_tokens=8192,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": LEGAL_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
    )


def _strip_code_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        text = text.rsplit("```", 1)[0]
    return text.strip()


def _parse_and_validate(response_text: str) -> LegalResult:
    """Faz o parse do JSON e valida `detail` contra o contrato LegalDetail.

    Levanta ValueError com mensagem acionável (usada no retry) em falha.
    """
    parsed = json.loads(_strip_code_fences(response_text))
    if not isinstance(parsed, dict):
        raise ValueError("A resposta deve ser um objeto JSON")

    detail_raw = parsed.pop("detail", None)
    detail = None
    if detail_raw is not None:
        try:
            detail = LegalDetail.model_validate(detail_raw).model_dump()
        except ValidationError as e:
            raise ValueError(f"Campo 'detail' inválido: {e}") from e

    known = {f.name for f in _dc_fields(LegalResult)}
    filtered = {k: v for k, v in parsed.items() if k in known}
    # eviction_cost_estimate pode vir como string numérica — normaliza
    ece = filtered.get("eviction_cost_estimate")
    if isinstance(ece, str):
        try:
            filtered["eviction_cost_estimate"] = float(ece.replace(".", "").replace(",", "."))
        except ValueError:
            filtered["eviction_cost_estimate"] = None
    return LegalResult(detail=detail, **{k: v for k, v in filtered.items() if k != "detail"})


def legal_node(state: AuctionState) -> dict:
    """LangGraph node: avalia viabilidade jurídica e riscos do imóvel."""
    metadata = state.property_metadata if hasattr(state, "property_metadata") else state.get("property_metadata")
    pdf_texts = state.pdf_texts if hasattr(state, "pdf_texts") else state.get("pdf_texts", "")

    if not metadata:
        logger.warning("Legal agent: no property metadata available")
        return {
            "legal_result": LegalResult(risk_level="unknown", risk_details="Sem metadados do imóvel para análise"),
            "errors": ["No property metadata for legal analysis"],
        }

    logger.info(f"Legal agent: analisando {getattr(metadata, 'address', 'unknown property')}")

    edital_text = _prepare_edital_text(pdf_texts or "")

    legal_result = None
    error_feedback = None
    response_text = ""
    for attempt in range(2):  # 1 tentativa + 1 retry com feedback do erro de schema
        response = _call_legal_llm(metadata, edital_text, error_feedback)
        response_text = response.choices[0].message.content or ""
        try:
            legal_result = _parse_and_validate(response_text)
            break
        except (json.JSONDecodeError, ValueError, TypeError) as e:
            logger.warning(f"Legal agent: falha de parse/validação (tentativa {attempt + 1}): {e}")
            error_feedback = str(e)[:2000]

    if legal_result is None:
        # "unknown" (e não "critical"): incerteza de parsing não é risco jurídico
        # confirmado — evita falso negativo no scoring.
        logger.error("Legal agent: resposta inválida após retry")
        legal_result = LegalResult(
            risk_level="unknown",
            risk_details=f"Parse error: resposta do modelo não validou após retry. Último erro: {error_feedback}",
            raw_findings=response_text,
        )

    logger.info(
        f"Legal agent: risk_level={legal_result.risk_level}, modalidade={legal_result.modalidade or 'n/d'}, "
        f"detail={'ok' if legal_result.detail else 'ausente'}"
    )

    return {"legal_result": legal_result}
