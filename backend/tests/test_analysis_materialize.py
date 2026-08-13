from db.base import get_engine, init_db, make_session_factory
from db.models import (
    Enrichment, Property, PropertyEvent, RegionalMarketComparable, RegionalMarketPrice,
)
from enrichment.materialize import materialize_analyses
from enrichment.run import PIPELINE_VERSION


def _database():
    engine = get_engine("sqlite://")
    init_db(engine)
    return make_session_factory(engine)


def test_materializes_and_reuses_shared_cached_analysis():
    factory = _database()
    with factory() as session:
        prop = Property(
            source="caixa", source_id="1", uf="PR", city="Curitiba",
            neighborhood="Centro", property_type="Apartamento", address="Rua A",
            area_m2=50, preco=100_000, status="active",
        )
        session.add(prop)
        session.flush()
        reference = RegionalMarketPrice(
            uf="PR", city="Curitiba", neighborhood="Centro",
            property_type="Apartamento", price_per_m2=5_000, sample_size=1,
        )
        session.add(reference)
        session.flush()
        session.add(RegionalMarketComparable(
            reference_id=reference.id, address="Rua B", price=250_000,
            area_m2=50, price_per_m2=5_000, source="Portal", url="https://site/1",
        ))
        session.commit()
        property_id = prop.id

    first = materialize_analyses(factory, ["PR"])
    second = materialize_analyses(factory, ["PR"])

    assert first["updated"] == 1
    assert second["updated"] == 0
    assert second["current"] == 1
    with factory() as session:
        cached = session.query(Enrichment).filter_by(property_id=property_id).one()
        assert cached.pipeline_version == PIPELINE_VERSION
        assert '"market":250000.0' in cached.result_json


def test_skips_property_without_market_reference():
    factory = _database()
    with factory() as session:
        session.add(Property(
            source="caixa", source_id="2", uf="PR", city="Curitiba",
            neighborhood="Sem referência", property_type="Casa", address="Rua C",
            area_m2=80, preco=150_000, status="active",
        ))
        session.commit()

    summary = materialize_analyses(factory, ["PR"])

    assert summary["selected"] == 0
    assert summary["no_reference"] == 1
    with factory() as session:
        assert session.query(Enrichment).count() == 0


def test_recomputes_after_catalog_property_change():
    factory = _database()
    with factory() as session:
        prop = Property(
            source="caixa", source_id="3", uf="PR", city="Curitiba",
            neighborhood="Centro", property_type="Casa", address="Rua D",
            area_m2=100, preco=200_000, status="active",
        )
        session.add(prop)
        session.add(RegionalMarketPrice(
            uf="PR", city="Curitiba", neighborhood="Centro",
            property_type="Casa", price_per_m2=4_000,
        ))
        session.commit()
        property_id = prop.id

    assert materialize_analyses(factory, ["PR"])["updated"] == 1
    with factory() as session:
        session.add(PropertyEvent(
            property_id=property_id, event_type="price_change",
            old_value="200000", new_value="180000",
        ))
        session.commit()

    assert materialize_analyses(factory, ["PR"])["updated"] == 1
