# Output Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the HTML report output with a validated Pydantic `AuctionPropertyResult` JSON contract that matches the frontend's property card shape.

**Architecture:** Add a `scoring_node` (computes score, risk flags, ROI) and an `output_node` (maps state → `AuctionPropertyResult` JSON) between the parallel agents and END. Delete the reporter node and HTML report pipeline. Update `AuctionState` and workflow graph accordingly.

**Tech Stack:** Python 3.13, Pydantic v2, LangGraph, Pytest

---

## Task 1: Create `graph/contracts.py` with Pydantic models

**Files:**
- Create: `graph/contracts.py`
- Test: `tests/test_contracts.py`

- [ ] **Step 1: Write the failing test for RiskFlags**

```python
# tests/test_contracts.py
import pytest
from pydantic import ValidationError


def test_risk_flags_accepts_valid_values():
    from graph.contracts import RiskFlags

    flags = RiskFlags(j="good", f="warn", l="bad", o="good")
    assert flags.j == "good"
    assert flags.f == "warn"
    assert flags.l == "bad"
    assert flags.o == "good"


def test_risk_flags_rejects_invalid_values():
    from graph.contracts import RiskFlags

    with pytest.raises(ValidationError):
        RiskFlags(j="excellent", f="warn", l="bad", o="good")


def test_auction_property_result_has_all_fields():
    from graph.contracts import AuctionPropertyResult, RiskFlags

    result = AuctionPropertyResult(
        id="abc123",
        score=87,
        photo_label="APTO · VILA MADALENA · SP",
        title="Apto. 78 m², Rua Harmonia",
        address="R. Harmonia, 412",
        type="Apartamento",
        neighborhood="Vila Madalena",
        city="São Paulo, SP",
        auction_type="1ª praça",
        auctioneer="Zukerman Leilões",
        court="7ª Vara Cível SP",
        discount=42.0,
        min_bid=312000.0,
        market=540000.0,
        roi=38.0,
        area=78.0,
        beds=2,
        baths=2,
        parking=1,
        floor="7º",
        ends_at="2026-05-15T14:30:00",
        occupancy="desocupado",
        risk=RiskFlags(j="good", f="good", l="warn", o="good"),
    )
    assert result.score == 87
    assert result.risk.j == "good"
    assert result.beds == 2


def test_auction_property_result_optional_fields_can_be_none():
    from graph.contracts import AuctionPropertyResult, RiskFlags

    result = AuctionPropertyResult(
        id="abc123",
        score=50,
        photo_label="TERRENO · ALPHAVILLE · SP",
        title="Terreno 600 m², Quadra 12",
        address="Al. Tocantins, Q12 L8",
        type="Terreno",
        neighborhood="Alphaville",
        city="Barueri, SP",
        auction_type="Judicial",
        auctioneer="Biasi Leilões",
        court="1ª Vara Cível Barueri",
        discount=29.0,
        min_bid=580000.0,
        market=820000.0,
        roi=12.0,
        area=600.0,
        beds=None,
        baths=None,
        parking=None,
        floor=None,
        ends_at="2026-05-18T00:00:00",
        occupancy="disputado",
        risk=RiskFlags(j="bad", f="warn", l="warn", o="bad"),
    )
    assert result.beds is None
    assert result.floor is None


def test_auction_property_result_serializes_to_json():
    from graph.contracts import AuctionPropertyResult, RiskFlags

    result = AuctionPropertyResult(
        id="abc123",
        score=87,
        photo_label="APTO · VILA MADALENA · SP",
        title="Apto. 78 m², Rua Harmonia",
        address="R. Harmonia, 412",
        type="Apartamento",
        neighborhood="Vila Madalena",
        city="São Paulo, SP",
        auction_type="1ª praça",
        auctioneer="Zukerman Leilões",
        court="—",
        discount=42.0,
        min_bid=312000.0,
        market=540000.0,
        roi=38.0,
        area=78.0,
        beds=None,
        baths=None,
        parking=None,
        floor=None,
        ends_at="2026-05-15T14:30:00",
        occupancy="desocupado",
        risk=RiskFlags(j="good", f="good", l="warn", o="good"),
    )
    json_str = result.model_dump_json()
    import json
    parsed = json.loads(json_str)
    assert parsed["score"] == 87
    assert parsed["risk"]["j"] == "good"
    assert parsed["beds"] is None


def test_scoring_result_model():
    from graph.contracts import ScoringResult, RiskFlags

    sr = ScoringResult(
        score=87,
        risk=RiskFlags(j="good", f="good", l="warn", o="good"),
        roi=38.0,
    )
    assert sr.score == 87
    assert sr.roi == 38.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && python -m pytest tests/test_contracts.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'graph.contracts'`

- [ ] **Step 3: Write the implementation**

```python
# graph/contracts.py
"""Pydantic models for the output contract between backend agents and frontend."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class RiskFlags(BaseModel):
    """Risk assessment flags for the four dimensions that matter most in auctions."""

    j: Literal["good", "warn", "bad"]  # Jurídico
    f: Literal["good", "warn", "bad"]  # Financeiro
    l: Literal["good", "warn", "bad"]  # Liquidez
    o: Literal["good", "warn", "bad"]  # Ocupação


class ScoringResult(BaseModel):
    """Computed scoring data produced by the scoring node."""

    score: int  # 0-100
    risk: RiskFlags
    roi: float  # projected ROI %


class AuctionPropertyResult(BaseModel):
    """The single source of truth for what the frontend consumes.

    Maps to the PROPERTIES array item shape in the Arremate frontend's shared.jsx.
    Monetary values are raw BRL numbers — the frontend formats them with fmtBRL().
    """

    id: str
    score: int
    photo_label: str
    title: str
    address: str
    type: str
    neighborhood: str
    city: str
    auction_type: str
    auctioneer: str
    court: str
    discount: float
    min_bid: float
    market: float
    roi: float
    area: float
    beds: int | None = None
    baths: int | None = None
    parking: int | None = None
    floor: str | None = None
    ends_at: str
    occupancy: str
    risk: RiskFlags
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && python -m pytest tests/test_contracts.py -v`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/gdomingues/Documents/Gustavo/project/leilao
git add graph/contracts.py tests/test_contracts.py
git commit -m "feat: add output contract Pydantic models (RiskFlags, ScoringResult, AuctionPropertyResult)"
```

---

## Task 2: Update `AuctionState` — add `scoring_result` and `result_json`, remove `report_html`

**Files:**
- Modify: `graph/state.py:68-80`
- Modify: `tests/test_state.py`

- [ ] **Step 1: Write the failing test**

```python
# Add to tests/test_state.py

def test_auction_state_has_scoring_result_field():
    """AuctionState should include scoring_result (Optional[ScoringResult])."""
    from graph.contracts import ScoringResult, RiskFlags

    state = AuctionState()
    assert state.scoring_result is None

    scoring = ScoringResult(
        score=87,
        risk=RiskFlags(j="good", f="good", l="warn", o="good"),
        roi=38.0,
    )
    state = AuctionState(scoring_result=scoring)
    assert state.scoring_result.score == 87


def test_auction_state_has_result_json_field():
    """AuctionState should include result_json string."""
    state = AuctionState()
    assert state.result_json == ""

    state = AuctionState(result_json='{"score": 87}')
    assert state.result_json == '{"score": 87}'


def test_auction_state_no_report_html():
    """AuctionState should no longer have report_html field."""
    state = AuctionState()
    assert not hasattr(state, "report_html")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && python -m pytest tests/test_state.py::test_auction_state_has_scoring_result_field tests/test_state.py::test_auction_state_has_result_json_field tests/test_state.py::test_auction_state_no_report_html -v`
Expected: FAIL — `AttributeError` or `AssertionError`

- [ ] **Step 3: Update `graph/state.py`**

In `graph/state.py`, replace the `AuctionState` dataclass:

```python
# graph/state.py
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from graph.contracts import ScoringResult


