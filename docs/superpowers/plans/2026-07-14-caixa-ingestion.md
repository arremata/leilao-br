# Caixa Structured Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest Caixa auction listings (starting with Paraná) from the official per-state CSV into a PostgreSQL catalog, and run the existing AI analysis lazily (on-demand) instead of per-URL.

**Architecture:** A pluggable source-adapter layer downloads and normalizes the Caixa CSV into a canonical `Property` row (no LLM). An ingestion orchestrator upserts rows and records change events. The existing LangGraph `market`/`legal`/`scoring`/`output` nodes are reused as an on-demand enrichment step that skips `discovery` and `planner` because the data is already structured. The current per-URL `/analyze` graph stays untouched as the generic fallback.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.0, PostgreSQL (SQLite in tests), Playwright (existing), httpx (Nominatim geocoding), pytest.

**Key facts (verified 2026-07-14):**
- No official public Caixa API. The structured bulk source is the per-state CSV: `https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_<UF>.csv`.
- CSV is **Latin-1 / ISO-8859-1**, delimiter `;`, with preamble lines before the header row. Columns: `N° do imóvel;UF;Cidade;Bairro;Endereço;Preço;Valor de avaliação;Desconto;Descrição;Modalidade de venda;Link de acesso`. No photos; full detail requires the detail page.
- Both the CSV directory and the portal are behind **Radware Bot Manager (CAPTCHA)** — a plain `curl`/`httpx` GET returns the CAPTCHA page, not the CSV. Automated fetch must go through the existing Playwright (stealth) browser. The CLI therefore also supports a `--file` path so a manually-downloaded CSV can be ingested without solving the gate.

**Conventions in this repo (follow them):**
- Package root is `backend/`. Modules import with bare names (`from graph.state import ...`, `from config import ...`). `backend/conftest.py` puts `backend/` on `sys.path`.
- Run tests from inside `backend/`: `cd backend && python -m pytest`.
- Nodes are plain sync functions taking `AuctionState` and returning a dict update (`market_node` → `{"market_result": ...}`, `legal_node` → `{"legal_result": ...}`, `scoring_node` → `{"scoring_result": ...}`). `build_result(state)` → `AuctionPropertyResult`.

**Deviations from the approved design (intentional, YAGNI):**
- **No Alembic in v1.** Schema is created with `Base.metadata.create_all()` via `init_db()`. This is greenfield (no DB exists yet). Alembic is deferred until the schema needs to evolve in production.
- **No seed→DB migration in v1.** The existing JSON seed / `/properties` / `/analyze` / Vercel demo path is left untouched so the demo keeps working. New catalog lives under new endpoints (`/catalog`, `/ingest`).
- Frontend integration is out of scope for this backend plan.

---

## File Structure

**Create:**
- `backend/db/__init__.py` — package marker.
- `backend/db/base.py` — `Base`, `get_engine()`, `init_db()`, `make_session_factory()`.
- `backend/db/models.py` — `Property`, `PropertyEvent`, `Enrichment`.
- `backend/ingestion/__init__.py` — package marker.
- `backend/ingestion/adapters/__init__.py` — package marker.
- `backend/ingestion/adapters/base.py` — `RawListing`, `NormalizedProperty`, `SourceAdapter` protocol.
- `backend/ingestion/normalize.py` — `parse_brl_number`, `compute_discount`, `parse_description`, `map_modalidade`.
- `backend/ingestion/adapters/caixa_csv.py` — `CAIXA_HEADER_MAP`, `parse_caixa_csv`, `CaixaCsvAdapter`.
- `backend/ingestion/adapters/caixa_detail.py` — `parse_detail_html`, `fetch_detail`.
- `backend/ingestion/geocode.py` — `NominatimClient`.
- `backend/ingestion/run.py` — `IngestSummary`, `ingest`, `main` (CLI `__main__`).
- `backend/enrichment/__init__.py` — package marker.
- `backend/enrichment/run.py` — `metadata_from_property`, `run_structured_enrichment`.
- Tests: `backend/tests/test_db_models.py`, `test_normalize.py`, `test_caixa_csv.py`, `test_caixa_fetch.py`, `test_geocode.py`, `test_ingestion_run.py`, `test_enrichment.py`, `test_caixa_detail.py`, `test_api_catalog.py`.

**Modify:**
- `backend/requirements.txt` — add `sqlalchemy`, `psycopg[binary]`, `httpx`.
- `backend/api.py` — add DB startup wiring, `get_session` dependency, and endpoints `POST /ingest`, `GET /catalog`, `GET /catalog/{prop_id}`, `POST /catalog/{prop_id}/analyze`.

---

## Task 1: Dependencies + DB base

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/db/__init__.py`, `backend/db/base.py`
- Test: `backend/tests/test_db_models.py` (created here, expanded in Task 2)

- [ ] **Step 1: Add dependencies**

Edit `backend/requirements.txt`, appending these lines after the last line (`uvicorn>=0.30.0`):

```
sqlalchemy>=2.0.0
psycopg[binary]>=3.2.0
httpx>=0.27.0
```

- [ ] **Step 2: Install dependencies**

Run: `cd backend && pip install -r requirements.txt`
Expected: installs succeed (sqlalchemy, psycopg, httpx present).

- [ ] **Step 3: Create the package marker**

Create `backend/db/__init__.py`:

```python
```

(empty file)

- [ ] **Step 4: Write the failing test for the engine/session helpers**

Create `backend/tests/test_db_models.py`:

```python
from sqlalchemy import inspect

from db.base import Base, get_engine, init_db, make_session_factory


def test_sqlite_memory_engine_and_init_db_creates_no_error():
    engine = get_engine("sqlite://")
    # No tables registered on Base yet is fine; init_db must not raise.
    init_db(engine)
    assert inspect(engine) is not None


def test_make_session_factory_yields_working_session():
    engine = get_engine("sqlite://")
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        assert session.execute.__call__ is not None
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_db_models.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'db.base'`.

- [ ] **Step 6: Implement `db/base.py`**

Create `backend/db/base.py`:

```python
"""SQLAlchemy engine/session helpers and declarative Base.

Schema is created via init_db() (create_all) — no Alembic in v1.
Production points DATABASE_URL at Postgres; tests use in-memory SQLite.
"""

from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

DEFAULT_DATABASE_URL = "sqlite:///./leilao.db"


class Base(DeclarativeBase):
    pass


def get_engine(url: str | None = None) -> Engine:
    """Create an Engine. Uses DATABASE_URL env var, or the passed url, or a
    local sqlite file. In-memory sqlite ('sqlite://') uses a StaticPool so a
    single shared connection survives across sessions (needed for tests)."""
    resolved = url or os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)
    if resolved in ("sqlite://", "sqlite:///:memory:"):
        return create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    return create_engine(resolved)


def init_db(engine: Engine) -> None:
    """Create all tables registered on Base.metadata."""
    # Import models so they register on Base.metadata before create_all.
    from db import models  # noqa: F401

    Base.metadata.create_all(engine)


def make_session_factory(engine: Engine) -> sessionmaker:
    return sessionmaker(bind=engine, expire_on_commit=False)
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_db_models.py -v`
Expected: PASS (2 passed).

- [ ] **Step 8: Commit**

```bash
git add backend/requirements.txt backend/db/__init__.py backend/db/base.py backend/tests/test_db_models.py
git commit -m "feat(db): add SQLAlchemy engine/session base for ingestion"
```

---

## Task 2: Database models

**Files:**
- Create: `backend/db/models.py`
- Test: `backend/tests/test_db_models.py` (extend)

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_db_models.py`:

