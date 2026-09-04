from datetime import datetime, timedelta, timezone

import pytest

from db.base import get_engine, init_db, make_session_factory
from db.models import MarketReferenceJob, Property, RegionalMarketComparable, RegionalMarketPrice
from enrichment import market_reference
from graph.state import ComparableProperty


class _FakeGeocoder:
    def __init__(self):
        self.calls = []

    def geocode(self, _address):
        self.calls.append(_address)
        return -25.4284, -49.2733


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
            address=f"Rua {index}, Curitiba", property_type="Apartamento",
            price=price, area_m2=50, beds=2, price_per_m2=price / 50,
            source=source, url=f"https://site/{index}",
            lat=-25.4284, lng=-49.2733,
        )
        for index, (price, source) in enumerate([
            (200_000, "ZAP Imóveis"),
            (250_000, "Viva Real"),
            (300_000, "ImovelWeb"),
        ])
    ]

    async def fake_scrape(metadata, **kwargs):
        assert metadata.lat == -25.4284
        assert metadata.lng == -49.2733
        return comps

    monkeypatch.setattr(market_reference, "scrape_comparables", fake_scrape)
    geocoder = _FakeGeocoder()
    summary = await market_reference.refresh_references(
        factory, ["PR"], limit=10, geocoder=geocoder,
    )

    assert summary["updated"] == 1
    assert geocoder.calls == ["Rua A, Curitiba, PR, Brasil"]
    with factory() as session:
        reference = session.query(RegionalMarketPrice).one()
        snapshot = session.query(RegionalMarketComparable).all()
        assert reference.price_per_m2 == 5_000
        assert reference.neighborhood == ""
        assert reference.sample_size == 3
        assert {item.source for item in snapshot} == {
            "ZAP Imóveis", "Viva Real", "ImovelWeb",
        }


@pytest.mark.asyncio
async def test_subject_geocoder_removes_caixa_unit_noise():
    metadata = type("Metadata", (), {
        "address": "RUA RUBENS SEBASTIAO MARIN, N. 1076, Apto 201, BL-B, VG47",
        "city": "MARINGA", "state": "PR", "lat": None, "lng": None,
    })()
    geocoder = _FakeGeocoder()

    await market_reference._ensure_subject_coordinates(metadata, geocoder)

    assert geocoder.calls == [
        "RUA RUBENS SEBASTIAO MARIN 1076, MARINGA, PR, Brasil",
    ]
    assert (metadata.lat, metadata.lng) == (-25.4284, -49.2733)


@pytest.mark.asyncio
async def test_worker_refreshes_fresh_legacy_snapshot_once(monkeypatch):
    engine = get_engine("sqlite://")
    init_db(engine)
    factory = make_session_factory(engine)
    now = datetime.now(timezone.utc)
    with factory() as session:
        prop = Property(
            source="caixa", source_id="legacy-1", uf="PR", city="Curitiba",
            neighborhood="", property_type="Apartamento",
            address="Rua A", area_m2=50, preco=100_000, status="active",
        )
        session.add(prop)
        session.flush()
        session.add(RegionalMarketPrice(
            uf="PR", city="Curitiba", neighborhood="",
            property_type="Apartamento", price_per_m2=5_000, sample_size=3,
            source="listing_median", computed_at=now,
        ))
        session.add(MarketReferenceJob(
            uf="PR", city="Curitiba", neighborhood="",
            property_type="Apartamento", representative_property_id=prop.id,
            status="successful", next_attempt_at=now + timedelta(days=90),
        ))
        session.commit()

    async def fake_scrape(metadata, **kwargs):
        return [ComparableProperty(
            address="Rua B", property_type="Apartamento", price=250_000,
            area_m2=50, beds=2, price_per_m2=5_000, source="Portal",
            url="https://portal/1", lat=-25.4284, lng=-49.2733,
        )]

    monkeypatch.setattr(market_reference, "scrape_comparables", fake_scrape)

    first = await market_reference.refresh_references(
        factory, ["PR"], limit=10, geocoder=_FakeGeocoder(),
    )
    second = await market_reference.refresh_references(
        factory, ["PR"], limit=10, geocoder=_FakeGeocoder(),
    )

    assert first["updated"] == 1
    assert second["selected"] == 0
    with factory() as session:
        reference = session.query(RegionalMarketPrice).one()
        assert reference.source == market_reference.MARKET_REFERENCE_SOURCE


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

    assert summary["selected"] == 0
    assert summary["updated"] == 0
    with factory() as session:
        assert session.query(RegionalMarketPrice).count() == 0


@pytest.mark.asyncio
async def test_empty_city_job_backs_off_without_starving_another_city(monkeypatch):
    engine = get_engine("sqlite://")
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        for source_id, city in (("1", "Cidade A"), ("2", "Cidade B")):
            session.add(Property(
                source="caixa", source_id=source_id, uf="PR", city=city,
                neighborhood="Centro", property_type="APTO", address="Rua A",
                area_m2=50, preco=100_000, status="active",
            ))
        session.commit()

    async def no_comps(metadata, **kwargs):
        return []

    monkeypatch.setattr(market_reference, "scrape_comparables", no_comps)
    first = await market_reference.refresh_references(
        factory, ["PR"], limit=1, geocoder=_FakeGeocoder(),
    )
    second = await market_reference.refresh_references(
        factory, ["PR"], limit=1, geocoder=_FakeGeocoder(),
    )
    assert first["empty"] == second["empty"] == 1
    with factory() as session:
        jobs = session.query(MarketReferenceJob).order_by(MarketReferenceJob.id).all()
        assert len(jobs) == 2
        assert all(job.status == "empty" for job in jobs)
        assert all(job.next_attempt_at is not None for job in jobs)


def test_reconcile_deduplicates_shared_neighborhood_jobs():
    engine = get_engine("sqlite://")
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        session.add(RegionalMarketPrice(
            uf="PR", city="Araucária", neighborhood="",
            property_type="Apartamento", price_per_m2=5_000, sample_size=3,
        ))
        for source_id in ("apt-1", "apt-2"):
            session.add(Property(
                source="caixa", source_id=source_id, uf="PR", city="Araucária",
                neighborhood="Costeira", property_type="Apartamento",
                address=f"Rua {source_id}", area_m2=50, preco=100_000, status="active",
            ))
        session.commit()

    summary = market_reference.reconcile_coverage(factory, ["PR"])
    assert summary["jobs_created"] == 2  # one city baseline + one neighborhood
    with factory() as session:
        neighborhood_jobs = session.query(MarketReferenceJob).filter_by(
            neighborhood="Costeira",
        ).all()
        assert len(neighborhood_jobs) == 1
