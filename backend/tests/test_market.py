from graph.market import calculate_market, market_node
from graph.state import AuctionState, ComparableProperty, PropertyMetadata


def _metadata():
    return PropertyMetadata(
        address="Rua das Flores, 123", property_type="Apartamento",
        area_m2=80.0, auction_price=350_000.0,
        city="São Paulo", neighborhood="Centro", state="SP",
    )


def _comp(index, price_per_m2):
    return ComparableProperty(
        address=f"Rua {index}", price=price_per_m2 * 80, area_m2=80,
        price_per_m2=price_per_m2, source="Fonte", url=f"https://site/{index}",
    )


class TestCalculateMarket:
    def test_uses_median_of_valid_comparables(self):
        result = calculate_market(
            _metadata(), [_comp(1, 10_000), _comp(2, 12_000), _comp(3, 14_000)],
        )
        assert result.price_per_m2_neighborhood == 12_000
        assert result.discount_percentage == 63.54
        assert len(result.comparable_properties) == 3

    def test_filters_large_outlier(self):
        result = calculate_market(
            _metadata(), [_comp(1, 10_000), _comp(2, 11_000), _comp(3, 100_000)],
        )
        assert result.price_per_m2_neighborhood == 10_500
        assert len(result.comparable_properties) == 2

    def test_falls_back_to_persisted_reference(self):
        result = calculate_market(_metadata(), [], regional_price_per_m2=9_000)
        assert result.price_per_m2_neighborhood == 9_000
        assert result.comparable_properties == []

    def test_no_reference_returns_unknown_zero(self):
        result = calculate_market(_metadata(), [])
        assert result.price_per_m2_neighborhood == 0
        assert result.discount_percentage == 0


class TestMarketNode:
    def test_uses_only_passed_persisted_data(self):
        comps = [_comp(1, 10_000), _comp(2, 12_000), _comp(3, 14_000)]
        result = market_node(
            AuctionState(property_metadata=_metadata()),
            regional_price_per_m2=12_000,
            persisted_comparables=comps,
        )
        assert result["market_result"].price_per_m2_neighborhood == 12_000

    def test_no_metadata(self):
        result = market_node(AuctionState())
        assert result["market_result"].price_per_m2_neighborhood == 0
        assert "errors" in result

    def test_missing_reference_is_non_blocking(self):
        result = market_node(AuctionState(property_metadata=_metadata()))
        assert result["market_result"].price_per_m2_neighborhood == 0
        assert "errors" not in result
