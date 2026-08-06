from db.base import get_engine, init_db, make_session_factory
from db.models import Property
from ingestion.adapters.base import RawListing
from ingestion.adapters.caixa_csv import CaixaCsvAdapter
from ingestion.worker import UFResult, parse_ufs, report_exit_code, run_worker


class _StubAdapter(CaixaCsvAdapter):
    """Caixa adapter whose fetch_raw returns injected rows (no network)."""

    def __init__(self, uf, rows):
        super().__init__(uf=uf)
        self._rows = rows

    def fetch_raw(self):
        return self._rows

    async def fetch_raw_async(self):
        return self._rows


class _FailingAdapter(CaixaCsvAdapter):
    """Adapter that raises when fetched, to exercise per-UF error isolation."""

    def fetch_raw(self):
        raise RuntimeError("boom")

    async def fetch_raw_async(self):
        raise RuntimeError("boom")


def _row(source_id, uf):
    return RawListing(
        source="caixa", source_id=source_id,
        raw={
            "source_id": source_id, "uf": uf, "city": "X",
            "neighborhood": "Y", "address": f"RUA {source_id}",
            "preco": "100.000,00", "avaliacao": "200.000,00", "desconto_csv": "0",
            "descricao": "Casa, área total 50,00 m2, 2 quartos.",
            "modalidade": "Venda Online", "detail_url": "http://x",
        },
    )


def _factory():
    engine = get_engine("sqlite://")
    init_db(engine)
    return make_session_factory(engine)


def test_run_worker_ingests_each_uf():
    factory = _factory()
    adapters = {
        "PR": _StubAdapter("PR", [_row("1", "PR")]),
        "SP": _StubAdapter("SP", [_row("2", "SP"), _row("3", "SP")]),
    }
    report = run_worker(["PR", "SP"], factory, adapter_factory=lambda uf: adapters[uf])

    assert report["PR"].summary.inserted == 1
    assert report["SP"].summary.inserted == 2
    assert report["PR"].error is None
    assert report["SP"].error is None
    with factory() as s:
        assert s.query(Property).count() == 3


def test_run_worker_continues_after_one_uf_fails():
    factory = _factory()

    def adapter_factory(uf):
        if uf == "PR":
            return _FailingAdapter(uf="PR")
        return _StubAdapter("SP", [_row("2", "SP")])

    report = run_worker(["PR", "SP"], factory, adapter_factory=adapter_factory)

    assert report["PR"].summary is None
    assert "boom" in report["PR"].error
    # The healthy UF still ingested despite the earlier failure.
    assert report["SP"].summary.inserted == 1
    with factory() as s:
        assert s.query(Property).filter_by(source_id="2").count() == 1


def test_parse_ufs_splits_and_normalizes():
    assert parse_ufs("PR,SP") == ["PR", "SP"]
    assert parse_ufs("pr, sp ,rj") == ["PR", "SP", "RJ"]
    assert parse_ufs("PR") == ["PR"]
    assert parse_ufs("") == []


def test_run_worker_passes_limit_through_to_ingest():
    """limit=N on run_worker must reach ingest() so only N rows are processed."""
    factory = _factory()
    rows = [_row(str(i), "PR") for i in range(5)]
    adapter = _StubAdapter("PR", rows)
    report = run_worker(
        ["PR"], factory,
        adapter_factory=lambda uf: adapter,
        limit=2,
    )
    assert report["PR"].summary.inserted == 2
    with factory() as s:
        assert s.query(Property).count() == 2


def test_limited_worker_run_does_not_remove_unseen_rows():
    factory = _factory()
    first = _StubAdapter("PR", [_row("1", "PR"), _row("2", "PR")])
    run_worker(["PR"], factory, adapter_factory=lambda _: first)

    limited = _StubAdapter("PR", [_row("1", "PR"), _row("2", "PR")])
    report = run_worker(
        ["PR"], factory, adapter_factory=lambda _: limited, limit=1,
    )

    assert report["PR"].summary.removed == 0
    with factory() as session:
        assert session.query(Property).filter_by(status="active").count() == 2


def test_worker_exit_code_reflects_per_uf_failures():
    assert report_exit_code({"PR": UFResult(uf="PR")}) == 0
    assert report_exit_code({
        "PR": UFResult(uf="PR"),
        "SP": UFResult(uf="SP", error="boom"),
    }) == 1
