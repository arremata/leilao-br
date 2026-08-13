import pytest

from db.base import get_engine, init_db, make_session_factory
from db.models import Property, RegionalMarketComparable, RegionalMarketPrice
from enrichment import market_reference
from graph.state import ComparableProperty


@pytest.mark.asyncio
async def test_worker_persists_reference_and_comparable_snapshot(monkeypatch):
    engine = get_engine("sqlite://")
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        session.add(Property(
            source="caixa", source_id="1", uf="PR", city="Curitiba",
            neighborhood="Centro", property_type="Apartamento",
            address="Rua A", area_m2=50, preco=100_000, status="active",
        ))
        session.commit()

    comps = [
        ComparableProperty(
            address=f"Rua {index}, Curitiba", price=price, area_m2=50,
            price_per_m2=price / 50, source=source, url=f"https://site/{index}",
        )
        for index, (price, source) in enumerate([
            (200_000, "ZAP Imóveis"),
            (250_000, "Viva Real"),
            (300_000, "ImovelWeb"),
        ])
    ]

    async def fake_scrape(metadata):
        return comps

    monkeypatch.setattr(market_reference, "scrape_comparables", fake_scrape)
    summary = await market_reference.refresh_references(factory, ["PR"], limit=10)

    assert summary["updated"] == 1
    with factory() as session:
        reference = session.query(RegionalMarketPrice).one()
        snapshot = session.query(RegionalMarketComparable).all()
        assert reference.price_per_m2 == 5_000
        assert reference.sample_size == 3
        assert {item.source for item in snapshot} == {
            "ZAP Imóveis", "Viva Real", "ImovelWeb",
        }


@pytest.mark.asyncio
async def test_worker_does_not_scrape_land_references(monkeypatch):
    engine = get_engine("sqlite://")
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        session.add(Property(
            source="caixa", source_id="land-1", uf="PR", city="Curitiba",
            neighborhood="Mato Dentro", property_type="Terreno",
            address="Rodovia dos Minérios", area_m2=72_600,
            preco=1_243_146.17, status="active",
        ))
        session.commit()

    async def fail_if_called(metadata):
        raise AssertionError("land scraper should not be called")

    monkeypatch.setattr(market_reference, "scrape_comparables", fail_if_called)
    summary = await market_reference.refresh_references(factory, ["PR"], limit=10)

    assert summary == {"selected": 0, "updated": 0, "empty": 0, "failed": 0}
    with factory() as session:
        assert session.query(RegionalMarketPrice).count() == 0
