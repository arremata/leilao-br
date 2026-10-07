from sqlalchemy import event

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


def test_materializes_from_city_type_baseline_when_neighborhood_is_missing():
    factory = _database()
    with factory() as session:
        session.add(Property(
            source="caixa", source_id="city-fallback", uf="PR", city="Maringá",
            neighborhood="Parque Industrial", property_type="APARTAMENTO",
            address="Rua A", area_m2=80, preco=330_000, status="active",
        ))
        session.add(RegionalMarketPrice(
            uf="PR", city="Maringá", neighborhood="", property_type="Apartamento",
            price_per_m2=6_500, sample_size=3,
        ))
        session.commit()

    summary = materialize_analyses(factory, ["PR"])
    assert summary["updated"] == 1
    with factory() as session:
        cached = session.query(Enrichment).one()
        assert '"market":520000.0' in cached.result_json


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


def test_materializes_only_properties_affected_by_changed_reference():
    factory = _database()
    with factory() as session:
        properties = [
            Property(
                source="caixa", source_id=f"affected-{index}", uf="PR",
                city=city, neighborhood="Centro", property_type="Apartamento",
                address=f"Rua {index}", area_m2=50, preco=100_000,
                status="active",
            )
            for index, city in enumerate(("Curitiba", "Londrina"))
        ]
        session.add_all(properties)
        session.flush()
        references = [
            RegionalMarketPrice(
                uf="PR", city=prop.city, neighborhood="",
                property_type="Apartamento", price_per_m2=5_000,
            )
            for prop in properties
        ]
        session.add_all(references)
        session.commit()
        changed_reference_id = references[0].id
        affected_property_id = properties[0].id

    summary = materialize_analyses(
        factory, ["PR"], reference_ids={changed_reference_id},
    )

    assert summary["updated"] == 1
    assert summary["skipped_unaffected"] == 1
    with factory() as session:
        assert session.query(Enrichment).one().property_id == affected_property_id


def test_noop_materialization_uses_a_fixed_number_of_queries():
    engine = get_engine("sqlite://")
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        session.add(RegionalMarketPrice(
            uf="PR", city="Curitiba", neighborhood="",
            property_type="Apartamento", price_per_m2=5_000,
        ))
        session.add_all([
            Property(
                source="caixa", source_id=f"query-{index}", uf="PR",
                city="Curitiba", neighborhood=f"Bairro {index}",
                property_type="Apartamento", address=f"Rua {index}",
                area_m2=50, preco=100_000, status="active",
            )
            for index in range(20)
        ])
        session.commit()
    assert materialize_analyses(factory, ["PR"])["updated"] == 20

    statements = []

    def count_statement(*args):
        statements.append(args[2])

    event.listen(engine, "before_cursor_execute", count_statement)
    try:
        summary = materialize_analyses(factory, ["PR"])
    finally:
        event.remove(engine, "before_cursor_execute", count_statement)

    assert summary["current"] == 20
    assert len(statements) <= 6
