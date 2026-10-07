import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from db.base import get_engine, init_db, make_session_factory
from db.models import MarketReferenceJob, Property, RegionalMarketComparable, RegionalMarketPrice
from enrichment import market_reference
from graph.state import ComparableProperty
from tools.property_scraper import ComparableSourceBlockedError


class _FakeGeocoder:
    def __init__(self):
        self.calls = []

    def geocode(self, _address):
        self.calls.append(_address)
        return -25.4284, -49.2733


@pytest.fixture(autouse=True)
def _bright_data_config(monkeypatch):
    monkeypatch.setenv("BRIGHT_DATA_API_KEY", "test-api-key")
    monkeypatch.setenv("BRIGHT_DATA_WEB_UNLOCKER_ZONE", "test-zone")


@pytest.mark.parametrize(("summary", "expected"), [
    ({"selected": 0, "updated": 0, "empty": 0, "failed": 0}, 0),
    ({"selected": 18, "updated": 9, "empty": 6, "failed": 3}, 0),
    ({"selected": 3, "updated": 0, "empty": 3, "failed": 0}, 0),
    ({"selected": 3, "updated": 0, "empty": 0, "failed": 3}, 1),
])
def test_refresh_exit_code_only_fails_without_a_usable_outcome(summary, expected):
    assert market_reference.refresh_exit_code(summary) == expected


def test_scheduled_workflow_uses_a_safe_default_batch_size():
    workflow = (
        Path(__file__).resolve().parents[2]
        / ".github" / "workflows" / "market-reference.yml"
    ).read_text()

    assert 'default: "10"' in workflow
    assert "MARKET_LIMIT: ${{ github.event.inputs.limit || '10' }}" in workflow
    assert "MARKET_FORCE: ${{ github.event.inputs.force || 'false' }}" in workflow
    assert "MARKET_ATTEMPTED_BEFORE:" in workflow
    assert "Forced refresh: materializing every stale analysis in scope." in workflow
    assert 'default: false' in workflow
    assert 'timeout --signal=TERM --kill-after=30s 42m' in workflow
    assert "playwright install" not in workflow
    assert '--ufs "${{' not in workflow
    assert "actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09" in workflow


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
            (200_000, "QuintoAndar"),
            (250_000, "Chaves na Mão"),
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
            "QuintoAndar", "Chaves na Mão", "ImovelWeb",
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
            source="listing_median_confidence_v4", computed_at=now,
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
async def test_worker_preserves_reference_when_listing_source_is_blocked(monkeypatch):
    engine = get_engine("sqlite://")
    init_db(engine)
    factory = make_session_factory(engine)
    now = datetime.now(timezone.utc)
    with factory() as session:
        prop = Property(
            source="caixa", source_id="blocked-1", uf="PR", city="Curitiba",
            neighborhood="", property_type="Apartamento", address="Rua A",
            area_m2=50, preco=100_000, status="active",
        )
        session.add(prop)
        session.flush()
        reference = RegionalMarketPrice(
            uf="PR", city="Curitiba", neighborhood="",
            property_type="Apartamento", price_per_m2=5_000, sample_size=1,
            source="listing_median_confidence_v4", computed_at=now,
        )
        session.add(reference)
        session.flush()
        session.add(RegionalMarketComparable(
            reference_id=reference.id, address="Rua antiga", price=250_000,
            area_m2=50, price_per_m2=5_000, source="ImovelWeb",
            url="https://www.imovelweb.com.br/propriedades/antiga.html",
        ))
        session.add(MarketReferenceJob(
            uf="PR", city="Curitiba", neighborhood="",
            property_type="Apartamento", representative_property_id=prop.id,
            status="successful", next_attempt_at=now + timedelta(days=90),
        ))
        session.commit()

    async def blocked_scrape(metadata, **kwargs):
        raise ComparableSourceBlockedError("ImovelWeb challenge")

    monkeypatch.setattr(market_reference, "scrape_comparables", blocked_scrape)
    summary = await market_reference.refresh_references(
        factory, ["PR"], limit=1, geocoder=_FakeGeocoder(),
    )

    assert summary["failed"] == 1
    assert summary["updated"] == 0
    with factory() as session:
        reference = session.query(RegionalMarketPrice).one()
        comparable = session.query(RegionalMarketComparable).one()
        job = session.query(MarketReferenceJob).one()
        assert reference.source == "listing_median_confidence_v4"
        assert reference.price_per_m2 == 5_000
        assert comparable.url.endswith("/antiga.html")
        assert job.status == "failed"
        assert "ImovelWeb challenge" in job.last_error


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
async def test_worker_does_not_refresh_a_legacy_job_for_an_inactive_property(monkeypatch):
    engine = get_engine("sqlite://")
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        prop = Property(
            source="caixa", source_id="inactive-1", uf="PR", city="Curitiba",
            neighborhood="Centro", property_type="Apartamento", address="Rua A",
            area_m2=50, preco=100_000, status="inactive",
        )
        session.add(prop)
        session.flush()
        session.add(MarketReferenceJob(
            uf="PR", city="Curitiba", neighborhood="",
            property_type="Apartamento", representative_property_id=prop.id,
            status="pending",
        ))
        session.commit()

    async def fail_if_called(metadata, **kwargs):
        raise AssertionError("inactive property scraper should not be called")

    monkeypatch.setattr(market_reference, "scrape_comparables", fail_if_called)
    summary = await market_reference.refresh_references(
        factory, ["PR"], limit=10, geocoder=_FakeGeocoder(),
    )

    assert summary["selected"] == 0
    assert summary["updated"] == 0
    with factory() as session:
        job = session.query(MarketReferenceJob).one()
        assert job.status == "pending"
        assert job.attempt_count == 0


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


