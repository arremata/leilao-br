"""Fatos da ficha da Caixa que cabem no card do catálogo.

A Caixa publica a ocupação ("Situação: Ocupado/Desocupado") e as formas de
pagamento ("Recursos próprios. Permite utilização de FGTS...") como texto livre
na página do imóvel. O catálogo só mostrava esses textos no detalhe; aqui eles
viram três fatos estáveis que a lista consegue exibir e filtrar.

`vercel-backend/index.py` mantém uma cópia destas regras (o serviço é
implantado sozinho); `tests/test_listing_facts.py` confere que as duas batem.
"""

from __future__ import annotations

import unicodedata


def _normalized(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(ch for ch in text if not unicodedata.combining(ch)).casefold().strip()


def occupancy_status(value: object) -> str:
    """`vacant` e `occupied` só quando a Caixa afirma; o resto é `unknown`."""
    text = _normalized(value)
    # "desocupado" contém "ocupado": a ordem importa.
    if "desocupad" in text:
        return "vacant"
    if "ocupad" in text:
        return "occupied"
    return "unknown"


def payment_options(value: object) -> dict[str, bool | None]:
    """FGTS e financiamento aceitos, ou None quando a Caixa não publicou a lista.

    A Caixa enumera o que é permitido ("Exclusivamente à vista", "Permite
    utilização de FGTS", "Permite financiamento - somente SBPE"). Com a lista
    publicada, o que não aparece nela não é aceito.
    """
    text = _normalized(value)
    if not text:
        return {"acceptsFgts": None, "acceptsFinancing": None}
    return {
        "acceptsFgts": "fgts" in text and "nao permite utilizacao de fgts" not in text,
        "acceptsFinancing": "permite financiamento" in text and "nao permite financiamento" not in text,
    }


def listing_facts(occupancy: object, payment_methods: object) -> dict[str, object]:
    return {"occupancy": occupancy_status(occupancy), **payment_options(payment_methods)}
