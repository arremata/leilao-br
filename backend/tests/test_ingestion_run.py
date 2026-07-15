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