@dataclass
class PropertyMetadata:
    address: str = ""
    property_type: str = ""
    area_m2: float = 0.0
    auction_price: float = 0.0
    market_value_estimate: Optional[float] = None
    auction_date: str = ""
    auction_type: str = ""
    matricula: str = ""
    court_or_leiloeiro: str = ""
    city: str = ""
    neighborhood: str = ""
    state: str = ""


@dataclass
class ComparableProperty:
    address: str = ""
    price: float = 0.0
    area_m2: float = 0.0
    price_per_m2: float = 0.0
    source: str = ""
    url: str = ""


@dataclass
class MarketResult:
    price_per_m2_neighborhood: float = 0.0
    price_per_m2_city: float = 0.0
    comparable_properties: list[ComparableProperty] = field(default_factory=list)
    reform_estimate: float = 0.0
    area_appreciation_1y: float = 0.0
    area_appreciation_3y: float = 0.0
    area_appreciation_5y: float = 0.0
    city_appreciation_1y: float = 0.0
    liquidity_days: int = 0
    tendencies: str = ""
    discount_percentage: float = 0.0
    market_score: int = 0  # 1-10
    raw_findings: str = ""


@dataclass
class LegalResult:
    registration_status: str = ""
    liens: list[str] = field(default_factory=list)
    judicial_disputes: list[str] = field(default_factory=list)
    tax_debts_iptu: str = ""
    tax_debts_itbi: str = ""
    condominium_debts: str = ""
    federal_state_debts: str = ""
    zoning_compliance: str = ""
    construction_permits: str = ""
    occupation_status: str = ""
    usufruct_rights: str = ""
    risk_level: str = ""  # low, medium, high, critical
    risk_details: str = ""
    raw_findings: str = ""


@dataclass
class AuctionState:
    pdf_texts: str = ""
    pdf_sources: list[str] = field(default_factory=list)
    property_metadata: Optional[PropertyMetadata] = None
    research_plan: str = ""
    market_result: Optional[MarketResult] = None
    legal_result: Optional[LegalResult] = None
    scoring_result: Optional["ScoringResult"] = None
    result_json: str = ""
    errors: list[str] = field(default_factory=list)
    auction_url: str = ""
    downloaded_pdfs: list[str] = field(default_factory=list)
    page_source_type: str = ""
```

Also remove the `assert state.report_html == ""` line from the existing `test_auction_state_defaults` test in `tests/test_state.py`.

- [ ] **Step 4: Run all state tests to verify they pass**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && python -m pytest tests/test_state.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/gdomingues/Documents/Gustavo/project/leilao
git add graph/state.py tests/test_state.py
git commit -m "feat: add scoring_result/result_json to AuctionState, remove report_html"
```

---

## Task 3: Create `graph/scoring.py` — scoring node

**Files:**
- Create: `graph/scoring.py`
- Test: `tests/test_scoring.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_scoring.py
from graph.state import AuctionState, PropertyMetadata, MarketResult, LegalResult
from graph.scoring import scoring_node, compute_score, compute_risk_flags, compute_roi


def _make_state(**overrides):
    defaults = dict(
        pdf_texts="Edital text",
        pdf_sources=["edital.pdf"],
        property_metadata=PropertyMetadata(
            address="Rua das Flores, 123, Centro, Sao Paulo - SP",
            property_type="Apartamento",
            area_m2=80.0,
            auction_price=350000.0,
            market_value_estimate=500000.0,
            auction_date="15/06/2025",
            auction_type="Judicial",
            court_or_leiloeiro="Zukerman Leilões",
            city="Sao Paulo",
            neighborhood="Centro",
            state="SP",
        ),
        market_result=MarketResult(
            price_per_m2_neighborhood=12000.0,
            price_per_m2_city=9500.0,
            reform_estimate=25000.0,
            discount_percentage=30.0,
            market_score=7,
            liquidity_days=45,
        ),
        legal_result=LegalResult(
            risk_level="low",
            risk_details="No significant risks",
            occupation_status="Desocupado",
            tax_debts_iptu="Nenhum débito",
            condominium_debts="N/A",
            federal_state_debts="Nenhum débito",
        ),
    )
    defaults.update(overrides)
    return AuctionState(**defaults)


class TestComputeScore:
    def test_score_starts_at_50(self):
        """Base score is 50 with neutral inputs."""
        score = compute_score(
            market_score=5,
            discount_percentage=0.0,
            risk_level="medium",
            occupation="ocupado",
            liquidity_days=90,
        )
        assert score == 50

    def test_score_high_market_good_legal(self):
        """High market score + low legal risk + desocupado pushes score up."""
        score = compute_score(
            market_score=8,
            discount_percentage=42.0,
            risk_level="low",
            occupation="desocupado",
            liquidity_days=45,
        )
        # 50 + 24 + 12.6 + 15 + 10 + 5 = 116.6 -> clamped to 100
        assert score == 100

    def test_score_critical_legal_disputado(self):
        """Critical legal risk + disputado pushes score down."""
        score = compute_score(
            market_score=2,
            discount_percentage=10.0,
            risk_level="critical",
            occupation="disputado",
            liquidity_days=150,
        )
        # 50 + 6 + 3 - 30 - 15 - 5 = 9
        assert score == 9

    def test_score_clamped_to_0(self):
        """Score should not go below 0."""
        score = compute_score(
            market_score=1,
            discount_percentage=0.0,
            risk_level="critical",
            occupation="disputado",
            liquidity_days=150,
        )
        # 50 + 3 + 0 - 30 - 15 - 5 = 3 — not clamped in this case
        assert score >= 0

    def test_score_clamped_to_100(self):
        """Score should not exceed 100."""
        score = compute_score(
            market_score=10,
            discount_percentage=50.0,
            risk_level="low",
            occupation="desocupado",
            liquidity_days=30,
        )
        # 50 + 30 + 15 + 15 + 10 + 5 = 125 -> 100
        assert score == 100


class TestComputeRiskFlags:
    def test_good_flags(self):
        """All good inputs produce all-good flags."""
        flags = compute_risk_flags(
            risk_level="low",
            tax_debts_iptu="",
            condominium_debts="",
            federal_state_debts="",
            liquidity_days=30,
            occupation_status="Desocupado",
        )
        assert flags.j == "good"
        assert flags.f == "good"
        assert flags.l == "good"
        assert flags.o == "good"

    def test_juridico_medium(self):
        """Medium risk_level → j='warn'."""
        flags = compute_risk_flags(
            risk_level="medium",
            tax_debts_iptu="",
            condominium_debts="",
            federal_state_debts="",
            liquidity_days=30,
            occupation_status="Desocupado",
        )
        assert flags.j == "warn"

    def test_juridico_high_or_critical(self):
        """High/critical risk_level → j='bad'."""
        for level in ("high", "critical"):
            flags = compute_risk_flags(
                risk_level=level,
                tax_debts_iptu="",
                condominium_debts="",
                federal_state_debts="",
                liquidity_days=30,
                occupation_status="Desocupado",
            )
            assert flags.j == "bad"

    def test_financeiro_warn_iptu_only(self):
        """Only IPTU debt → f='warn'."""
        flags = compute_risk_flags(
            risk_level="low",
            tax_debts_iptu="R$ 4.200 em aberto",
            condominium_debts="N/A",
            federal_state_debts="Nenhum débito",
            liquidity_days=30,
            occupation_status="Desocupado",
        )
        assert flags.f == "warn"

    def test_financeiro_bad_condominium(self):
        """Non-trivial condominium debt → f='bad'."""
        flags = compute_risk_flags(
            risk_level="low",
            tax_debts_iptu="",
            condominium_debts="R$ 18.400 conforme certidão",
            federal_state_debts="",
            liquidity_days=30,
            occupation_status="Desocupado",
        )
        assert flags.f == "bad"

    def test_financeiro_bad_federal_debts(self):
        """Non-trivial federal/state debts → f='bad'."""
        flags = compute_risk_flags(
            risk_level="low",
            tax_debts_iptu="",
            condominium_debts="N/A",
            federal_state_debts="Dívida ativa R$ 50.000",
            liquidity_days=30,
            occupation_status="Desocupado",
        )
        assert flags.f == "bad"

    def test_liquidez_good(self):
        """< 60 days → l='good'."""
        flags = compute_risk_flags(
            risk_level="low",
            tax_debts_iptu="",
            condominium_debts="",
            federal_state_debts="",
            liquidity_days=59,
            occupation_status="Desocupado",
        )
        assert flags.l == "good"

    def test_liquidez_warn(self):
        """60-120 days → l='warn'."""
        flags = compute_risk_flags(
            risk_level="low",
            tax_debts_iptu="",
            condominium_debts="",
            federal_state_debts="",
            liquidity_days=90,
            occupation_status="Desocupado",
        )
        assert flags.l == "warn"

    def test_liquidez_bad(self):
        """> 120 days → l='bad'."""
        flags = compute_risk_flags(
            risk_level="low",
            tax_debts_iptu="",
            condominium_debts="",
            federal_state_debts="",
            liquidity_days=121,
            occupation_status="Desocupado",
        )
        assert flags.l == "bad"

    def test_ocupacao_good(self):
        """Desocupado → o='good'."""
        flags = compute_risk_flags(
            risk_level="low",
            tax_debts_iptu="",
            condominium_debts="",
            federal_state_debts="",
            liquidity_days=30,
            occupation_status="Desocupado",
        )
        assert flags.o == "good"

    def test_ocupacao_warn(self):
        """Ocupado → o='warn'."""
        flags = compute_risk_flags(
            risk_level="low",
            tax_debts_iptu="",
            condominium_debts="",
            federal_state_debts="",
            liquidity_days=30,
            occupation_status="Ocupado pelo proprietário",
        )
        assert flags.o == "warn"

    def test_ocupacao_bad(self):
        """Disputado/posseiro/invasor → o='bad'."""
        for status in ("Disputado", "Posseiro", "Invasor"):
            flags = compute_risk_flags(
                risk_level="low",
                tax_debts_iptu="",
                condominium_debts="",
                federal_state_debts="",
                liquidity_days=30,
                occupation_status=status,
            )
            assert flags.o == "bad"


class TestComputeROI:
    def test_roi_basic(self):
        """ROI formula: ((market - (min_bid + reform + fees)) / (min_bid + reform + fees)) * 100."""
        roi = compute_roi(
            min_bid=312000.0,
            market_value=540000.0,
            reform_estimate=36000.0,
        )
        # fees = 312000 * 0.078 = 24336
        # total_cost = 312000 + 36000 + 24336 = 372336
        # roi = ((540000 - 372336) / 372336) * 100 = 45.04...
        assert abs(roi - 45.04) < 0.1

    def test_roi_zero_min_bid(self):
        """Zero min_bid should return 0.0 to avoid division by zero."""
        roi = compute_roi(
            min_bid=0.0,
            market_value=500000.0,
            reform_estimate=0.0,
        )
        assert roi == 0.0


class TestScoringNode:
    def test_scoring_node_returns_scoring_result(self):
        """scoring_node should return a dict with 'scoring_result' key."""
        state = _make_state()
        result = scoring_node(state)
        assert "scoring_result" in result
        assert result["scoring_result"].score > 0
        assert result["scoring_result"].risk is not None
        assert result["scoring_result"].roi > 0

    def test_scoring_node_no_metadata(self):
        """scoring_node should handle missing metadata gracefully."""
        state = _make_state(property_metadata=None)
        result = scoring_node(state)
        assert "scoring_result" in result
        assert result["scoring_result"].score == 0

    def test_scoring_node_no_market_or_legal(self):
        """scoring_node should handle missing market/legal results gracefully."""
        state = _make_state(market_result=None, legal_result=None)
        result = scoring_node(state)
        assert "scoring_result" in result
        # With no market/legal data, score should be very low
        assert result["scoring_result"].score < 50
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && python -m pytest tests/test_scoring.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'graph.scoring'`

