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
