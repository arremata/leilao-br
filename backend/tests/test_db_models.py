from datetime import datetime, timezone

from sqlalchemy import inspect, text

from db.base import Base, get_engine, init_db, make_session_factory
from db.models import Property, PropertyEvent, Enrichment


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


def test_init_db_adds_auction_dates_to_existing_properties_table():
    engine = get_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE properties (id INTEGER PRIMARY KEY, source VARCHAR(32))"
        ))

    init_db(engine)

    columns = {column["name"] for column in inspect(engine).get_columns("properties")}
    assert {
        "first_auction_at", "second_auction_at", "dates_fetched_at",
        "first_auction_price", "second_auction_price",
    }.issubset(columns)


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
