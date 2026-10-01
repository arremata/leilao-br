"""Ocupação, FGTS e financiamento lidos da ficha da Caixa."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import pytest

from listing_facts import listing_facts, occupancy_status, payment_options


MODULE_PATH = Path(__file__).parents[2] / "vercel-backend" / "index.py"
SPEC = spec_from_file_location("vercel_listing_facts", MODULE_PATH)
vercel_api = module_from_spec(SPEC)
SPEC.loader.exec_module(vercel_api)

# Os quatro textos de pagamento e os três de ocupação que a Caixa publica hoje
# (levantamento dos 379 imóveis ativos em 30/09/2026), mais variações.
PAYMENT_CASES = [
    ("Recursos próprios. Permite utilização de FGTS. Consulte condições e enquadramento",
     True, False),
    ("Exclusivamente à vista (somente recursos próprios)", False, False),
    ("Recursos próprios. Permite financiamento - somente SBPE. Consulte condições antes de efetuar a proposta",
     False, True),
    ("Recursos próprios. Permite utilização de FGTS. Consulte condições e enquadramento. "
     "Permite financiamento - somente SBPE. Consulte condições antes de efetuar a proposta",
     True, True),
    ("Recursos próprios. Não permite utilização de FGTS.", False, False),
]
OCCUPANCY_CASES = [
    ("Ocupado", "occupied"),
    ("Desocupado", "vacant"),
    ("DESOCUPADO", "vacant"),
    ("Não informado", "unknown"),
    ("", "unknown"),
    (None, "unknown"),
]


@pytest.mark.parametrize("text,expected", OCCUPANCY_CASES)
def test_occupancy_only_asserts_what_caixa_states(text, expected):
    assert occupancy_status(text) == expected


@pytest.mark.parametrize("text,fgts,financing", PAYMENT_CASES)
def test_payment_options_follow_the_published_list(text, fgts, financing):
    assert payment_options(text) == {"acceptsFgts": fgts, "acceptsFinancing": financing}


def test_missing_payment_list_is_unknown_not_refused():
    assert payment_options(None) == {"acceptsFgts": None, "acceptsFinancing": None}
    assert payment_options("  ") == {"acceptsFgts": None, "acceptsFinancing": None}


@pytest.mark.parametrize("occupancy", [text for text, _ in OCCUPANCY_CASES])
@pytest.mark.parametrize("payment", [text for text, _, _ in PAYMENT_CASES] + [None])
def test_vercel_copy_matches_worker_rules(occupancy, payment):
    assert vercel_api._listing_facts(occupancy, payment) == listing_facts(occupancy, payment)


def test_vercel_catalog_card_reads_facts_from_list_columns_and_detail():
    base = {
        "id": 1, "source": "caixa", "uf": "PR", "city": "Curitiba", "address": "Rua A",
        "property_type": "Apartamento", "preco": 100000.0, "status": "active",
    }
    listed = vercel_api._catalog_card({
        **base,
        "edital_occupancy": "Desocupado",
        "edital_payment_methods": "Recursos próprios. Permite utilização de FGTS.",
    })
    assert listed["occupancy"] == "vacant"
    assert listed["acceptsFgts"] is True
    assert listed["acceptsFinancing"] is False

    detail = vercel_api._catalog_card(
        {**base, "edital_data": {"occupancy": "Ocupado"}}, include_edital_data=True,
    )
    assert detail["occupancy"] == "occupied"
    assert detail["acceptsFgts"] is None

    assert vercel_api._catalog_card(base)["occupancy"] == "unknown"