- [ ] **Step 3: Write the implementation**

```python
# graph/scoring.py
"""Scoring node: compute overall score, risk flags, and ROI from market + legal results."""

from __future__ import annotations

import re
from typing import Optional

from loguru import logger

from graph.contracts import RiskFlags, ScoringResult
from graph.state import AuctionState, LegalResult, MarketResult, PropertyMetadata


# Debt keywords that indicate non-trivial amounts
_DEBT_INDICATORS = re.compile(r"r\$\s*[\d.,]+", re.IGNORECASE)
_NEGLECT_KEYWORDS = {"nenhum", "n/a", "inexistente", "não consta", "nao consta", "sem débito", "sem debito", ""}


def compute_score(
    market_score: int,
    discount_percentage: float,
    risk_level: str,
    occupation: str,
    liquidity_days: int,
) -> int:
    """Compute a 0-100 score from market and legal factors.

    Starts at 50 (neutral) and applies adjustments per the scoring formula.
    """
    score = 50.0

    # Market adjustments
    score += market_score * 3
    score += discount_percentage * 0.3

    # Legal risk adjustments
    legal_adj = {"low": 15, "medium": 0, "high": -15, "critical": -30}
    score += legal_adj.get(risk_level, 0)

    # Occupation adjustments
    occ_lower = occupation.lower()
    if "desocupado" in occ_lower:
        score += 10
    elif any(w in occ_lower for w in ("disputado", "posseiro", "invasor")):
        score -= 15
    else:
        score -= 5  # ocupado and other cases

    # Liquidity adjustments
    if liquidity_days < 60:
        score += 5
    elif liquidity_days > 120:
        score -= 5

    return max(0, min(100, int(round(score))))


def _has_non_trivial_debt(debt_text: str) -> bool:
    """Check if a debt field contains a non-trivial monetary amount."""
    if not debt_text:
        return False
    lower = debt_text.lower().strip()
    if lower in _NEGLECT_KEYWORDS:
        return False
    return bool(_DEBT_INDICATORS.search(debt_text))


def compute_risk_flags(
    risk_level: str,
    tax_debts_iptu: str,
    condominium_debts: str,
    federal_state_debts: str,
    liquidity_days: int,
    occupation_status: str,
) -> RiskFlags:
    """Derive the four risk flags (j, f, l, o) from agent results."""

    # Jurídico: from legal risk_level
    if risk_level == "low":
        j = "good"
    elif risk_level == "medium":
        j = "warn"
    else:
        j = "bad"

    # Financeiro: from debt fields
    has_condo_debt = _has_non_trivial_debt(condominium_debts)
    has_federal_debt = _has_non_trivial_debt(federal_state_debts)
    has_iptu_debt = _has_non_trivial_debt(tax_debts_iptu)

    if has_condo_debt or has_federal_debt:
        f = "bad"
    elif has_iptu_debt:
        f = "warn"
    else:
        f = "good"

    # Liquidez: from market liquidity_days
    if liquidity_days < 60:
        l = "good"
    elif liquidity_days <= 120:
        l = "warn"
    else:
        l = "bad"

    # Ocupação: from legal occupation_status
    occ_lower = occupation_status.lower()
    if "desocupado" in occ_lower:
        o = "good"
    elif any(w in occ_lower for w in ("disputado", "posseiro", "invasor")):
        o = "bad"
    else:
        o = "warn"

    return RiskFlags(j=j, f=f, l=l, o=o)


def compute_roi(min_bid: float, market_value: float, reform_estimate: float) -> float:
    """Compute projected ROI %.

    roi = ((market - (min_bid + reform + fees)) / (min_bid + reform + fees)) * 100
    fees = min_bid * 0.078  (ITBI ~3% + comissão leiloeiro ~5% + custas ~1%)
    """
    if min_bid <= 0:
        return 0.0
    fees = min_bid * 0.078
    total_cost = min_bid + reform_estimate + fees
    if total_cost <= 0:
        return 0.0
    return round(((market_value - total_cost) / total_cost) * 100, 2)


def _get_occupation(legal_result: Optional[LegalResult]) -> str:
    """Extract occupation string from LegalResult, defaulting to 'ocupado'."""
    if legal_result and legal_result.occupation_status:
        return legal_result.occupation_status
    return "ocupado"


def scoring_node(state: AuctionState) -> dict:
    """LangGraph node: compute score, risk flags, and ROI from market + legal results."""
    metadata = state.property_metadata if hasattr(state, "property_metadata") else state.get("property_metadata")
    market_result = state.market_result if hasattr(state, "market_result") else state.get("market_result")
    legal_result = state.legal_result if hasattr(state, "legal_result") else state.get("legal_result")

    if not metadata:
        logger.warning("Scoring node: no property metadata available")
        return {
            "scoring_result": ScoringResult(
                score=0,
                risk=RiskFlags(j="bad", f="bad", l="bad", o="bad"),
                roi=0.0,
            ),
            "errors": ["No property metadata for scoring"],
        }

    # Extract values with safe defaults
    market_score = market_result.market_score if market_result else 0
    discount_pct = market_result.discount_percentage if market_result else 0.0
    liquidity_days = market_result.liquidity_days if market_result else 90
    risk_level = legal_result.risk_level if legal_result else "critical"
    occupation = _get_occupation(legal_result)

    # Get debt fields for financeiro flag
    iptu = legal_result.tax_debts_iptu if legal_result else ""
    condo = legal_result.condominium_debts if legal_result else ""
    federal = legal_result.federal_state_debts if legal_result else ""

    # Compute
    score = compute_score(
        market_score=market_score,
        discount_percentage=discount_pct,
        risk_level=risk_level,
        occupation=occupation,
        liquidity_days=liquidity_days,
    )

    risk = compute_risk_flags(
        risk_level=risk_level,
        tax_debts_iptu=iptu,
        condominium_debts=condo,
        federal_state_debts=federal,
        liquidity_days=liquidity_days,
        occupation_status=occupation,
    )

    market_value = (
        metadata.market_value_estimate
        or (market_result.price_per_m2_neighborhood * metadata.area_m2 if market_result else 0.0)
    )
    reform_estimate = market_result.reform_estimate if market_result else 0.0

    roi = compute_roi(
        min_bid=metadata.auction_price,
        market_value=market_value,
        reform_estimate=reform_estimate,
    )

    scoring_result = ScoringResult(score=score, risk=risk, roi=roi)

    logger.info(f"Scoring node: score={score}, risk={risk.model_dump()}, roi={roi}%")

    return {"scoring_result": scoring_result}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && python -m pytest tests/test_scoring.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/gdomingues/Documents/Gustavo/project/leilao
git add graph/scoring.py tests/test_scoring.py
git commit -m "feat: add scoring node with score, risk flags, and ROI computation"
```

