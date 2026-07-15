from db.base import get_engine, init_db, make_session_factory
from db.models import Property, PropertyEvent
from ingestion.adapters.base import RawListing
from ingestion.adapters.caixa_csv import CaixaCsvAdapter
from ingestion.run import ingest


class _StubAdapter(CaixaCsvAdapter):
    """Caixa adapter whose fetch_raw returns injected rows (no network)."""

    def __init__(self, uf, rows):
        super().__init__(uf=uf)
        self._rows = rows

    def fetch_raw(self):
        return self._rows


def _row(source_id, preco, modalidade="Venda Online"):
    return RawListing(
        source="caixa", source_id=source_id,
        raw={
            "source_id": source_id, "uf": "PR", "city": "CURITIBA",
            "neighborhood": "CENTRO", "address": f"RUA {source_id}",
            "preco": preco, "avaliacao": "200.000,00", "desconto_csv": "0",
            "descricao": "Casa, área total 50,00 m2, 2 quartos.",
            "modalidade": modalidade, "detail_url": "http://x",
        },
    )


def _factory():
    engine = get_engine("sqlite://")
    init_db(engine)
    return make_session_factory(engine)


def test_ingest_inserts_new_properties_and_new_events():
    factory = _factory()
    adapter = _StubAdapter("PR", [_row("1", "100.000,00"), _row("2", "90.000,00")])
    summary = ingest(factory, adapter)
    assert summary.inserted == 2
    with factory() as s:
        assert s.query(Property).count() == 2
        assert s.query(PropertyEvent).filter_by(event_type="new").count() == 2


def test_ingest_second_run_detects_price_change():
    factory = _factory()
    ingest(factory, _StubAdapter("PR", [_row("1", "100.000,00")]))
    summary = ingest(factory, _StubAdapter("PR", [_row("1", "80.000,00")]))
    assert summary.updated == 1
    with factory() as s:
        prop = s.query(Property).filter_by(source_id="1").one()
        assert prop.preco == 80000.0
        ev = s.query(PropertyEvent).filter_by(event_type="price_change").one()
        assert ev.old_value == "100000.0"
        assert ev.new_value == "80000.0"


def test_ingest_marks_missing_properties_removed():
    factory = _factory()
    ingest(factory, _StubAdapter("PR", [_row("1", "100.000,00"), _row("2", "90.000,00")]))
    summary = ingest(factory, _StubAdapter("PR", [_row("1", "100.000,00")]))
    assert summary.removed == 1
    with factory() as s:
        gone = s.query(Property).filter_by(source_id="2").one()
        assert gone.status == "removed"
        assert s.query(PropertyEvent).filter_by(event_type="removed").count() == 1


def test_ingest_geocodes_new_properties_when_geocoder_given():
    factory = _factory()

    class _Geo:
        def geocode(self, address):
            return (-25.4, -49.2)

    ingest(factory, _StubAdapter("PR", [_row("1", "100.000,00")]), geocoder=_Geo())
    with factory() as s:
        prop = s.query(Property).filter_by(source_id="1").one()
        assert prop.lat == -25.4
        assert prop.lng == -49.2
        assert prop.geocode_status == "ok"


from ingestion.run import _preco_changed, build_parser, run_cli


def test_preco_changed_ignores_subcent_noise():
    # Differences below half a cent are float noise, not real price changes.
    assert _preco_changed(100000.0, 100000.004) is False
    assert _preco_changed(100000.0, 100000.0) is False
    # A one-cent difference is a real change.
    assert _preco_changed(100000.0, 100000.01) is True
    # None handling: appearing/disappearing prices count as a change.
    assert _preco_changed(None, 100.0) is True
    assert _preco_changed(100.0, None) is True
    assert _preco_changed(None, None) is False


def test_build_parser_defaults():
    args = build_parser().parse_args([])
    assert args.source == "caixa"
    assert args.uf == "PR"
    assert args.file is None


def test_run_cli_with_file(tmp_path):
    csv_text = (
        "N° do imóvel;UF;Cidade;Bairro;Endereço;Preço;Valor de avaliação;Desconto;"
        "Descrição;Modalidade de venda;Link de acesso\n"
        "555;PR;CURITIBA;CENTRO;RUA Z, 9;10.000,00;20.000,00;50,0;"
        "Casa, área total 40,00 m2, 1 quarto.;Venda Online;http://x\n"
    )
    csv_file = tmp_path / "lista.csv"
    csv_file.write_bytes(csv_text.encode("latin-1"))

    factory = _factory()
    summary = run_cli(["--uf", "PR", "--file", str(csv_file)], session_factory=factory)
    assert summary.inserted == 1
    with factory() as s:
        assert s.query(Property).filter_by(source_id="555").count() == 1
