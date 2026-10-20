from db.base import get_engine, init_db, make_session_factory
from db.models import Property
from ingestion.geocode_worker import run_geocode_batch


class _Geocoder:
    def __init__(self):
        self.calls = []

    def geocode(self, address):
        self.calls.append(address)
        return (-23.5505, -46.6333) if "São Paulo" in address else None


def test_geocode_batch_is_bounded_cached_and_uf_scoped():
    engine = get_engine("sqlite://")
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        session.add_all([
            Property(source="caixa", source_id="1", uf="SP", city="São Paulo", address="Rua A"),
            Property(source="caixa", source_id="2", uf="SP", city="São Paulo", address="Rua A"),
            Property(source="caixa", source_id="3", uf="PR", city="Curitiba", address="Rua B"),
        ])
        session.commit()

    geocoder = _Geocoder()
    summary = run_geocode_batch(factory, geocoder, ufs=["SP"], limit=2)

    assert summary.selected == 2
    assert summary.updated == 2
    assert len(geocoder.calls) == 1
    with factory() as session:
        assert session.query(Property).filter_by(geocode_status="ok").count() == 2
        assert session.query(Property).filter_by(uf="PR").one().geocode_status == "pending"