---

## Task 4: Create `graph/output.py` — output node

**Files:**
- Create: `graph/output.py`
- Test: `tests/test_output.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_output.py
import json

from graph.state import AuctionState, PropertyMetadata, MarketResult, LegalResult
from graph.contracts import ScoringResult, RiskFlags
from graph.output import output_node, build_result


def _make_full_state():
    return AuctionState(
        pdf_texts="Edital text",
        pdf_sources=["edital.pdf"],
        property_metadata=PropertyMetadata(
            address="R. Harmonia, 412, Vila Madalena, São Paulo - SP",
            property_type="Apartamento",
            area_m2=78.0,
            auction_price=312000.0,
            market_value_estimate=540000.0,
            auction_date="15/05/2026",
            auction_type="1ª praça",
            matricula="87.412",
            court_or_leiloeiro="Zukerman Leilões",
            city="São Paulo",
            neighborhood="Vila Madalena",
            state="SP",
        ),
        market_result=MarketResult(
            price_per_m2_neighborhood=6923.0,
            discount_percentage=42.0,
            reform_estimate=36000.0,
        ),
        legal_result=LegalResult(
            risk_level="low",
            occupation_status="Desocupado",
        ),
        scoring_result=ScoringResult(
            score=87,
            risk=RiskFlags(j="good", f="good", l="warn", o="good"),
            roi=38.0,
        ),
    )


class TestBuildResult:
    def test_build_result_maps_all_fields(self):
        """build_result should produce a valid AuctionPropertyResult."""
        state = _make_full_state()
        result = build_result(state)

        assert result.id  # non-empty
        assert result.score == 87
        assert result.photo_label == "APARTAMENTO · VILA MADALENA · SP"
        assert "Harmonia" in result.title
        assert result.address == "R. Harmonia, 412, Vila Madalena, São Paulo - SP"
        assert result.type == "Apartamento"
        assert result.neighborhood == "Vila Madalena"
        assert result.city == "São Paulo, SP"
        assert result.auction_type == "1ª praça"
        assert result.auctioneer == "Zukerman Leilões"
        assert result.discount == 42.0
        assert result.min_bid == 312000.0
        assert result.market == 540000.0
        assert result.roi == 38.0
        assert result.area == 78.0
        assert result.occupancy == "desocupado"
        assert result.risk.j == "good"

    def test_build_result_court_judicial(self):
        """For judicial auctions, court_or_leiloeiro maps to both auctioneer and court."""
        state = _make_full_state()
        state.property_metadata.auction_type = "Judicial"
        result = build_result(state)
        # Judicial: court_or_leiloeiro used as-is for both
        assert result.auctioneer == "Zukerman Leilões"
        assert result.court == "Zukerman Leilões"

    def test_build_result_court_extrajudicial(self):
        """For extrajudicial auctions, court should be '—'."""
        state = _make_full_state()
        state.property_metadata.auction_type = "Extrajudicial"
        result = build_result(state)
        assert result.court == "—"

    def test_build_result_market_from_price_per_m2(self):
        """When market_value_estimate is None, compute market from price_per_m2 * area."""
        state = _make_full_state()
        state.property_metadata.market_value_estimate = None
        result = build_result(state)
        # 6923.0 * 78.0 = 540,594
        assert result.market == 6923.0 * 78.0

    def test_build_result_beds_baths_parking_floor_are_none(self):
        """beds/baths/parking/floor should be None (not yet extracted)."""
        state = _make_full_state()
        result = build_result(state)
        assert result.beds is None
        assert result.baths is None
        assert result.parking is None
        assert result.floor is None

    def test_build_result_ends_at_is_iso8601(self):
        """ends_at should be an ISO 8601 string."""
        state = _make_full_state()
        result = build_result(state)
        assert "T" in result.ends_at or "/" in result.ends_at


class TestOutputNode:
    def test_output_node_returns_result_json(self):
        """output_node should return a dict with 'result_json' key."""
        state = _make_full_state()
        result = output_node(state)
        assert "result_json" in result
        parsed = json.loads(result["result_json"])
        assert parsed["score"] == 87
        assert parsed["risk"]["j"] == "good"

    def test_output_node_no_metadata(self):
        """output_node should handle missing metadata gracefully."""
        state = AuctionState()
        result = output_node(state)
        assert "result_json" in result
        parsed = json.loads(result["result_json"])
        assert parsed["score"] == 0

    def test_output_node_no_scoring_result(self):
        """output_node should handle missing scoring_result gracefully."""
        state = _make_full_state()
        state.scoring_result = None
        result = output_node(state)
        assert "result_json" in result
        parsed = json.loads(result["result_json"])
        assert parsed["score"] == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && python -m pytest tests/test_output.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'graph.output'`

- [ ] **Step 3: Write the implementation**