```python
from datetime import datetime, timezone

from db.models import Property, PropertyEvent, Enrichment


def _session():
    engine = get_engine("sqlite://")
    init_db(engine)
    return make_session_factory(engine)()


def test_property_roundtrip_and_unique_constraint():
    session = _session()
    now = datetime.now(timezone.utc)
    p = Property(
        source="caixa", source_id="123", uf="PR", city="Curitiba",
        neighborhood="Centro", address="Rua XV, 100", preco=150000.0,
        avaliacao=250000.0, desconto_oficial=40.0, modalidade="Venda Online",
        descricao_raw="Apartamento", detail_url="http://x", status="active",
        first_seen_at=now, last_seen_at=now, raw_payload={"a": 1},
    )
    session.add(p)
    session.commit()
    fetched = session.get(Property, p.id)
    assert fetched.source_id == "123"
    assert fetched.raw_payload == {"a": 1}
    assert fetched.geocode_status == "pending"


def test_property_event_and_enrichment_relations():
    session = _session()
    now = datetime.now(timezone.utc)
    p = Property(source="caixa", source_id="9", uf="PR", address="Rua A",
                 preco=1.0, first_seen_at=now, last_seen_at=now)
    session.add(p)
    session.flush()
    session.add(PropertyEvent(property_id=p.id, event_type="new", new_value="1.0"))
    session.add(Enrichment(property_id=p.id, result_json="{}", pipeline_version="v1"))
    session.commit()
    ev = session.query(PropertyEvent).filter_by(property_id=p.id).one()
    assert ev.event_type == "new"
    enr = session.query(Enrichment).filter_by(property_id=p.id).one()
    assert enr.pipeline_version == "v1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_db_models.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'db.models'`.

- [ ] **Step 3: Implement `db/models.py`**

Create `backend/db/models.py`:

```python
"""Canonical catalog models: Property, PropertyEvent, Enrichment."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    JSON, Float, ForeignKey, Integer, String, Text, UniqueConstraint, DateTime,
)
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Property(Base):
    __tablename__ = "properties"
    __table_args__ = (UniqueConstraint("source", "source_id", name="uq_source_source_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(32), index=True)
    source_id: Mapped[str] = mapped_column(String(64), index=True)

    uf: Mapped[Optional[str]] = mapped_column(String(2), index=True, default=None)
    city: Mapped[Optional[str]] = mapped_column(String(128), default=None)
    neighborhood: Mapped[Optional[str]] = mapped_column(String(128), default=None)
    address: Mapped[str] = mapped_column(Text, default="")

    lat: Mapped[Optional[float]] = mapped_column(Float, default=None)
    lng: Mapped[Optional[float]] = mapped_column(Float, default=None)
    geocode_status: Mapped[str] = mapped_column(String(16), default="pending")

    property_type: Mapped[Optional[str]] = mapped_column(String(64), default=None)
    area_m2: Mapped[Optional[float]] = mapped_column(Float, default=None)
    beds: Mapped[Optional[int]] = mapped_column(Integer, default=None)

    preco: Mapped[float] = mapped_column(Float, default=0.0)
    avaliacao: Mapped[Optional[float]] = mapped_column(Float, default=None)
    desconto_oficial: Mapped[Optional[float]] = mapped_column(Float, default=None)
    modalidade: Mapped[Optional[str]] = mapped_column(String(64), default=None)

    descricao_raw: Mapped[str] = mapped_column(Text, default="")
    detail_url: Mapped[str] = mapped_column(Text, default="")
    detail_fetched: Mapped[bool] = mapped_column(default=False)
    photo_url: Mapped[Optional[str]] = mapped_column(Text, default=None)

    status: Mapped[str] = mapped_column(String(16), default="active", index=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    raw_payload: Mapped[Optional[dict]] = mapped_column(JSON, default=None)


class PropertyEvent(Base):
    __tablename__ = "property_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(32))
    old_value: Mapped[Optional[str]] = mapped_column(Text, default=None)
    new_value: Mapped[Optional[str]] = mapped_column(Text, default=None)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class Enrichment(Base):
    __tablename__ = "enrichments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), unique=True, index=True)
    result_json: Mapped[str] = mapped_column(Text)
    pipeline_version: Mapped[str] = mapped_column(String(16), default="v1")
    computed_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_db_models.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/db/models.py backend/tests/test_db_models.py
git commit -m "feat(db): add Property, PropertyEvent, Enrichment models"
```

---

## Task 3: Adapter interfaces

**Files:**
- Create: `backend/ingestion/__init__.py`, `backend/ingestion/adapters/__init__.py`, `backend/ingestion/adapters/base.py`
- Test: `backend/tests/test_caixa_csv.py` (created here, expanded in Task 6-7)

- [ ] **Step 1: Create package markers**

Create `backend/ingestion/__init__.py`:

```python
```

Create `backend/ingestion/adapters/__init__.py`:

```python
```

(both empty)

- [ ] **Step 2: Write the failing test**

Create `backend/tests/test_caixa_csv.py`:

```python
from ingestion.adapters.base import RawListing, NormalizedProperty


def test_raw_listing_holds_source_and_dict():
    raw = RawListing(source="caixa", source_id="42", raw={"UF": "PR"})
    assert raw.source == "caixa"
    assert raw.source_id == "42"
    assert raw.raw["UF"] == "PR"


def test_normalized_property_defaults():
    n = NormalizedProperty(source="caixa", source_id="42", uf="PR", address="Rua A")
    assert n.preco == 0.0
    assert n.beds is None
    assert n.raw == {}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_caixa_csv.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ingestion.adapters.base'`.

- [ ] **Step 4: Implement `ingestion/adapters/base.py`**

Create `backend/ingestion/adapters/base.py`:

```python
"""Source-adapter contracts shared by all ingestion sources."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Protocol, runtime_checkable


@dataclass
class RawListing:
    """One raw record straight from a source, before normalization."""
    source: str
    source_id: str
    raw: dict = field(default_factory=dict)


@dataclass
class NormalizedProperty:
    """Canonical shape written to the `properties` table."""
    source: str
    source_id: str
    uf: Optional[str] = None
    city: Optional[str] = None
    neighborhood: Optional[str] = None
    address: str = ""
    property_type: Optional[str] = None
    area_m2: Optional[float] = None
    beds: Optional[int] = None
    preco: float = 0.0
    avaliacao: Optional[float] = None
    desconto_oficial: Optional[float] = None
    modalidade: Optional[str] = None
    descricao_raw: str = ""
    detail_url: str = ""
    photo_url: Optional[str] = None
    raw: dict = field(default_factory=dict)


@runtime_checkable
class SourceAdapter(Protocol):
    source: str
    uf: Optional[str]

    def fetch_raw(self) -> list[RawListing]: ...
    def normalize(self, raw: RawListing) -> NormalizedProperty: ...
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_caixa_csv.py -v`
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/ingestion/__init__.py backend/ingestion/adapters/__init__.py backend/ingestion/adapters/base.py backend/tests/test_caixa_csv.py
git commit -m "feat(ingestion): add source-adapter contracts"
```

---

## Task 4: Normalize helpers — BR number parsing + discount

**Files:**
- Create: `backend/ingestion/normalize.py`
- Test: `backend/tests/test_normalize.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_normalize.py`:

```python
import pytest

from ingestion.normalize import parse_brl_number, compute_discount


@pytest.mark.parametrize("text,expected", [
    ("150.000,00", 150000.00),
    ("68.816,17", 68816.17),
    ("90000", 90000.0),
    ("1.200.000,50", 1200000.50),
    ("R$ 250.000,00", 250000.00),
    ("", 0.0),
    ("n/a", 0.0),
])
def test_parse_brl_number(text, expected):
    assert parse_brl_number(text) == pytest.approx(expected)


def test_compute_discount_normal():
    assert compute_discount(150000.0, 250000.0) == pytest.approx(40.0)


def test_compute_discount_zero_appraisal_returns_none():
    assert compute_discount(150000.0, 0.0) is None
    assert compute_discount(150000.0, None) is None


def test_compute_discount_negative_clamped_to_zero():
    # preco above avaliacao -> no discount, not a negative number
    assert compute_discount(300000.0, 250000.0) == 0.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_normalize.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ingestion.normalize'`.

- [ ] **Step 3: Implement the two helpers**

Create `backend/ingestion/normalize.py`:

```python
"""Pure normalization helpers for ingested rows (no I/O, no LLM)."""

from __future__ import annotations

import re
import unicodedata
from typing import Optional


def parse_brl_number(text: str) -> float:
    """Parse a Brazilian-formatted number ('150.000,00', 'R$ 68.816,17', '90000')
    into a float. Returns 0.0 for empty/unparseable input."""
    if not text:
        return 0.0
    match = re.search(r"[\d.,]+", str(text))
    if not match:
        return 0.0
    raw = match.group(0)
    if re.search(r",\d{1,2}$", raw):
        # Brazilian decimal: dots are thousands separators, comma is decimal.
        raw = raw.replace(".", "").replace(",", ".")
    else:
        raw = raw.replace(",", "")
    try:
        return float(raw)
    except ValueError:
        return 0.0


def compute_discount(preco: float, avaliacao: Optional[float]) -> Optional[float]:
    """Desconto oficial = (1 - preco/avaliacao) * 100, rounded to 2 decimals.
    Returns None when the appraisal is missing/zero; clamps negatives to 0."""
    if not avaliacao or avaliacao <= 0:
        return None
    pct = (1 - (preco / avaliacao)) * 100
    return round(max(pct, 0.0), 2)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_normalize.py -v`
Expected: PASS (10 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/ingestion/normalize.py backend/tests/test_normalize.py
git commit -m "feat(ingestion): add BR number parsing and discount computation"
```

---

## Task 5: Normalize helpers — description parser

**Files:**
- Modify: `backend/ingestion/normalize.py`
- Test: `backend/tests/test_normalize.py` (extend)

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_normalize.py`:

```python
from ingestion.normalize import parse_description


def test_parse_description_apartment_with_area_and_beds():
    d = parse_description(
        "Apartamento, CENTRO, CURITIBA, com área privativa de 65,00 m2, 2 quartos."
    )
    assert d["property_type"] == "Apartamento"
    assert d["area_m2"] == pytest.approx(65.0)
    assert d["beds"] == 2


def test_parse_description_house_total_area():
    d = parse_description("Casa, JARDIM, LONDRINA, área total 120,00 m2, 3 quartos.")
    assert d["property_type"] == "Casa"
    assert d["area_m2"] == pytest.approx(120.0)
    assert d["beds"] == 3


def test_parse_description_terreno_no_beds():
    d = parse_description("Terreno, ZONA RURAL, área total 500,00 m2.")
    assert d["property_type"] == "Terreno"
    assert d["area_m2"] == pytest.approx(500.0)
    assert d["beds"] is None


def test_parse_description_empty():
    d = parse_description("")
    assert d == {"property_type": None, "area_m2": None, "beds": None}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_normalize.py -v`
Expected: FAIL with `ImportError: cannot import name 'parse_description'`.

- [ ] **Step 3: Implement `parse_description`**

Append to `backend/ingestion/normalize.py`:

```python
_KNOWN_TYPES = [
    "Apartamento", "Casa", "Terreno", "Loja", "Sala", "Galpão",
    "Gleba", "Prédio", "Sobrado", "Imóvel", "Comercial", "Chácara",
]


def _strip_accents(text: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c)
    )


def parse_description(desc: str) -> dict:
    """Best-effort extraction of property_type, area_m2 and beds from the
    free-text Caixa description. Missing fields come back as None."""
    result = {"property_type": None, "area_m2": None, "beds": None}
    if not desc:
        return result

    flat = _strip_accents(desc).lower()

    for t in _KNOWN_TYPES:
        if _strip_accents(t).lower() in flat:
            result["property_type"] = t
            break

    # Area: prefer 'privativa', fall back to 'total', then any 'm2' number.
    area = None
    for pattern in (
        r"area privativa[^0-9]*([\d.,]+)\s*m",
        r"area total[^0-9]*([\d.,]+)\s*m",
        r"([\d.,]+)\s*m2",
        r"([\d.,]+)\s*m²",
    ):
        m = re.search(pattern, flat)
        if m:
            area = parse_brl_number(m.group(1))
            break
    result["area_m2"] = area if area else None

    beds_match = re.search(r"(\d+)\s*(?:quarto|dormit)", flat)
    if beds_match:
        result["beds"] = int(beds_match.group(1))

    return result
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_normalize.py -v`
Expected: PASS (14 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/ingestion/normalize.py backend/tests/test_normalize.py
git commit -m "feat(ingestion): parse property type/area/beds from description"
```

---

## Task 6: Modalidade mapping + Caixa row normalization

**Files:**
- Modify: `backend/ingestion/normalize.py`
- Create: `backend/ingestion/adapters/caixa_csv.py`
- Test: `backend/tests/test_normalize.py` (extend), `backend/tests/test_caixa_csv.py` (extend)

- [ ] **Step 1: Write the failing test for `map_modalidade`**

Append to `backend/tests/test_normalize.py`:

```python
from ingestion.normalize import map_modalidade


@pytest.mark.parametrize("raw,expected", [
    ("Venda Online", "Venda Direta Online"),
    ("Leilão SFI - Edital Único", "Leilão SFI"),
    ("Licitação Aberta", "Licitação Aberta"),
    ("Venda Direta", "Venda Direta Online"),
    ("", "Outros"),
    ("qualquer coisa", "Outros"),
])
def test_map_modalidade(raw, expected):
    assert map_modalidade(raw) == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_normalize.py -k map_modalidade -v`
Expected: FAIL with `ImportError: cannot import name 'map_modalidade'`.

- [ ] **Step 3: Implement `map_modalidade`**

Append to `backend/ingestion/normalize.py`:

```python
def map_modalidade(raw: str) -> str:
    """Map the Caixa 'Modalidade de venda' free text to a stable enum-ish label."""
    if not raw:
        return "Outros"
    low = _strip_accents(raw).lower()
    if "leilao" in low or "sfi" in low:
        return "Leilão SFI"
    if "licita" in low:
        return "Licitação Aberta"
    if "venda direta" in low or "online" in low:
        return "Venda Direta Online"
    return "Outros"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_normalize.py -k map_modalidade -v`
Expected: PASS (6 passed).

- [ ] **Step 5: Write the failing test for `CaixaCsvAdapter.normalize`**

Append to `backend/tests/test_caixa_csv.py`:

```python
from ingestion.adapters.caixa_csv import CaixaCsvAdapter


def _raw_row():
    return RawListing(
        source="caixa",
        source_id="8444401234567",
        raw={
            "source_id": "8444401234567",
            "uf": "PR",
            "city": "CURITIBA",
            "neighborhood": "CENTRO",
            "address": "RUA XV DE NOVEMBRO, N. 100, APT 302",
            "preco": "150.000,00",
            "avaliacao": "250.000,00",
            "desconto_csv": "40,00000",
            "descricao": "Apartamento, CENTRO, CURITIBA, com área privativa de 65,00 m2, 2 quartos.",
            "modalidade": "Venda Online",
            "detail_url": "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=8444401234567",
        },
    )


def test_normalize_maps_caixa_row_to_canonical():
    adapter = CaixaCsvAdapter(uf="PR")
    n = adapter.normalize(_raw_row())
    assert n.source == "caixa"
    assert n.source_id == "8444401234567"
    assert n.uf == "PR"
    assert n.city == "CURITIBA"
    assert n.neighborhood == "CENTRO"
    assert n.preco == 150000.0
    assert n.avaliacao == 250000.0
    assert n.desconto_oficial == 40.0
    assert n.property_type == "Apartamento"
    assert n.area_m2 == 65.0
    assert n.beds == 2
    assert n.modalidade == "Venda Direta Online"
    assert "detalhe-imovel.asp" in n.detail_url
    assert n.address.startswith("RUA XV")
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_caixa_csv.py -k normalize -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ingestion.adapters.caixa_csv'`.

- [ ] **Step 7: Implement the adapter skeleton + `normalize`**

Create `backend/ingestion/adapters/caixa_csv.py`:

```python
"""Caixa CSV source adapter.

The per-state CSV lives at
https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_<UF>.csv
It is Latin-1 encoded, ';'-delimited, with preamble lines before the header.
Both the file and the portal sit behind Radware Bot Manager, so automated
fetching must go through the existing Playwright (stealth) browser. Callers may
also inject csv_bytes (e.g. a manually downloaded file) to bypass fetching.
"""

from __future__ import annotations

from typing import Optional

from ingestion.adapters.base import NormalizedProperty, RawListing
from ingestion.normalize import (
    compute_discount, map_modalidade, parse_brl_number, parse_description,
)

CSV_URL_TEMPLATE = "https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_{uf}.csv"

# Maps normalized (lower/stripped) CSV headers -> canonical raw keys.
CAIXA_HEADER_MAP = {
    "n° do imóvel": "source_id",
    "n° do imovel": "source_id",
    "nº do imóvel": "source_id",
    "numero do imovel": "source_id",
    "uf": "uf",
    "cidade": "city",
    "bairro": "neighborhood",
    "endereço": "address",
    "endereco": "address",
    "preço": "preco",
    "preco": "preco",
    "valor de avaliação": "avaliacao",
    "valor de avaliacao": "avaliacao",
    "desconto": "desconto_csv",
    "descrição": "descricao",
    "descricao": "descricao",
    "modalidade de venda": "modalidade",
    "link de acesso": "detail_url",
}


class CaixaCsvAdapter:
    source = "caixa"

    def __init__(self, uf: str, csv_bytes: Optional[bytes] = None):
        self.uf = uf.upper()
        self._csv_bytes = csv_bytes

    def normalize(self, raw: RawListing) -> NormalizedProperty:
        r = raw.raw
        preco = parse_brl_number(r.get("preco", ""))
        avaliacao_val = parse_brl_number(r.get("avaliacao", ""))
        avaliacao = avaliacao_val if avaliacao_val > 0 else None
        desc = parse_description(r.get("descricao", ""))
        return NormalizedProperty(
            source=self.source,
            source_id=raw.source_id,
            uf=(r.get("uf") or self.uf or "").strip().upper() or None,
            city=(r.get("city") or "").strip() or None,
            neighborhood=(r.get("neighborhood") or "").strip() or None,
            address=(r.get("address") or "").strip(),
            property_type=desc["property_type"],
            area_m2=desc["area_m2"],
            beds=desc["beds"],
            preco=preco,
            avaliacao=avaliacao,
            desconto_oficial=compute_discount(preco, avaliacao),
            modalidade=map_modalidade(r.get("modalidade", "")),
            descricao_raw=(r.get("descricao") or "").strip(),
            detail_url=(r.get("detail_url") or "").strip(),
            raw=r,
        )
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_caixa_csv.py -k normalize tests/test_normalize.py -v`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/ingestion/normalize.py backend/ingestion/adapters/caixa_csv.py backend/tests/test_normalize.py backend/tests/test_caixa_csv.py
git commit -m "feat(ingestion): map modalidade and normalize Caixa rows"
```

---

## Task 7: Parse Caixa CSV bytes into RawListings

**Files:**
- Modify: `backend/ingestion/adapters/caixa_csv.py`
- Test: `backend/tests/test_caixa_csv.py` (extend)

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_caixa_csv.py`:

```python
from ingestion.adapters.caixa_csv import parse_caixa_csv

SAMPLE_CSV_TEXT = (
    "Lista de Imóveis Caixa\n"
    "\n"
    "N° do imóvel;UF;Cidade;Bairro;Endereço;Preço;Valor de avaliação;Desconto;"
    "Descrição;Modalidade de venda;Link de acesso\n"
    "8444401234567;PR;CURITIBA;CENTRO;RUA XV DE NOVEMBRO, N. 100, APT 302;"
    "150.000,00;250.000,00;40,00000;"
    "Apartamento, CENTRO, CURITIBA, com área privativa de 65,00 m2, 2 quartos.;"
    "Venda Online;"
    "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=8444401234567\n"
    "8444407654321;PR;LONDRINA;JARDIM;RUA A, N. 50;90.000,00;90.000,00;0,00000;"
    "Casa, JARDIM, LONDRINA, área total 120,00 m2, 3 quartos.;"
    "Leilão SFI - Edital Único;"
    "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=8444407654321\n"
)


def test_parse_caixa_csv_extracts_rows_with_latin1_bytes():
    raw_bytes = SAMPLE_CSV_TEXT.encode("latin-1")
    rows = parse_caixa_csv(raw_bytes)
    assert len(rows) == 2
    first = rows[0]
    assert first.source == "caixa"
    assert first.source_id == "8444401234567"
    assert first.raw["city"] == "CURITIBA"
    assert first.raw["preco"] == "150.000,00"
    assert first.raw["modalidade"] == "Venda Online"


def test_parse_caixa_csv_skips_preamble_and_blank_rows():
    raw_bytes = (SAMPLE_CSV_TEXT + "\n\n").encode("latin-1")
    rows = parse_caixa_csv(raw_bytes)
    assert all(r.source_id for r in rows)
    assert len(rows) == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_caixa_csv.py -k parse_caixa_csv -v`
Expected: FAIL with `ImportError: cannot import name 'parse_caixa_csv'`.

- [ ] **Step 3: Implement `parse_caixa_csv`**

Add these imports at the top of `backend/ingestion/adapters/caixa_csv.py` (below the existing imports):

```python
import unicodedata
```

Append to `backend/ingestion/adapters/caixa_csv.py`:

```python
def _norm_header(cell: str) -> str:
    flat = unicodedata.normalize("NFKD", cell).strip().lower()
    return flat


def _is_header_row(cells: list[str]) -> bool:
    normalized = {_norm_header(c) for c in cells}
    return "uf" in normalized and any(
        h in normalized for h in ("cidade", "n° do imóvel", "nº do imóvel", "numero do imovel")
    )


def parse_caixa_csv(raw: bytes) -> list[RawListing]:
    """Decode Latin-1 CSV bytes, locate the header row, and return one
    RawListing per data row keyed by canonical raw keys (see CAIXA_HEADER_MAP)."""
    text = raw.decode("latin-1", errors="replace")
    lines = [ln for ln in text.splitlines()]

    header_idx = None
    header_keys: list[str] = []
    for i, line in enumerate(lines):
        cells = line.split(";")
        if _is_header_row(cells):
            header_idx = i
            header_keys = [CAIXA_HEADER_MAP.get(_norm_header(c), _norm_header(c)) for c in cells]
            break

    if header_idx is None:
        return []

    listings: list[RawListing] = []
    for line in lines[header_idx + 1:]:
        if not line.strip():
            continue
        cells = line.split(";")
        row = {}
        for key, value in zip(header_keys, cells):
            row[key] = value.strip()
        source_id = row.get("source_id", "").strip()
        if not source_id:
            continue
        listings.append(RawListing(source="caixa", source_id=source_id, raw=row))
    return listings
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_caixa_csv.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/ingestion/adapters/caixa_csv.py backend/tests/test_caixa_csv.py
git commit -m "feat(ingestion): parse Caixa CSV bytes into raw listings"
```

---

## Task 8: Caixa CSV fetch (Playwright / file injection)

**Files:**
- Modify: `backend/ingestion/adapters/caixa_csv.py`
- Test: `backend/tests/test_caixa_fetch.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_caixa_fetch.py`:

```python
from ingestion.adapters.caixa_csv import CaixaCsvAdapter, SAMPLE_TEST_MARKER  # noqa

SAMPLE = (
    "N° do imóvel;UF;Cidade;Bairro;Endereço;Preço;Valor de avaliação;Desconto;"
    "Descrição;Modalidade de venda;Link de acesso\n"
    "111;PR;CURITIBA;CENTRO;RUA A, 1;10.000,00;20.000,00;50,0;"
    "Casa, CENTRO, área total 50,00 m2, 1 quarto.;Venda Online;http://x\n"
)


def test_fetch_raw_uses_injected_bytes_without_playwright():
    adapter = CaixaCsvAdapter(uf="PR", csv_bytes=SAMPLE.encode("latin-1"))
    rows = adapter.fetch_raw()
    assert len(rows) == 1
    assert rows[0].source_id == "111"


def test_csv_url_for_uf():
    adapter = CaixaCsvAdapter(uf="pr")
    assert adapter.csv_url() == (
        "https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_PR.csv"
    )
```

Note: `SAMPLE_TEST_MARKER` does not exist — that import line is deliberately part of the test scaffold and must be removed in Step 3 once the module exists. (Kept here so Step 2 shows a clean import failure.) Replace the first line with `from ingestion.adapters.caixa_csv import CaixaCsvAdapter` before Step 4.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_caixa_fetch.py -v`
Expected: FAIL with `ImportError` (SAMPLE_TEST_MARKER not defined) / `AttributeError: 'CaixaCsvAdapter' object has no attribute 'fetch_raw'`.

- [ ] **Step 3: Fix the test import and implement fetch**

First, edit `backend/tests/test_caixa_fetch.py` line 1 to:

```python
from ingestion.adapters.caixa_csv import CaixaCsvAdapter
```

Then add these imports at the top of `backend/ingestion/adapters/caixa_csv.py`:

```python
import asyncio

from loguru import logger
from playwright.async_api import async_playwright
from playwright_stealth import Stealth
```

Then add these methods to the `CaixaCsvAdapter` class in `backend/ingestion/adapters/caixa_csv.py`:

```python
    def csv_url(self) -> str:
        return CSV_URL_TEMPLATE.format(uf=self.uf)

    def fetch_raw(self) -> list[RawListing]:
        raw = self._csv_bytes if self._csv_bytes is not None else asyncio.run(self._download())
        return parse_caixa_csv(raw)

    async def _download(self) -> bytes:
        """Fetch the CSV through a stealth browser context so the Radware bot
        manager sees a real browser session. Visits the download page first to
        pick up cookies, then requests the CSV via the browser's request API."""
        pw = await async_playwright().start()
        try:
            browser = await pw.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1920, "height": 1080},
            )
            page = await context.new_page()
            await Stealth().apply_stealth_async(page)
            await page.goto(
                "https://venda-imoveis.caixa.gov.br/sistema/download-lista.asp",
                wait_until="domcontentloaded",
                timeout=30000,
            )
            await page.wait_for_timeout(4000)
            resp = await context.request.get(self.csv_url(), timeout=30000)
            body = await resp.body()
            await browser.close()
            return body
        except Exception as e:  # pragma: no cover - network dependent
            logger.error(f"Caixa CSV download failed for {self.uf}: {e}")
            return b""
        finally:
            await pw.stop()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_caixa_fetch.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/ingestion/adapters/caixa_csv.py backend/tests/test_caixa_fetch.py
