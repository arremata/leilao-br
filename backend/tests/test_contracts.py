import pytest
from pydantic import ValidationError


def test_risk_flags_accepts_valid_values():
    from graph.contracts import RiskFlags

    flags = RiskFlags(j="good", f="warn")
    assert flags.j == "good"
    assert flags.f == "warn"


def test_risk_flags_rejects_invalid_values():
    from graph.contracts import RiskFlags

    with pytest.raises(ValidationError):
        RiskFlags(j="excellent", f="warn")


def test_auction_property_result_has_all_fields():
    from graph.contracts import AuctionPropertyResult, RiskFlags

    result = AuctionPropertyResult(
        id="abc123",
        photo_label="APTO · VILA MADALENA · SP",
        title="Apto. 78 m², Rua Harmonia",
        address="R. Harmonia, 412",
        type="Apartamento",
        neighborhood="Vila Madalena",
        city="São Paulo, SP",
        auction_type="1ª praça",
        auctioneer="Zukerman Leilões",
        court="7ª Vara Cível SP",
        discount=42.0,
        min_bid=312000.0,
        market=540000.0,
        roi=38.0,
        area=78.0,
        beds=2,
        baths=2,
        parking=1,
        floor="7º",
        ends_at="2026-05-15T14:30:00",
        risk=RiskFlags(j="good", f="good"),
        appraisal=0.0,
        auction_discount=0.0,
    )
    assert result.risk.j == "good"
    assert result.beds == 2
    # score field removed
    assert not hasattr(result, "score")


def test_auction_property_result_optional_fields_can_be_none():
    from graph.contracts import AuctionPropertyResult, RiskFlags

    result = AuctionPropertyResult(
        id="abc123",
        photo_label="TERRENO · ALPHAVILLE · SP",
        title="Terreno 600 m², Quadra 12",
        address="Al. Tocantins, Q12 L8",
        type="Terreno",
        neighborhood="Alphaville",
        city="Barueri, SP",
        auction_type="Judicial",
        auctioneer="Biasi Leilões",
        court="1ª Vara Cível Barueri",
        discount=29.0,
        min_bid=580000.0,
        market=820000.0,
        roi=12.0,
        area=600.0,
        beds=None,
        baths=None,
        parking=None,
        floor=None,
        ends_at="2026-05-18T00:00:00",
        risk=RiskFlags(j="bad", f="warn"),
        appraisal=0.0,
        auction_discount=0.0,
    )
    assert result.beds is None
    assert result.floor is None


def test_auction_property_result_serializes_to_json():
    from graph.contracts import AuctionPropertyResult, RiskFlags

    result = AuctionPropertyResult(
        id="abc123",
        photo_label="APTO · VILA MADALENA · SP",
        title="Apto. 78 m², Rua Harmonia",
        address="R. Harmonia, 412",
        type="Apartamento",
        neighborhood="Vila Madalena",
        city="São Paulo, SP",
        auction_type="1ª praça",
        auctioneer="Zukerman Leilões",
        court="—",
        discount=42.0,
        min_bid=312000.0,
        market=540000.0,
        roi=38.0,
        area=78.0,
        beds=None,
        baths=None,
        parking=None,
        floor=None,
        ends_at="2026-05-15T14:30:00",
        risk=RiskFlags(j="good", f="good"),
        appraisal=0.0,
        auction_discount=0.0,
    )
    json_str = result.model_dump_json()
    import json
    parsed = json.loads(json_str)
    assert "score" not in parsed  # score field removed
    assert parsed["risk"]["j"] == "good"
    assert parsed["beds"] is None


def test_result_has_appraisal_and_auction_discount_fields():
    """AuctionPropertyResult must expose appraisal (edital) and auctionDiscount (official deságio)."""
    from graph.contracts import AuctionPropertyResult, RiskFlags
    r = AuctionPropertyResult(
        id="x", photo_label="", title="", address="", type="",
        neighborhood="", city="", auction_type="Judicial", auctioneer="—",
        court="—", discount=10.0, min_bid=100000.0, market=150000.0,
        roi=0.0, area=50.0, ends_at="",
        risk=RiskFlags(j="good", f="good"),
        appraisal=180000.0,
        auction_discount=44.4,
    )
    dumped = r.model_dump(by_alias=True)
    assert dumped["appraisal"] == 180000.0
    assert dumped["auctionDiscount"] == 44.4


def test_scoring_result_model():
    from graph.contracts import ScoringResult, RiskFlags

    sr = ScoringResult(
        risk=RiskFlags(j="good", f="good"),
        roi=38.0,
    )
    assert sr.roi == 38.0
    assert sr.risk.j == "good"
    # score field removed
    assert not hasattr(sr, "score")