```python
# graph/output.py
"""Output node: build AuctionPropertyResult from workflow state and serialize to JSON."""

from __future__ import annotations

import hashlib
import re
from typing import Optional

from loguru import logger

from graph.contracts import AuctionPropertyResult, RiskFlags, ScoringResult
from graph.state import AuctionState, LegalResult, MarketResult, PropertyMetadata


def _generate_id(address: str, auction_price: float) -> str:
    """Generate a stable ID from address + auction price."""
    raw = f"{address}{auction_price}"
    return hashlib.sha256(raw.encode()).hexdigest()[:12]


def _extract_street(address: str) -> str:
    """Extract street name from a Brazilian address for the title."""
    if not address:
        return ""
    # Take the first comma-separated part
    parts = address.split(",")
    street = parts[0].strip()
    # Remove trailing house number patterns
    street = re.sub(r"\s*n[ºo.]?\s*\d+$", "", street, flags=re.IGNORECASE).strip()
    street = re.sub(r"\s+\d+$", "", street).strip()
    return street


def _map_occupancy(occupation_status: str) -> str:
    """Map LegalResult.occupation_status to frontend occupancy values."""
    if not occupation_status:
        return "ocupado"
    lower = occupation_status.lower()
    if "desocupado" in lower:
        return "desocupado"
    if any(w in lower for w in ("disputado", "posseiro", "invasor")):
        return "disputado"
    return "ocupado"


def _determine_court(auction_type: str, court_or_leiloeiro: str) -> str:
    """Determine the court value for the output contract.

    For judicial auctions, court_or_leiloeiro maps to court.
    For extrajudicial auctions, court is '—'.
    """
    if not auction_type:
        return "—"
    if "judicial" in auction_type.lower():
        return court_or_leiloeiro or "—"
    return "—"


def _determine_auctioneer(auction_type: str, court_or_leiloeiro: str) -> str:
    """Determine the auctioneer value for the output contract.

    court_or_leiloeiro is used as the auctioneer name in all cases.
    """
    return court_or_leiloeiro or "—"


def _parse_auction_date(auction_date: str) -> str:
    """Parse auction date string to ISO 8601.

    Handles common Brazilian date formats: DD/MM/YYYY, YYYY-MM-DD, etc.
    Falls back to returning the raw string if parsing fails.
    """
    if not auction_date:
        return ""
    # Try DD/MM/YYYY
    match = re.match(r"(\d{2})/(\d{2})/(\d{4})", auction_date)
    if match:
        return f"{match.group(3)}-{match.group(2)}-{match.group(1)}T00:00:00"
    # Already ISO-ish
    if re.match(r"\d{4}-\d{2}-\d{2}", auction_date):
        if "T" in auction_date:
            return auction_date
        return f"{auction_date}T00:00:00"
    return auction_date


def build_result(state: AuctionState) -> AuctionPropertyResult:
    """Build an AuctionPropertyResult from the workflow state."""
    metadata = state.property_metadata
    market_result = state.market_result
    legal_result = state.legal_result
    scoring_result = state.scoring_result

    # Handle missing metadata
    if not metadata:
        return AuctionPropertyResult(
            id="unknown",
            score=0,
            photo_label="",
            title="Propriedade desconhecida",
            address="",
            type="",
            neighborhood="",
            city="",
            auction_type="",
            auctioneer="—",
            court="—",
            discount=0.0,
            min_bid=0.0,
            market=0.0,
            roi=0.0,
            area=0.0,
            ends_at="",
            occupancy="ocupado",
            risk=RiskFlags(j="bad", f="bad", l="bad", o="bad"),
        )

    # Extract values
    prop_type = metadata.property_type or ""
    neighborhood = metadata.neighborhood or ""
    state_abbrev = metadata.state or ""

    # Market value: prefer metadata estimate, fall back to price_per_m2 * area
    market_value = metadata.market_value_estimate
    if not market_value and market_result:
        market_value = market_result.price_per_m2_neighborhood * metadata.area_m2
    if not market_value:
        market_value = 0.0

    # Scoring data (may be missing if scoring node failed)
    score = scoring_result.score if scoring_result else 0
    risk = scoring_result.risk if scoring_result else RiskFlags(j="bad", f="bad", l="bad", o="bad")
    roi = scoring_result.roi if scoring_result else 0.0

    # Occupancy from legal result
    occupation_status = legal_result.occupation_status if legal_result else ""
    occupancy = _map_occupancy(occupation_status)

    # Discount from market result
    discount = market_result.discount_percentage if market_result else 0.0

    return AuctionPropertyResult(
        id=_generate_id(metadata.address, metadata.auction_price),
        score=score,
        photo_label=f"{prop_type.upper()} · {neighborhood.upper()} · {state_abbrev}" if prop_type else "",
        title=f"{prop_type} {metadata.area_m2:.0f} m², {_extract_street(metadata.address)}" if prop_type else metadata.address,
        address=metadata.address,
        type=prop_type,
        neighborhood=neighborhood,
        city=f"{metadata.city}, {state_abbrev}" if metadata.city else "",
        auction_type=metadata.auction_type,
        auctioneer=_determine_auctioneer(metadata.auction_type, metadata.court_or_leiloeiro),
        court=_determine_court(metadata.auction_type, metadata.court_or_leiloeiro),
        discount=discount,
        min_bid=metadata.auction_price,
        market=market_value,
        roi=roi,
        area=metadata.area_m2,
        beds=None,
        baths=None,
        parking=None,
        floor=None,
        ends_at=_parse_auction_date(metadata.auction_date),
        occupancy=occupancy,
        risk=risk,
    )


def output_node(state: AuctionState) -> dict:
    """LangGraph node: build the final AuctionPropertyResult and serialize to JSON."""
    logger.info("Output node: building AuctionPropertyResult")

    result = build_result(state)
    result_json = result.model_dump_json()

    logger.info(f"Output node: result JSON produced ({len(result_json)} chars)")

    return {"result_json": result_json}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && python -m pytest tests/test_output.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/gdomingues/Documents/Gustavo/project/leilao
git add graph/output.py tests/test_output.py
git commit -m "feat: add output node that builds AuctionPropertyResult JSON"
```

---

## Task 5: Update `graph/workflow.py` — new flow with scoring + output nodes

**Files:**
- Modify: `graph/workflow.py`
- Modify: `tests/test_workflow.py`

- [ ] **Step 1: Update `graph/workflow.py`**

```python
# graph/workflow.py
"""LangGraph workflow assembly for auction property analysis.

Workflow:
    discovery -> planner -> [market, legal] (parallel) -> scoring -> output -> END
"""

from langgraph.graph import StateGraph, END

from loguru import logger

from graph.state import AuctionState
from graph.discovery import discovery_node
from graph.planner import planner_node
from graph.market import market_node
from graph.legal import legal_node
from graph.scoring import scoring_node
from graph.output import output_node


def create_workflow():
    """Create the LangGraph workflow for auction property analysis.

    Flow: discovery -> planner -> [market, legal] (parallel) -> scoring -> output -> END

    Returns:
        Compiled LangGraph StateGraph.
    """
    graph = StateGraph(AuctionState)

    # Add nodes
    graph.add_node("discovery", discovery_node)
    graph.add_node("planner", planner_node)
    graph.add_node("market", market_node)
    graph.add_node("legal", legal_node)
    graph.add_node("scoring", scoring_node)
    graph.add_node("output", output_node)

    # Set entry point
    graph.set_entry_point("discovery")

    # Discovery -> planner
    graph.add_edge("discovery", "planner")

    # Fan-out: planner -> market and planner -> legal (parallel)
    graph.add_edge("planner", "market")
    graph.add_edge("planner", "legal")

    # Fan-in: market -> scoring and legal -> scoring
    graph.add_edge("market", "scoring")
    graph.add_edge("legal", "scoring")

    # Scoring -> output
    graph.add_edge("scoring", "output")

    # Output -> END
    graph.add_edge("output", END)

    return graph.compile()


def run_analysis(initial_state):
    """Run the full analysis workflow.

    Args:
        initial_state: Starting state with pdf_texts and pdf_sources,
            or auction_url. Can be an AuctionState dataclass instance or a dict.

    Returns:
        Final state dict with all results including result_json.
    """
    workflow = create_workflow()

    logger.info("Starting auction analysis workflow")

    result = workflow.invoke(initial_state)

    logger.info("Workflow completed")

    return result
```

