from db.base import get_engine, init_db, make_session_factory
from db.models import MarketReferenceJob, Property
from enrichment.coverage_report import build_report


def test_report_excludes_historical_jobs_for_inactive_properties():
    engine = get_engine("sqlite://")
    init_db(engine)
    factory = make_session_factory(engine)

    with factory() as session:
        active = Property(
            source="caixa", source_id="active-1", uf="PR", city="Curitiba",
            neighborhood="Centro", property_type="Apartamento",
            address="Rua A", area_m2=50, preco=100_000, status="active",
        )
        inactive = Property(
            source="caixa", source_id="inactive-1", uf="PR", city="Londrina",
            neighborhood="Centro", property_type="Apartamento",
            address="Rua B", area_m2=50, preco=100_000, status="inactive",
        )
        session.add_all([active, inactive])
        session.flush()
        session.add_all([
            MarketReferenceJob(
                uf="PR", city="Curitiba", neighborhood="",
                property_type="Apartamento", representative_property_id=active.id,
                status="failed",
            ),
            MarketReferenceJob(
                uf="PR", city="Londrina", neighborhood="",
                property_type="Apartamento", representative_property_id=inactive.id,
                status="empty",
            ),
        ])
        session.commit()

    report = build_report(factory, [])

    assert report["eligible_properties"] == 1
    assert report["jobs_by_status"] == {"failed": 1}
