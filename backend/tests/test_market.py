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

    def test_land_never_extrapolates_regional_price_per_m2(self):
        metadata = _metadata()
        metadata.property_type = "Terreno"
        metadata.area_m2 = 72_600
        result = calculate_market(
            metadata, [_comp(1, 2_556)], regional_price_per_m2=2_556,
        )
        assert result.price_per_m2_neighborhood == 0
        assert result.comparable_properties == []
        assert result.discount_percentage == 0

    def test_land_aliases_are_guarded(self):
        for property_type in ("Lote", "Gleba rural"):
            metadata = _metadata()
            metadata.property_type = property_type
            result = calculate_market(metadata, [], regional_price_per_m2=5_000)
            assert result.price_per_m2_neighborhood == 0

    def test_rejects_subject_auction_ad_and_dissimilar_area(self):
        own_ad = ComparableProperty(
            address="Rua das Flores, 123", price=350_000, area_m2=80,
            price_per_m2=4_375, source="Fonte", url="https://site/imovel",
        )
        too_large = ComparableProperty(
            address="Rua Vizinha, 10", price=1_600_000, area_m2=200,
            price_per_m2=8_000, source="Fonte", url="https://site/grande",
        )
        valid = _comp(1, 10_000)
        result = calculate_market(_metadata(), [own_ad, too_large, valid])
        assert result.comparable_properties == [valid]
        assert result.price_per_m2_neighborhood == 10_000

    def test_limits_results_to_five_within_two_kilometres(self):
        metadata = _metadata()
        metadata.beds = 2
        metadata.lat = -25.4284
        metadata.lng = -49.2733
        nearby = [
            ComparableProperty(
                address=f"Rua {index}", property_type="Apartamento",
                price=400_000, area_m2=80, beds=2, price_per_m2=5_000,
                source="Fonte", url=f"https://site/{index}",
                lat=-25.4284, lng=-49.2733 + index * 0.001,
            )
            for index in range(7)
        ]
        too_far = ComparableProperty(
            address="Rua distante", property_type="Apartamento",
            price=400_000, area_m2=80, beds=2, price_per_m2=5_000,
            source="Fonte", url="https://site/far",
            lat=-25.4284, lng=-49.2433,
        )

        result = calculate_market(metadata, [too_far, *reversed(nearby)])

        assert len(result.comparable_properties) == 5
        assert too_far not in result.comparable_properties
        assert all(item.distance_km <= 2 for item in result.comparable_properties)
        assert result.confidence_level == "high"

    def test_rejects_a_different_known_property_type(self):
        metadata = _metadata()
        house = _comp(1, 10_000)
        house.property_type = "Casa"

        result = calculate_market(metadata, [house])

        assert result.comparable_properties == []


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