class _StubCollector:
    def metrics_summary(self):
        return {}


def test_claim_lease_prevents_duplicate_work_and_recovers_when_stale():
    engine = get_engine("sqlite://")
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        session.add(Property(
            source="caixa", source_id="lease-1", uf="PR", city="Curitiba",
            neighborhood="Centro", property_type="Apartamento",
            address="Rua A", area_m2=50, preco=100_000, status="active",
        ))
        session.commit()
    market_reference.reconcile_coverage(factory, ["PR"])

    first = market_reference._claim_jobs(factory, ["PR"], 1, 90, None)
    second = market_reference._claim_jobs(factory, ["PR"], 1, 90, None)

    assert len(first) == 1
    assert second == []

    with factory() as session:
        job = session.query(MarketReferenceJob).one()
        job.updated_at = datetime.now(timezone.utc) - market_reference.LEASE_TIMEOUT - timedelta(seconds=1)
        session.commit()

    recovered = market_reference._claim_jobs(factory, ["PR"], 1, 90, None)
    assert len(recovered) == 1
    assert recovered[0].claimed_at > first[0].claimed_at


@pytest.mark.asyncio
async def test_worker_bounds_parallel_jobs(monkeypatch):
    engine = get_engine("sqlite://")
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        for index in range(4):
            session.add(Property(
                source="caixa", source_id=f"parallel-{index}", uf="PR",
                city=f"Cidade {index}", neighborhood="Centro",
                property_type="Apartamento", address=f"Rua {index}",
                area_m2=50, preco=100_000, status="active",
            ))
        session.commit()

    active = 0
    max_active = 0

    async def fake_scrape(metadata, **kwargs):
        nonlocal active, max_active
        active += 1
        max_active = max(max_active, active)
        try:
            await asyncio.sleep(0.02)
            return [ComparableProperty(
                address=f"Rua comparável {metadata.city}",
                property_type="Apartamento", price=250_000,
                area_m2=50, price_per_m2=5_000, source="Portal",
                url=f"https://portal/{metadata.city}",
                lat=-25.4284, lng=-49.2733,
            )]
        finally:
            active -= 1

    monkeypatch.setattr(market_reference, "scrape_comparables", fake_scrape)
    summary = await market_reference.refresh_references(
        factory, ["PR"], limit=4, geocoder=_FakeGeocoder(), concurrency=2,
        collector=_StubCollector(),
    )

    assert summary["updated"] == 4
    assert len(summary["updated_reference_ids"]) == 4
    assert max_active == 2