- [ ] **Step 2: Update `tests/test_workflow.py`**

Replace the entire file. The key changes:
- Replace `reporter` references with `scoring` + `output`
- Replace `report_html` assertions with `result_json` assertions
- Update node names in `test_workflow_has_five_nodes` (now 6 nodes)
- Remove `_make_reporter_return()` and `_reporter_response()`
- Remove all `patch("graph.reporter...")` calls
- Add `patch("graph.output.build_result")` or rely on scoring/output being pure functions

```python
# tests/test_workflow.py
import json
from unittest.mock import patch, MagicMock, AsyncMock

from graph.state import (
    AuctionState,
    PropertyMetadata,
    MarketResult,
    LegalResult,
)
from graph.contracts import ScoringResult, RiskFlags
from graph.workflow import create_workflow, run_analysis


def _make_initial_state():
    """Create a minimal valid initial state for testing."""
    return AuctionState(
        pdf_texts="Edital de Leilao Judicial - Rua das Flores, 123",
        pdf_sources=["edital.pdf"],
    )


def _make_planner_return():
    """Return value for a mocked planner node."""
    return {
        "property_metadata": PropertyMetadata(
            address="Rua das Flores, 123, Centro, Sao Paulo - SP",
            property_type="Apartamento",
            area_m2=80.0,
            auction_price=350000.0,
            market_value_estimate=500000.0,
            city="Sao Paulo",
            neighborhood="Centro",
            state="SP",
        ),
        "research_plan": "Research market prices in Centro.",
    }


def _make_market_return():
    """Return value for a mocked market node."""
    return {
        "market_result": MarketResult(
            price_per_m2_neighborhood=12000.0,
            market_score=7,
            discount_percentage=30.0,
        ),
    }


def _make_legal_return():
    """Return value for a mocked legal node."""
    return {
        "legal_result": LegalResult(
            risk_level="low",
            risk_details="No significant risks found.",
        ),
    }


# ---------------------------------------------------------------------------
# Discovery mock helpers
# ---------------------------------------------------------------------------


def _discovery_response():
    """Build a MagicMock LLM response for the discovery node."""
    mock = MagicMock()
    mock.choices = [
        MagicMock(
            message=MagicMock(
                content=json.dumps({
                    "property_metadata": {
                        "address": "Rua das Flores, 123",
                        "property_type": "Apartamento",
                        "area_m2": 80.0,
                        "auction_price": 350000.0,
                        "city": "Sao Paulo",
                        "state": "SP",
                    },
                    "pdf_urls": [],
                    "page_source_type": "caixa",
                })
            )
        )
    ]
    return mock


# ---------------------------------------------------------------------------
# Graph structure tests
# ---------------------------------------------------------------------------


def test_workflow_has_six_nodes():
    """The compiled graph should contain discovery, planner, market, legal, scoring, and output nodes."""
    workflow = create_workflow()

    node_names = set(workflow.nodes.keys())
    expected = {"discovery", "planner", "market", "legal", "scoring", "output"}
    assert expected.issubset(node_names), f"Expected nodes {expected} to be subset of {node_names}"


def test_workflow_entry_point_is_discovery():
    """The first node executed should be the discovery node."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "", "html": ""}),
        patch("graph.discovery._call_discovery_llm", return_value=_discovery_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.planner._call_planner_llm") as mock_planner_llm,
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.market._run_market_searches", return_value=([], [])),
        patch("graph.legal._run_legal_searches", return_value=[]),
    ):
        _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm)
        call_order = []
        mock_planner_llm.side_effect = lambda *a, **kw: (
            call_order.append("planner"), _planner_response()
        )[1]
        mock_market_llm.side_effect = lambda *a, **kw: (
            call_order.append("market"), _market_response()
        )[1]
        mock_legal_llm.side_effect = lambda *a, **kw: (
            call_order.append("legal"), _legal_response()
        )[1]

        run_analysis(_make_initial_state())

        assert call_order[0] == "planner", f"First LLM call should be planner (after discovery), got {call_order}"


def test_workflow_discovery_runs_before_planner():
    """Discovery must complete before planner starts."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "Test", "html": "<html><body>Test</body></html>"}),
        patch("graph.discovery._call_discovery_llm") as mock_discovery_llm,
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.planner._call_planner_llm") as mock_planner_llm,
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.market._run_market_searches", return_value=([], [])),
        patch("graph.legal._run_legal_searches", return_value=[]),
    ):
        _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm)
        call_order = []
        mock_discovery_llm.side_effect = lambda *a, **kw: (
            call_order.append("discovery"), _discovery_response()
        )[1]
        mock_planner_llm.side_effect = lambda *a, **kw: (
            call_order.append("planner"), _planner_response()
        )[1]
        mock_market_llm.side_effect = lambda *a, **kw: (
            call_order.append("market"), _market_response()
        )[1]
        mock_legal_llm.side_effect = lambda *a, **kw: (
            call_order.append("legal"), _legal_response()
        )[1]

        run_analysis(AuctionState(
            auction_url="https://test.com/leilao/123",
            pdf_texts="some text",
        ))

        discovery_idx = call_order.index("discovery")
        planner_idx = call_order.index("planner")
        assert discovery_idx < planner_idx


def test_workflow_planner_runs_before_market_and_legal():
    """Planner must complete before market and legal start."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "", "html": ""}),
        patch("graph.discovery._call_discovery_llm", return_value=_discovery_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.planner._call_planner_llm") as mock_planner_llm,
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.market._run_market_searches", return_value=([], [])),
        patch("graph.legal._run_legal_searches", return_value=[]),
    ):
        _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm)
        call_order = []
        mock_planner_llm.side_effect = lambda *a, **kw: (
            call_order.append("planner"), _planner_response()
        )[1]
        mock_market_llm.side_effect = lambda *a, **kw: (
            call_order.append("market"), _market_response()
        )[1]
        mock_legal_llm.side_effect = lambda *a, **kw: (
            call_order.append("legal"), _legal_response()
        )[1]

        run_analysis(_make_initial_state())

        planner_idx = call_order.index("planner")
        market_idx = call_order.index("market")
        legal_idx = call_order.index("legal")
        assert planner_idx < market_idx
        assert planner_idx < legal_idx


def test_workflow_scoring_runs_after_market_and_legal():
    """Scoring must only execute after both market and legal complete."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "", "html": ""}),
        patch("graph.discovery._call_discovery_llm", return_value=_discovery_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.planner._call_planner_llm") as mock_planner_llm,
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.market._run_market_searches", return_value=([], [])),
        patch("graph.legal._run_legal_searches", return_value=[]),
    ):
        _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm)

        result = run_analysis(_make_initial_state())

        # Scoring result should be populated after market and legal
        assert result["scoring_result"] is not None
        assert result["scoring_result"].score > 0


def test_workflow_all_nodes_execute():
    """All six nodes must execute during a successful run."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "Test", "html": "<html><body>Test</body></html>"}),
        patch("graph.discovery._call_discovery_llm") as mock_discovery_llm,
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.planner._call_planner_llm") as mock_planner_llm,
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.market._run_market_searches", return_value=([], [])),
        patch("graph.legal._run_legal_searches", return_value=[]),
    ):
        _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm)
        call_order = []
        mock_discovery_llm.side_effect = lambda *a, **kw: (
            call_order.append("discovery"), _discovery_response()
        )[1]
        mock_planner_llm.side_effect = lambda *a, **kw: (
            call_order.append("planner"), _planner_response()
        )[1]
        mock_market_llm.side_effect = lambda *a, **kw: (
            call_order.append("market"), _market_response()
        )[1]
        mock_legal_llm.side_effect = lambda *a, **kw: (
            call_order.append("legal"), _legal_response()
        )[1]

        run_analysis(AuctionState(
            auction_url="https://test.com/leilao/123",
            pdf_texts="some text",
        ))

        assert "discovery" in call_order
        assert "planner" in call_order
        assert "market" in call_order
        assert "legal" in call_order


# ---------------------------------------------------------------------------
# End-to-end tests with mocked agent nodes
# ---------------------------------------------------------------------------


def test_run_analysis_returns_final_state_with_result_json():
    """run_analysis should return a dict with result_json populated."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "", "html": ""}),
        patch("graph.discovery._call_discovery_llm", return_value=_discovery_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.planner._call_planner_llm") as mock_planner_llm,
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.market._run_market_searches", return_value=([], [])),
        patch("graph.legal._run_legal_searches", return_value=[]),
    ):
        _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm)

        result = run_analysis(_make_initial_state())

        assert isinstance(result, dict)
        assert "result_json" in result
        parsed = json.loads(result["result_json"])
        assert "score" in parsed
        assert "risk" in parsed
        assert "id" in parsed


def test_run_analysis_state_accumulation():
    """Each node's output should accumulate in the shared state."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "", "html": ""}),
        patch("graph.discovery._call_discovery_llm", return_value=_discovery_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.planner._call_planner_llm") as mock_planner_llm,
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.market._run_market_searches", return_value=([], [])),
        patch("graph.legal._run_legal_searches", return_value=[]),
    ):
        _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm)

        result = run_analysis(_make_initial_state())

        # Planner output
        assert result["property_metadata"] is not None
        assert result["research_plan"] != ""

        # Market output
        assert result["market_result"] is not None
        assert result["market_result"].market_score == 7

        # Legal output
        assert result["legal_result"] is not None
        assert result["legal_result"].risk_level == "low"

        # Scoring output
        assert result["scoring_result"] is not None
        assert result["scoring_result"].score > 0

        # Output node
        assert result["result_json"] != ""


def test_run_analysis_preserves_initial_pdf_data():
    """Initial state fields (pdf_texts, pdf_sources) should survive through the workflow."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "", "html": ""}),
        patch("graph.discovery._call_discovery_llm", return_value=_discovery_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.planner._call_planner_llm") as mock_planner_llm,
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.market._run_market_searches", return_value=([], [])),
        patch("graph.legal._run_legal_searches", return_value=[]),
    ):
        _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm)

        initial = _make_initial_state()
        result = run_analysis(initial)

        assert result["pdf_texts"] == initial.pdf_texts
        assert result["pdf_sources"] == initial.pdf_sources


def test_run_analysis_market_and_legal_run_in_parallel():
    """Market and legal nodes should both receive the planner's output."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "", "html": ""}),
        patch("graph.discovery._call_discovery_llm", return_value=_discovery_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.planner._call_planner_llm") as mock_planner_llm,
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.market._run_market_searches", return_value=([], [])),
        patch("graph.legal._run_legal_searches", return_value=[]),
    ):
        _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm)

        result = run_analysis(_make_initial_state())

        assert result["market_result"] is not None
        assert result["legal_result"] is not None


# ---------------------------------------------------------------------------
# Edge case tests
# ---------------------------------------------------------------------------


def test_run_analysis_with_empty_pdf_text():
    """Workflow should handle empty PDF text (planner returns empty metadata)."""
    with (
        patch("graph.discovery.scrape_page", new_callable=AsyncMock, return_value={"url": "https://test.com", "title": "", "html": ""}),
        patch("graph.discovery._call_discovery_llm", return_value=_discovery_response()),
        patch("graph.discovery.download_pdfs", new_callable=AsyncMock, return_value=[]),
        patch("graph.market._call_market_llm") as mock_market_llm,
        patch("graph.legal._call_legal_llm") as mock_legal_llm,
        patch("graph.market._run_market_searches", return_value=([], [])),
        patch("graph.legal._run_legal_searches", return_value=[]),
    ):
        _setup_llm_mocks(None, mock_market_llm, mock_legal_llm)

        state = AuctionState(pdf_texts="", pdf_sources=[])
        result = run_analysis(state)

        assert isinstance(result, dict)
        assert "errors" in result


# ---------------------------------------------------------------------------
# Helpers for LLM mock setup
# ---------------------------------------------------------------------------


def _planner_response():
    """Build a MagicMock LLM response for the planner."""
    mock = MagicMock()
    mock.choices = [
        MagicMock(
            message=MagicMock(
                content=json.dumps({
                    "property_metadata": {
                        "address": "Rua das Flores, 123, Centro, Sao Paulo - SP",
                        "property_type": "Apartamento",
                        "area_m2": 80.0,
                        "auction_price": 350000.0,
                        "market_value_estimate": 500000.0,
                        "auction_date": "15/06/2025",
                        "auction_type": "Judicial",
                        "matricula": "123.456",
                        "court_or_leiloeiro": "Joao da Silva",
                        "city": "Sao Paulo",
                        "neighborhood": "Centro",
                        "state": "SP",
                    },
                    "research_plan": "Research market prices in Centro, Sao Paulo.",
                })
            )
        )
    ]
    return mock


def _market_response():
    """Build a MagicMock LLM response for the market node."""
    mock = MagicMock()
    mock.choices = [
        MagicMock(
            message=MagicMock(
                content=json.dumps({
                    "price_per_m2_neighborhood": 12000.0,
                    "price_per_m2_city": 9500.0,
                    "comparable_properties": [],
                    "reform_estimate": 25000.0,
                    "area_appreciation_1y": 5.0,
                    "area_appreciation_3y": 15.0,
                    "area_appreciation_5y": 30.0,
                    "city_appreciation_1y": 4.0,
                    "liquidity_days": 45,
                    "tendencies": "Mercado em alta",
                    "discount_percentage": 30.0,
                    "market_score": 7,
                    "raw_findings": "Test findings",
                })
            )
        )
    ]
    return mock


def _legal_response():
    """Build a MagicMock LLM response for the legal node."""
    mock = MagicMock()
    mock.choices = [
        MagicMock(
            message=MagicMock(
                content=json.dumps({
                    "registration_status": "Registrado",
                    "liens": [],
                    "judicial_disputes": [],
                    "tax_debts_iptu": "Nenhum debito",
                    "tax_debts_itbi": "Nenhum debito",
                    "condominium_debts": "N/A",
                    "federal_state_debts": "Nenhum debito",
                    "zoning_compliance": "Residencial - Conforme",
                    "construction_permits": "Habite-se concedido",
                    "occupation_status": "Desocupado",
                    "usufruct_rights": "Nenhum",
                    "risk_level": "low",
                    "risk_details": "No significant risks.",
                    "raw_findings": "Test findings",
                })
            )
        )
    ]
    return mock


def _setup_llm_mocks(mock_planner_llm, mock_market_llm, mock_legal_llm):
    """Configure all LLM mocks with default responses."""
    if mock_planner_llm is not None:
        mock_planner_llm.return_value = _planner_response()
    if mock_market_llm is not None:
        mock_market_llm.return_value = _market_response()
    if mock_legal_llm is not None:
        mock_legal_llm.return_value = _legal_response()
```