git commit -m "feat(ingestion): fetch Caixa CSV via Playwright with file fallback"
```

---

## Task 9: Nominatim geocoder

**Files:**
- Create: `backend/ingestion/geocode.py`
- Test: `backend/tests/test_geocode.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_geocode.py`:

```python
from ingestion.geocode import NominatimClient


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeHttpClient:
    def __init__(self, payload):
        self._payload = payload
        self.calls = []

    def get(self, url, params=None, headers=None, timeout=None):
        self.calls.append({"url": url, "params": params, "headers": headers})
        return _FakeResponse(self._payload)


def test_geocode_returns_lat_lng():
    fake = _FakeHttpClient([{"lat": "-25.4284", "lon": "-49.2733"}])
    client = NominatimClient(http_client=fake, min_interval_s=0)
    coords = client.geocode("Rua XV de Novembro, Curitiba, PR")
    assert coords == (-25.4284, -49.2733)
    assert "User-Agent" in fake.calls[0]["headers"]
    assert fake.calls[0]["params"]["countrycodes"] == "br"


def test_geocode_returns_none_on_empty_result():
    fake = _FakeHttpClient([])
    client = NominatimClient(http_client=fake, min_interval_s=0)
    assert client.geocode("endereço inexistente") is None


def test_geocode_returns_none_for_blank_address():
    fake = _FakeHttpClient([{"lat": "1", "lon": "2"}])
    client = NominatimClient(http_client=fake, min_interval_s=0)
    assert client.geocode("") is None
    assert fake.calls == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_geocode.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ingestion.geocode'`.