@pytest.mark.asyncio
async def test_forced_refresh_processes_fresh_jobs_only_once(monkeypatch):
    engine = get_engine("sqlite://")
    init_db(engine)
    factory = make_session_factory(engine)
    now = datetime.now(timezone.utc)
    with factory() as session:
        for index in range(3):
            prop = Property(
                source="caixa", source_id=f"forced-{index}", uf="PR",
                city=f"Cidade {index}", neighborhood="",
                property_type="Apartamento", address=f"Rua {index}",
                area_m2=50, preco=100_000, status="active",
            )
            session.add(prop)
            session.flush()
            session.add(RegionalMarketPrice(
                uf="PR", city=prop.city, neighborhood="",
                property_type="Apartamento", price_per_m2=4_000,
                sample_size=1, source=market_reference.MARKET_REFERENCE_SOURCE,
                computed_at=now,
            ))
            session.add(MarketReferenceJob(
                uf="PR", city=prop.city, neighborhood="",
                property_type="Apartamento", representative_property_id=prop.id,
                status="successful", next_attempt_at=now + timedelta(days=90),
            ))
        session.commit()

    calls = []

    async def fake_scrape(metadata, **kwargs):
        calls.append(metadata.city)
        return [ComparableProperty(
            address=f"Rua comparável {metadata.city}",
            property_type="Apartamento", price=250_000,
            area_m2=50, price_per_m2=5_000, source="Portal",
            url=f"https://portal/{metadata.city}",
            lat=-25.4284, lng=-49.2733,
        )]

    monkeypatch.setattr(market_reference, "scrape_comparables", fake_scrape)
    summary = await market_reference.refresh_references(
        factory, ["PR"], limit=4, geocoder=_FakeGeocoder(), concurrency=2,
        collector=_StubCollector(), force=True,
    )

    assert summary["selected"] == 3
    assert summary["updated"] == 3
    assert sorted(calls) == ["Cidade 0", "Cidade 1", "Cidade 2"]


@pytest.mark.asyncio
async def test_forced_resume_skips_jobs_attempted_since_cutoff(monkeypatch):
    engine = get_engine("sqlite://")
    init_db(engine)
    factory = make_session_factory(engine)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    with factory() as session:
        for index, attempted_at in enumerate((
            cutoff - timedelta(minutes=1),
            cutoff + timedelta(minutes=1),
        )):
            prop = Property(
                source="caixa", source_id=f"resume-{index}", uf="PR",
                city=f"Cidade {index}", neighborhood="",
                property_type="Apartamento", address=f"Rua {index}",
                area_m2=50, preco=100_000, status="active",
            )
            session.add(prop)
            session.flush()
            session.add(RegionalMarketPrice(
                uf="PR", city=prop.city, neighborhood="",
                property_type="Apartamento", price_per_m2=4_000,
                sample_size=1, source=market_reference.MARKET_REFERENCE_SOURCE,
                computed_at=attempted_at,
            ))
            session.add(MarketReferenceJob(
                uf="PR", city=prop.city, neighborhood="",
                property_type="Apartamento", representative_property_id=prop.id,
                status="successful", last_attempted_at=attempted_at,
                next_attempt_at=attempted_at + timedelta(days=90),
            ))
        session.commit()

    calls = []

    async def fake_scrape(metadata, **kwargs):
        calls.append(metadata.city)
        return [ComparableProperty(
            address=f"Rua comparável {metadata.city}",
            property_type="Apartamento", price=250_000,
            area_m2=50, price_per_m2=5_000, source="Portal",
            url=f"https://portal/{metadata.city}",
            lat=-25.4284, lng=-49.2733,
        )]

    monkeypatch.setattr(market_reference, "scrape_comparables", fake_scrape)
    summary = await market_reference.refresh_references(
        factory, ["PR"], limit=10, geocoder=_FakeGeocoder(),
        collector=_StubCollector(), force=True, attempted_before=cutoff,
    )

    assert summary["selected"] == 1
    assert summary["updated"] == 1
    assert calls == ["Cidade 0"]