- [ ] **Step 3: Run workflow tests**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && python -m pytest tests/test_workflow.py -v`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
cd /Users/gdomingues/Documents/Gustavo/project/leilao
git add graph/workflow.py tests/test_workflow.py
git commit -m "feat: update workflow to use scoring + output nodes instead of reporter"
```

---

## Task 6: Update `app.py` — JSON output instead of HTML

**Files:**
- Modify: `app.py`
- Modify: `tests/test_app.py`

- [ ] **Step 1: Update `app.py`**

```python
# app.py
"""Gradio UI for Leilao AI - paste a URL or drag-and-drop PDFs, get analysis JSON."""

import json
from datetime import datetime
from pathlib import Path

import gradio as gr
from loguru import logger

from tools.pdf_parser import parse_pdf
from graph.state import AuctionState
from graph.workflow import run_analysis


def analyze_url(url: str) -> dict:
    """Analyze an auction from a URL and return structured JSON."""
    if not url or not url.strip():
        return {"error": "Please enter an auction URL."}

    url = url.strip()

    try:
        logger.info(f"Analyzing auction from URL: {url}")

        initial_state = AuctionState(auction_url=url)
        result = run_analysis(initial_state)

        result_json = result.get("result_json", "") if isinstance(result, dict) else getattr(result, "result_json", "")

        if not result_json:
            return {"error": "Analysis completed but no result was generated."}

        return json.loads(result_json)

    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        return {"error": f"Analysis failed: {e}"}


def analyze_pdfs(files):
    """Analyze uploaded PDFs and return structured JSON."""
    if not files:
        return {"error": "Please upload at least one PDF."}

    try:
        pdf_paths = [f for f in files]

        logger.info(f"Analyzing {len(pdf_paths)} document(s)")

        pdf_data = parse_pdf(pdf_paths)

        if not pdf_data["text"].strip():
            return {"error": "Could not extract text from the uploaded PDFs. They may be scanned images without OCR."}

        initial_state = AuctionState(
            pdf_texts=pdf_data["text"],
            pdf_sources=pdf_data["sources"],
        )

        result = run_analysis(initial_state)

        result_json = result.get("result_json", "") if isinstance(result, dict) else getattr(result, "result_json", "")

        if not result_json:
            return {"error": "Analysis completed but no result was generated."}

        return json.loads(result_json)

    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        return {"error": f"Analysis failed: {e}"}


with gr.Blocks(
    title="Leilao AI - Analise de Leilao de Imovel",
) as app:
    gr.Markdown("# Leilao AI - Analise de Leilao de Imovel")

    with gr.Tab("URL do Leilao"):
        gr.Markdown("Cole a URL do leilao (Caixa, leiloeiro, site judicial, etc.)")
        url_input = gr.Textbox(
            label="URL do Leilao",
            placeholder="https://leiloes.caixa.gov.br/leilao/...",
        )
        url_btn = gr.Button("Analisar", variant="primary")

    with gr.Tab("Upload PDFs"):
        gr.Markdown("Arraste os PDFs do leilao (edital, matricula, laudo, certidoes)")
        file_input = gr.File(
            label="PDFs do Leilao",
            file_count="multiple",
            file_types=[".pdf"],
        )
        pdf_btn = gr.Button("Analisar", variant="primary")

    gr.Markdown("### Resultado")
    result_output = gr.JSON(label="Resultado de Analise")

    url_btn.click(
        fn=analyze_url,
        inputs=url_input,
        outputs=result_output,
    )

    pdf_btn.click(
        fn=analyze_pdfs,
        inputs=file_input,
        outputs=result_output,
    )


if __name__ == "__main__":
    app.launch(server_name="0.0.0.0", server_port=7860)
```

