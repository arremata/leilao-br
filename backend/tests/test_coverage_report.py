from datetime import datetime, timezone

from sqlalchemy import event

from db.base import get_engine, init_db, make_session_factory
from db.models import Enrichment, MarketReferenceJob, Property, RegionalMarketPrice
from enrichment.coverage_report import build_report
from enrichment.run import PIPELINE_VERSION


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


def test_report_counts_only_current_pipeline_analyses_in_fixed_queries():
    engine = get_engine("sqlite://")
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        reference = RegionalMarketPrice(
            uf="PR", city="Curitiba", neighborhood="",
            property_type="Apartamento", price_per_m2=5_000,
        )
        session.add(reference)
        for index in range(20):
            prop = Property(
                source="caixa", source_id=f"coverage-{index}", uf="PR",
                city="Curitiba", neighborhood=f"Bairro {index}",
                property_type="Apartamento", address=f"Rua {index}",
                area_m2=50, preco=100_000, status="active",
            )
            session.add(prop)
            session.flush()
            session.add(Enrichment(
                property_id=prop.id,
                result_json="{}",
                pipeline_version=PIPELINE_VERSION if index < 10 else "stale-version",
                computed_at=datetime.now(timezone.utc),
            ))
        session.commit()

    statements = []

    def count_statement(*args):
        statements.append(args[2])

    event.listen(engine, "before_cursor_execute", count_statement)
    try:
        report = build_report(factory, ["PR"])
    finally:
        event.remove(engine, "before_cursor_execute", count_statement)

    assert report["eligible_properties"] == 20
    assert report["properties_with_reference"] == 20
    assert report["properties_analyzed"] == 10
    assert report["analysis_coverage_percent"] == 50.0
    assert len(statements) <= 6