- [ ] **Step 3: Implement `NominatimClient`**

Create `backend/ingestion/geocode.py`:

```python
"""Nominatim (OpenStreetMap) geocoder.

Nominatim's usage policy requires an identifying User-Agent and at most ~1
request/second. `min_interval_s` throttles calls; tests pass 0 to disable.
"""

from __future__ import annotations

import time
from typing import Optional

USER_AGENT = "leilao-ai/1.0 (auction catalog ingestion)"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"


class NominatimClient:
    def __init__(self, http_client=None, min_interval_s: float = 1.0):
        if http_client is None:
            import httpx

            http_client = httpx.Client()
        self._http = http_client
        self._min_interval = min_interval_s
        self._last_call = 0.0

    def _throttle(self) -> None:
        if self._min_interval <= 0:
            return
        elapsed = time.monotonic() - self._last_call
        if elapsed < self._min_interval:
            time.sleep(self._min_interval - elapsed)
        self._last_call = time.monotonic()

    def geocode(self, address: str) -> Optional[tuple[float, float]]:
        if not address or not address.strip():
            return None
        self._throttle()
        resp = self._http.get(
            NOMINATIM_URL,
            params={"q": address, "format": "json", "limit": 1, "countrycodes": "br"},
            headers={"User-Agent": USER_AGENT},
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data:
            return None
        try:
            return (float(data[0]["lat"]), float(data[0]["lon"]))
        except (KeyError, ValueError, IndexError):
            return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_geocode.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/ingestion/geocode.py backend/tests/test_geocode.py
git commit -m "feat(ingestion): add throttled Nominatim geocoder"
```

---

## Task 10: Ingestion orchestrator (upsert + change events)

**Files:**
- Create: `backend/ingestion/run.py`
- Test: `backend/tests/test_ingestion_run.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_ingestion_run.py`:

```python
from db.base import get_engine, init_db, make_session_factory
from db.models import Property, PropertyEvent
from ingestion.adapters.base import RawListing
from ingestion.adapters.caixa_csv import CaixaCsvAdapter
from ingestion.run import ingest


class _StubAdapter(CaixaCsvAdapter):
    """Caixa adapter whose fetch_raw returns injected rows (no network)."""

    def __init__(self, uf, rows):
        super().__init__(uf=uf)
        self._rows = rows

    def fetch_raw(self):
        return self._rows


def _row(source_id, preco, modalidade="Venda Online"):
    return RawListing(
        source="caixa", source_id=source_id,
        raw={
            "source_id": source_id, "uf": "PR", "city": "CURITIBA",
            "neighborhood": "CENTRO", "address": f"RUA {source_id}",
            "preco": preco, "avaliacao": "200.000,00", "desconto_csv": "0",
            "descricao": "Casa, área total 50,00 m2, 2 quartos.",
            "modalidade": modalidade, "detail_url": "http://x",
        },
    )


def _factory():
    engine = get_engine("sqlite://")
    init_db(engine)
    return make_session_factory(engine)


def test_ingest_inserts_new_properties_and_new_events():
    factory = _factory()
    adapter = _StubAdapter("PR", [_row("1", "100.000,00"), _row("2", "90.000,00")])
    summary = ingest(factory, adapter)
    assert summary.inserted == 2
    with factory() as s:
        assert s.query(Property).count() == 2
        assert s.query(PropertyEvent).filter_by(event_type="new").count() == 2


def test_ingest_second_run_detects_price_change():
    factory = _factory()
    ingest(factory, _StubAdapter("PR", [_row("1", "100.000,00")]))
    summary = ingest(factory, _StubAdapter("PR", [_row("1", "80.000,00")]))
    assert summary.updated == 1
    with factory() as s:
        prop = s.query(Property).filter_by(source_id="1").one()
        assert prop.preco == 80000.0
        ev = s.query(PropertyEvent).filter_by(event_type="price_change").one()
        assert ev.old_value == "100000.0"
        assert ev.new_value == "80000.0"


def test_ingest_marks_missing_properties_removed():
    factory = _factory()
    ingest(factory, _StubAdapter("PR", [_row("1", "100.000,00"), _row("2", "90.000,00")]))
    summary = ingest(factory, _StubAdapter("PR", [_row("1", "100.000,00")]))
    assert summary.removed == 1
    with factory() as s:
        gone = s.query(Property).filter_by(source_id="2").one()
        assert gone.status == "removed"
        assert s.query(PropertyEvent).filter_by(event_type="removed").count() == 1


def test_ingest_geocodes_new_properties_when_geocoder_given():
    factory = _factory()

    class _Geo:
        def geocode(self, address):
            return (-25.4, -49.2)

    ingest(factory, _StubAdapter("PR", [_row("1", "100.000,00")]), geocoder=_Geo())
    with factory() as s:
        prop = s.query(Property).filter_by(source_id="1").one()
        assert prop.lat == -25.4
        assert prop.lng == -49.2
        assert prop.geocode_status == "ok"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_ingestion_run.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ingestion.run'`.

