import pytest

from db.base import get_engine, init_db, make_session_factory
from db.models import CityExpenseReference
from enrichment.city_expense_reference import upsert_references, validate_reference


def _item(**overrides):
    item = {
        "uf": "pr", "city": "Curitiba", "annual_iptu_rate": 0.006,
        "condo_per_m2_monthly": 7.5, "reference_year": 2026,
        "source": "Documented estimate",
    }
    item.update(overrides)
    return item


def test_validates_and_normalizes_reference():
    assert validate_reference(_item())["uf"] == "PR"
    assert validate_reference(_item())["city"] == "CURITIBA"
    with pytest.raises(ValueError):
        validate_reference(_item(source=""))


def test_upsert_is_idempotent():
    engine = get_engine("sqlite://")
    init_db(engine)
    factory = make_session_factory(engine)
    assert upsert_references(factory, [_item()])["created"] == 1
    assert upsert_references(factory, [_item(condo_per_m2_monthly=8)])["updated"] == 1
    with factory() as session:
        reference = session.query(CityExpenseReference).one()
        assert reference.city == "CURITIBA"
        assert reference.condo_per_m2_monthly == 8


def test_upsert_updates_existing_title_case_city_without_duplicate():
    engine = get_engine("sqlite://")
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        session.add(CityExpenseReference(**_item(city="Curitiba")))
        session.commit()
    upsert_references(factory, [_item(city="CURITIBA", condo_per_m2_monthly=9)])
    with factory() as session:
        references = session.query(CityExpenseReference).all()
        assert len(references) == 1
        assert references[0].city == "CURITIBA"
        assert references[0].condo_per_m2_monthly == 9
