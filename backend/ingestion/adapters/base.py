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