- [ ] **Step 3: Implement the orchestrator**

Create `backend/ingestion/run.py`:

```python
"""Ingestion orchestrator: fetch -> normalize -> upsert -> emit change events."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from loguru import logger
from sqlalchemy import select

from db.models import Property, PropertyEvent
from ingestion.adapters.base import NormalizedProperty, SourceAdapter


@dataclass
class IngestSummary:
    inserted: int = 0
    updated: int = 0
    removed: int = 0
    unchanged: int = 0
    events_created: int = 0


def _apply_fields(prop: Property, n: NormalizedProperty) -> None:
    prop.uf = n.uf
    prop.city = n.city
    prop.neighborhood = n.neighborhood
    prop.address = n.address
    prop.property_type = n.property_type
    prop.area_m2 = n.area_m2
    prop.beds = n.beds
    prop.preco = n.preco
    prop.avaliacao = n.avaliacao
    prop.desconto_oficial = n.desconto_oficial
    prop.modalidade = n.modalidade
    prop.descricao_raw = n.descricao_raw
    prop.detail_url = n.detail_url
    prop.raw_payload = n.raw


def ingest(session_factory, adapter: SourceAdapter, geocoder=None) -> IngestSummary:
    summary = IngestSummary()
    raws = adapter.fetch_raw()
    seen_ids: list[str] = []
    now = datetime.now(timezone.utc)

    with session_factory() as session:
        for raw in raws:
            n = adapter.normalize(raw)
            seen_ids.append(n.source_id)
            existing = session.execute(
                select(Property).where(
                    Property.source == adapter.source,
                    Property.source_id == n.source_id,
                )
            ).scalar_one_or_none()

            if existing is None:
                prop = Property(
                    source=adapter.source, source_id=n.source_id,
                    status="active", first_seen_at=now, last_seen_at=now,
                )
                _apply_fields(prop, n)
                if geocoder is not None:
                    coords = geocoder.geocode(prop.address)
                    if coords:
                        prop.lat, prop.lng = coords
                        prop.geocode_status = "ok"
                    else:
                        prop.geocode_status = "failed"
                session.add(prop)
                session.flush()
                session.add(PropertyEvent(
                    property_id=prop.id, event_type="new", new_value=str(n.preco),
                ))
                summary.inserted += 1
                summary.events_created += 1
            else:
                events: list[PropertyEvent] = []
                if existing.preco != n.preco:
                    events.append(PropertyEvent(
                        property_id=existing.id, event_type="price_change",
                        old_value=str(existing.preco), new_value=str(n.preco),
                    ))
                if (existing.modalidade or "") != (n.modalidade or ""):
                    events.append(PropertyEvent(
                        property_id=existing.id, event_type="praca_change",
                        old_value=existing.modalidade, new_value=n.modalidade,
                    ))
                _apply_fields(existing, n)
                existing.last_seen_at = now
                existing.status = "active"
                for ev in events:
                    session.add(ev)
                if events:
                    summary.updated += 1
                    summary.events_created += len(events)
                else:
                    summary.unchanged += 1

        # Removed detection: active rows for this source/uf not seen this run.
        if seen_ids:
            stale = session.execute(
                select(Property).where(
                    Property.source == adapter.source,
                    Property.uf == adapter.uf,
                    Property.status == "active",
                    Property.source_id.notin_(seen_ids),
                )
            ).scalars().all()
            for prop in stale:
                prop.status = "removed"
                session.add(PropertyEvent(
                    property_id=prop.id, event_type="removed", old_value="active",
                ))
                summary.removed += 1
                summary.events_created += 1

        session.commit()

    logger.info(
        f"Ingest[{adapter.source}/{adapter.uf}]: "
        f"+{summary.inserted} ~{summary.updated} -{summary.removed} "
        f"={summary.unchanged} events={summary.events_created}"
    )
    return summary
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_ingestion_run.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/ingestion/run.py backend/tests/test_ingestion_run.py
git commit -m "feat(ingestion): upsert catalog rows and emit change events"
```

---

## Task 11: CLI entrypoint

**Files:**
- Modify: `backend/ingestion/run.py`
- Test: `backend/tests/test_ingestion_run.py` (extend)

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_ingestion_run.py`:

```python
from ingestion.run import build_parser, run_cli


def test_build_parser_defaults():
    args = build_parser().parse_args([])
    assert args.source == "caixa"
    assert args.uf == "PR"
    assert args.file is None


def test_run_cli_with_file(tmp_path):
    csv_text = (
        "N° do imóvel;UF;Cidade;Bairro;Endereço;Preço;Valor de avaliação;Desconto;"
        "Descrição;Modalidade de venda;Link de acesso\n"
        "555;PR;CURITIBA;CENTRO;RUA Z, 9;10.000,00;20.000,00;50,0;"
        "Casa, área total 40,00 m2, 1 quarto.;Venda Online;http://x\n"
    )
    csv_file = tmp_path / "lista.csv"
    csv_file.write_bytes(csv_text.encode("latin-1"))

    factory = _factory()
    summary = run_cli(["--uf", "PR", "--file", str(csv_file)], session_factory=factory)
    assert summary.inserted == 1
    with factory() as s:
        assert s.query(Property).filter_by(source_id="555").count() == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_ingestion_run.py -k cli -v`
Expected: FAIL with `ImportError: cannot import name 'build_parser'`.

- [ ] **Step 3: Implement the CLI**

Add this import near the top of `backend/ingestion/run.py` (with the other imports):

```python
import argparse
from pathlib import Path
```

Append to `backend/ingestion/run.py`:

```python
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Ingest auction listings into the catalog.")
    parser.add_argument("--source", default="caixa", help="Source adapter (default: caixa)")
    parser.add_argument("--uf", default="PR", help="State code, e.g. PR (default: PR)")
    parser.add_argument("--file", default=None, help="Local CSV path to ingest instead of fetching")
    parser.add_argument("--geocode", action="store_true", help="Geocode new rows via Nominatim")
    return parser


def _build_adapter(args):
    from ingestion.adapters.caixa_csv import CaixaCsvAdapter

    if args.source != "caixa":
        raise SystemExit(f"Unknown source: {args.source}")
    csv_bytes = Path(args.file).read_bytes() if args.file else None
    return CaixaCsvAdapter(uf=args.uf, csv_bytes=csv_bytes)


def run_cli(argv=None, session_factory=None) -> IngestSummary:
    args = build_parser().parse_args(argv)
    if session_factory is None:
        from db.base import get_engine, init_db, make_session_factory

        engine = get_engine()
        init_db(engine)
        session_factory = make_session_factory(engine)

    geocoder = None
    if args.geocode:
        from ingestion.geocode import NominatimClient

        geocoder = NominatimClient()

    adapter = _build_adapter(args)
    return ingest(session_factory, adapter, geocoder=geocoder)


def main() -> None:  # pragma: no cover - thin CLI wrapper
    summary = run_cli()
    logger.info(f"Done: {summary}")


if __name__ == "__main__":  # pragma: no cover
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_ingestion_run.py -v`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/ingestion/run.py backend/tests/test_ingestion_run.py
git commit -m "feat(ingestion): add CLI entrypoint with --file and --geocode"
```

---

## Task 12: Structured enrichment (reuse market/legal/scoring)

**Files:**
- Create: `backend/enrichment/__init__.py`, `backend/enrichment/run.py`
- Test: `backend/tests/test_enrichment.py`

- [ ] **Step 1: Create the package marker**

Create `backend/enrichment/__init__.py`:

```python
```

(empty file)

- [ ] **Step 2: Write the failing test**

Create `backend/tests/test_enrichment.py`:

```python
import enrichment.run as enrich
from db.models import Property
from graph.state import MarketResult, LegalResult
from graph.contracts import ScoringResult, RiskFlags
from enrichment.run import metadata_from_property, run_structured_enrichment


def test_metadata_from_property_maps_fields():
    p = Property(
        source="caixa", source_id="1", uf="PR", city="Curitiba",
        neighborhood="Centro", address="Rua XV, 100", property_type="Apartamento",
        area_m2=65.0, beds=2, preco=150000.0, avaliacao=250000.0,
        modalidade="Venda Direta Online", photo_url="http://p.jpg",
    )
    meta = metadata_from_property(p)
    assert meta.address == "Rua XV, 100"
    assert meta.property_type == "Apartamento"
    assert meta.area_m2 == 65.0
    assert meta.auction_price == 150000.0
    assert meta.market_value_estimate == 250000.0
    assert meta.city == "Curitiba"
    assert meta.state == "PR"
    assert meta.beds == 2


def test_run_structured_enrichment_skips_discovery_planner(monkeypatch):
    # Stub the three heavy nodes so no LLM/network runs.
    monkeypatch.setattr(enrich, "market_node", lambda state: {
        "market_result": MarketResult(price_per_m2_neighborhood=4000.0, liquidity_days=60,
                                      discount_percentage=40.0)
    })
    monkeypatch.setattr(enrich, "legal_node", lambda state: {
        "legal_result": LegalResult(risk_level="low", occupation_status="desocupado")
    })
    monkeypatch.setattr(enrich, "scoring_node", lambda state: {
        "scoring_result": ScoringResult(risk=RiskFlags(j="good", f="good", l="good", o="good"),
                                        roi=25.0)
    })

    p = Property(source="caixa", source_id="1", uf="PR", city="Curitiba",
                 neighborhood="Centro", address="Rua XV, 100",
                 property_type="Apartamento", area_m2=65.0, preco=150000.0,
                 avaliacao=250000.0, modalidade="Venda Direta Online")
    result = run_structured_enrichment(metadata_from_property(p), auction_url="http://x")
    # market = price_per_m2_neighborhood * area (IA), not appraisal
    assert result.market == 4000.0 * 65.0
    assert result.appraisal == 250000.0
    assert result.roi == 25.0
    assert result.min_bid == 150000.0
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_enrichment.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'enrichment.run'`.

- [ ] **Step 4: Implement `enrichment/run.py`**

Create `backend/enrichment/run.py`:

```python
"""On-demand enrichment: reuse the existing market/legal/scoring/output nodes
on already-structured catalog data, skipping discovery and planner (which exist
only to extract structure from raw HTML/PDF)."""

from __future__ import annotations

from graph.state import AuctionState, PropertyMetadata
from graph.market import market_node
from graph.legal import legal_node
from graph.scoring import scoring_node
from graph.output import build_result
from graph.contracts import AuctionPropertyResult

PIPELINE_VERSION = "v1"


def metadata_from_property(prop) -> PropertyMetadata:
    """Build the graph's PropertyMetadata directly from a catalog Property row."""
    return PropertyMetadata(
        address=prop.address or "",
        property_type=prop.property_type or "",
        area_m2=prop.area_m2 or 0.0,
        auction_price=prop.preco or 0.0,
        market_value_estimate=prop.avaliacao,
        auction_type=prop.modalidade or "",
        city=prop.city or "",
        neighborhood=prop.neighborhood or "",
        state=prop.uf or "",
        beds=prop.beds,
        photo_url=prop.photo_url or "",
    )


def run_structured_enrichment(
    metadata: PropertyMetadata, pdf_texts: str = "", auction_url: str = "",
) -> AuctionPropertyResult:
    state = AuctionState(
        property_metadata=metadata, pdf_texts=pdf_texts, auction_url=auction_url,
    )
    state.market_result = market_node(state)["market_result"]
    state.legal_result = legal_node(state)["legal_result"]
    state.scoring_result = scoring_node(state)["scoring_result"]
    return build_result(state)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_enrichment.py -v`
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/enrichment/__init__.py backend/enrichment/run.py backend/tests/test_enrichment.py
git commit -m "feat(enrichment): run market/legal/scoring on structured catalog data"
```

---

## Task 13: Lazy Caixa detail scraping

**Files:**
- Create: `backend/ingestion/adapters/caixa_detail.py`
- Test: `backend/tests/test_caixa_detail.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_caixa_detail.py`:

```python
from ingestion.adapters.caixa_detail import parse_detail_html

DETAIL_HTML = """
<html><body>
  <img src="/fotos/F8444401234567.jpg" alt="Foto do imóvel">
  <div id="dadosImovel">
    Apartamento com 2 quartos, sala, cozinha. Área privativa de 65,00 m2.
  </div>
  <a href="/editais/edital_123.pdf">Edital</a>
  <a href="/editais/matricula_123.pdf">Matrícula</a>
</body></html>
"""


def test_parse_detail_html_extracts_photo_and_docs():
    data = parse_detail_html(
        DETAIL_HTML, base_url="https://venda-imoveis.caixa.gov.br"
    )
    assert data["photo_url"] == "https://venda-imoveis.caixa.gov.br/fotos/F8444401234567.jpg"
    assert "Apartamento com 2 quartos" in data["full_description"]
    assert any("edital_123.pdf" in u for u in data["document_urls"])
    assert any("matricula_123.pdf" in u for u in data["document_urls"])


def test_parse_detail_html_empty_is_safe():
    data = parse_detail_html("", base_url="https://x")
    assert data["photo_url"] is None
    assert data["document_urls"] == []
    assert data["full_description"] == ""
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_caixa_detail.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ingestion.adapters.caixa_detail'`.

- [ ] **Step 3: Implement the detail parser + fetch**

Create `backend/ingestion/adapters/caixa_detail.py`:

```python
"""Lazy scraping of a single Caixa property detail page (photo, full text,
edital/matrícula PDF links). Parsing is pure and unit-tested; fetch_detail
reuses the existing Playwright scraper."""

from __future__ import annotations

import re
from urllib.parse import urljoin

_PHOTO_RE = re.compile(r'<img[^>]+src="([^"]*/fotos/[^"]+)"', re.IGNORECASE)
_PDF_RE = re.compile(r'href="([^"]+\.pdf)"', re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def parse_detail_html(html: str, base_url: str) -> dict:
    if not html:
        return {"photo_url": None, "full_description": "", "document_urls": []}

    photo_match = _PHOTO_RE.search(html)
    photo_url = urljoin(base_url, photo_match.group(1)) if photo_match else None

    document_urls = [urljoin(base_url, m) for m in _PDF_RE.findall(html)]

    text = _TAG_RE.sub(" ", html)
    text = _WS_RE.sub(" ", text).strip()

    return {
        "photo_url": photo_url,
        "full_description": text,
        "document_urls": document_urls,
    }


async def fetch_detail(detail_url: str, base_url: str = "https://venda-imoveis.caixa.gov.br") -> dict:
    """Scrape a detail page via the existing stealth Playwright scraper."""
    from tools.web_scraper import scrape_page

    scraped = await scrape_page(detail_url)
    return parse_detail_html(scraped.get("html", ""), base_url=base_url)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_caixa_detail.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/ingestion/adapters/caixa_detail.py backend/tests/test_caixa_detail.py
git commit -m "feat(ingestion): parse Caixa detail page for photo and documents"
```

---

## Task 14: API endpoints (ingest + catalog + lazy analyze)

**Files:**
- Modify: `backend/api.py`
- Test: `backend/tests/test_api_catalog.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_api_catalog.py`:

```python
import json

from fastapi.testclient import TestClient

import api
from db.base import get_engine, init_db, make_session_factory
from db.models import Property, Enrichment


def _client_with_db():
    engine = get_engine("sqlite://")
    init_db(engine)
    factory = make_session_factory(engine)
    api.app.state.session_factory = factory

    def _override():
        with factory() as s:
            yield s

    api.app.dependency_overrides[api.get_session] = _override
    return TestClient(api.app), factory


def test_catalog_lists_active_properties_filtered_by_uf():
    client, factory = _client_with_db()
    with factory() as s:
        s.add(Property(source="caixa", source_id="1", uf="PR", city="Curitiba",
                       address="Rua A", preco=100000.0, avaliacao=200000.0,
                       desconto_oficial=50.0, status="active"))
        s.add(Property(source="caixa", source_id="2", uf="SP", city="São Paulo",
                       address="Rua B", preco=50000.0, status="active"))
        s.commit()

    resp = client.get("/catalog?uf=PR")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["sourceId"] == "1"
    assert body[0]["desconto"] == 50.0
    api.app.dependency_overrides.clear()


def test_catalog_analyze_runs_enrichment_and_persists(monkeypatch):
    client, factory = _client_with_db()
    with factory() as s:
        s.add(Property(source="caixa", source_id="1", uf="PR", city="Curitiba",
                       neighborhood="Centro", address="Rua A", property_type="Casa",
                       area_m2=50.0, preco=100000.0, avaliacao=200000.0,
                       modalidade="Venda Direta Online", status="active"))
        s.commit()
        prop_id = s.query(Property).filter_by(source_id="1").one().id

    from graph.contracts import AuctionPropertyResult, RiskFlags

    def _fake_enrich(metadata, pdf_texts="", auction_url=""):
        return AuctionPropertyResult(
            id="abc", photo_label="", title="Casa", address="Rua A", type="Casa",
            neighborhood="Centro", city="Curitiba, PR", auction_type="Extrajudicial",
            auctioneer="—", court="—", discount=40.0, min_bid=100000.0, market=180000.0,
            roi=20.0, appraisal=200000.0, auction_discount=50.0, area=50.0, ends_at="",
            occupancy="desocupado", risk=RiskFlags(j="good", f="good", l="good", o="good"),
            viability=None, market_detail=None, costs=None, edital=None, auction_url=None,
        )

    monkeypatch.setattr(api, "run_structured_enrichment", _fake_enrich)

    resp = client.post(f"/catalog/{prop_id}/analyze")
    assert resp.status_code == 200
    assert resp.json()["roi"] == 20.0
    with factory() as s:
        enr = s.query(Enrichment).filter_by(property_id=prop_id).one()
        assert json.loads(enr.result_json)["roi"] == 20.0
    api.app.dependency_overrides.clear()


def test_ingest_endpoint_uses_injected_file(monkeypatch, tmp_path):
    client, factory = _client_with_db()

    from ingestion.run import IngestSummary

    def _fake_run_cli(argv, session_factory=None):
        return IngestSummary(inserted=3)

    monkeypatch.setattr(api, "run_cli", _fake_run_cli)
    resp = client.post("/ingest", json={"source": "caixa", "uf": "PR"})
    assert resp.status_code == 200
    assert resp.json()["inserted"] == 3
    api.app.dependency_overrides.clear()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_api_catalog.py -v`
Expected: FAIL with `AttributeError: module 'api' has no attribute 'get_session'`.

- [ ] **Step 3: Implement the endpoints**

Add these imports to the top of `backend/api.py` (below the existing imports):

```python
from dataclasses import asdict

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.base import get_engine, init_db, make_session_factory
from db.models import Property, Enrichment
from enrichment.run import metadata_from_property, run_structured_enrichment, PIPELINE_VERSION
from ingestion.run import run_cli
```

Add this request model next to `AnalyzeRequest` in `backend/api.py`:

```python
class IngestRequest(BaseModel):
    source: str = "caixa"
    uf: str = "PR"
    file: Optional[str] = None
```

Extend the startup handler in `backend/api.py` — replace the existing `_startup` function with:

```python
@app.on_event("startup")
def _startup():
    _merge_seed()
    engine = get_engine()
    init_db(engine)
    app.state.session_factory = make_session_factory(engine)


def get_session():
    factory = app.state.session_factory
    with factory() as session:
        yield session


def _property_card(p: Property) -> dict:
    return {
        "id": p.id,
        "sourceId": p.source_id,
        "source": p.source,
        "uf": p.uf,
        "city": p.city,
        "neighborhood": p.neighborhood,
        "address": p.address,
        "type": p.property_type,
        "area": p.area_m2,
        "beds": p.beds,
        "minBid": p.preco,
        "appraisal": p.avaliacao,
        "desconto": p.desconto_oficial,
        "modalidade": p.modalidade,
        "lat": p.lat,
        "lng": p.lng,
        "photoUrl": p.photo_url,
        "detailUrl": p.detail_url,
        "status": p.status,
    }
```

Append these endpoints to the end of `backend/api.py` (before the `if __name__ == "__main__":` block):

```python
@app.get("/catalog")
def list_catalog(uf: Optional[str] = None, session: Session = Depends(get_session)) -> list[dict]:
    stmt = select(Property).where(Property.status == "active")
    if uf:
        stmt = stmt.where(Property.uf == uf.upper())
    props = session.execute(stmt).scalars().all()
    return [_property_card(p) for p in props]


@app.get("/catalog/{prop_id}")
def get_catalog_item(prop_id: int, session: Session = Depends(get_session)) -> dict:
    prop = session.get(Property, prop_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    card = _property_card(prop)
    enr = session.execute(
        select(Enrichment).where(Enrichment.property_id == prop_id)
    ).scalar_one_or_none()
    card["enrichment"] = json.loads(enr.result_json) if enr else None
    return card


@app.post("/catalog/{prop_id}/analyze")
def analyze_catalog_item(prop_id: int, session: Session = Depends(get_session)) -> dict:
    prop = session.get(Property, prop_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    metadata = metadata_from_property(prop)
    result = run_structured_enrichment(metadata, auction_url=prop.detail_url)
    result_json = result.model_dump_json(by_alias=True)

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    enr = session.execute(
        select(Enrichment).where(Enrichment.property_id == prop_id)
    ).scalar_one_or_none()
    if enr:
        enr.result_json = result_json
        enr.pipeline_version = PIPELINE_VERSION
        enr.computed_at = now
    else:
        session.add(Enrichment(
            property_id=prop_id, result_json=result_json,
            pipeline_version=PIPELINE_VERSION, computed_at=now,
        ))
    session.commit()
    return json.loads(result_json)


@app.post("/ingest")
def trigger_ingest(req: IngestRequest) -> dict:
    argv = ["--source", req.source, "--uf", req.uf]
    if req.file:
        argv += ["--file", req.file]
    summary = run_cli(argv, session_factory=app.state.session_factory)
    return asdict(summary)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_api_catalog.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Run the full suite to confirm nothing regressed**

Run: `cd backend && python -m pytest -q`
Expected: PASS (all existing + new tests green).

- [ ] **Step 6: Commit**

```bash
git add backend/api.py backend/tests/test_api_catalog.py
git commit -m "feat(api): add catalog list/detail, lazy analyze, and ingest endpoints"
```

---

## Deferred (out of scope for v1 — do not build now)

- **Alembic migrations** — introduce when the schema first needs to change in production.
- **Seed → DB migration** — move the 3 demo properties into `properties` once the frontend consumes `/catalog`.
- **Scheduling** — cron/worker for automatic daily refresh (the orchestrator and event model already support it).
- **Additional sources** — new adapters (leiloeiros, tribunais, other banks) implementing `SourceAdapter`.
- **Alerts/notifications** — driven off `property_events`.
- **Full-text/search engine** (Meilisearch/Elasticsearch) — Postgres filters are enough for PR volume.
- **LGPD redaction** — decide handling of `debtor`/process numbers when edital scraping is surfaced.
- **Bot-gate hardening** — if `_download` gets blocked, operate via `--file` with a manually downloaded CSV until a compliant fetch path is confirmed.

---

## Self-Review Notes

- **Spec coverage:** Extraction (Task 7-8 CSV fetch/parse), ETL/normalize (Task 4-6), discount as separate official metric (Task 4, `desconto_oficial`; market-vs-comparables stays in `output.build_result`), geocoding via Nominatim (Task 9), stable Caixa ID dedup (Task 2 unique constraint + Task 10 upsert), event history (Task 2 + Task 10), Postgres storage (Task 1-2), lazy detail (Task 13), lazy AI reusing nodes and skipping discovery/planner (Task 12, Task 14), PR-only start (CLI `--uf PR`), manual trigger (CLI + `/ingest`). All approved-design items covered; Alembic/seed-migration intentionally deferred and flagged above.
- **Type consistency:** `NormalizedProperty`/`Property` field names align; `metadata_from_property` maps to the real `PropertyMetadata` fields verified in `graph/state.py`; node return keys (`market_result`/`legal_result`/`scoring_result`) match `graph/*.py`; `build_result(state)` and `AuctionPropertyResult` constructor args match `graph/output.py` and its tests.
- **No placeholders:** every code step contains complete code; the one deliberate throwaway import in Task 8 is explicitly corrected within the same task.