- [ ] **Step 2: Update `tests/test_app.py`**

```python
# tests/test_app.py
"""Tests for the Gradio app entry points."""
from unittest.mock import patch

from graph.contracts import RiskFlags


def test_analyze_url_calls_workflow():
    """analyze_url should build AuctionState with auction_url and call run_analysis."""
    from app import analyze_url

    result_json = '{"id":"abc","score":87,"risk":{"j":"good","f":"good","l":"warn","o":"good"}}'
    with patch("app.run_analysis") as mock_run:
        mock_run.return_value = {"result_json": result_json}
        result = analyze_url("https://leiloes.caixa.gov.br/leilao/123")

    mock_run.assert_called_once()
    call_args = mock_run.call_args[0][0]
    assert call_args.auction_url == "https://leiloes.caixa.gov.br/leilao/123"
    assert result["score"] == 87


def test_analyze_url_no_url():
    """analyze_url with empty URL should return an error dict."""
    from app import analyze_url

    result = analyze_url("")
    assert "error" in result


def test_analyze_pdfs_calls_workflow():
    """analyze_pdfs should build AuctionState with pdf_texts and call run_analysis."""
    from app import analyze_pdfs

    result_json = '{"id":"abc","score":73,"risk":{"j":"warn","f":"good","l":"good","o":"warn"}}'
    with (
        patch("app.parse_pdf") as mock_parse,
        patch("app.run_analysis") as mock_run,
    ):
        mock_parse.return_value = {"text": "Edital de Leilao", "sources": ["edital.pdf"]}
        mock_run.return_value = {"result_json": result_json}

        result = analyze_pdfs(["/tmp/fake.pdf"])

    mock_run.assert_called_once()
    call_args = mock_run.call_args[0][0]
    assert call_args.pdf_texts == "Edital de Leilao"
    assert result["score"] == 73


def test_analyze_pdfs_no_files():
    """analyze_pdfs with no files should return an error dict."""
    from app import analyze_pdfs

    result = analyze_pdfs(None)
    assert "error" in result


def test_analyze_pdfs_empty_text():
    """analyze_pdfs with unparseable PDFs should return an error dict."""
    from app import analyze_pdfs

    with patch("app.parse_pdf") as mock_parse:
        mock_parse.return_value = {"text": "", "sources": []}
        result = analyze_pdfs(["/tmp/fake.pdf"])

    assert "error" in result
```

- [ ] **Step 3: Run app tests**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && python -m pytest tests/test_app.py -v`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
cd /Users/gdomingues/Documents/Gustavo/project/leilao
git add app.py tests/test_app.py
git commit -m "feat: update Gradio app to return JSON instead of HTML report"
```

---

## Task 7: Delete reporter and report module

**Files:**
- Delete: `graph/reporter.py`
- Delete: `report/generator.py`
- Delete: `report/templates/report.html`
- Delete: `report/__init__.py`
- Delete: `tests/test_reporter.py`

- [ ] **Step 1: Verify no imports reference reporter or report module**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && grep -r "from graph.reporter" --include="*.py" . && grep -r "from report" --include="*.py" . && grep -r "import reporter" --include="*.py" .`
Expected: No matches (all references already removed in previous tasks)

- [ ] **Step 2: Delete the files**

```bash
cd /Users/gdomingues/Documents/Gustavo/project/leilao
rm graph/reporter.py
rm report/generator.py
rm report/templates/report.html
rm report/__init__.py
rmdir report/templates
rmdir report
rm tests/test_reporter.py
```

- [ ] **Step 3: Run full test suite to confirm nothing is broken**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && python -m pytest tests/ -v --ignore=tests/test_web_scraper.py --ignore=tests/test_property_scraper.py --ignore=tests/test_discovery.py`
Expected: All PASS (skipping integration tests that need network)

- [ ] **Step 4: Commit**

```bash
cd /Users/gdomingues/Documents/Gustavo/project/leilao
git add -A
git commit -m "chore: remove reporter node and HTML report pipeline (replaced by JSON output)"
```

---

## Task 8: Run full test suite and fix any remaining issues

**Files:**
- Any files that need fixes

- [ ] **Step 1: Run the full test suite**

Run: `cd /Users/gdomingues/Documents/Gustavo/project/leilao && python -m pytest tests/ -v --ignore=tests/test_web_scraper.py --ignore=tests/test_property_scraper.py --ignore=tests/test_discovery.py`
Expected: All PASS

- [ ] **Step 2: If any tests fail, fix them and re-run**

Common issues to look for:
- `test_state.py::test_auction_state_defaults` still checking `report_html`
- Any remaining import of `graph.reporter` or `report.generator`
- `test_legal.py` or `test_market.py` referencing old state fields

- [ ] **Step 3: Final commit if fixes were needed**

```bash
cd /Users/gdomingues/Documents/Gustavo/project/leilao
git add -A
git commit -m "fix: resolve remaining test failures after output contract migration"
```
