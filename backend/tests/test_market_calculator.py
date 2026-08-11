from graph.market import calculate_market, market_node
from graph.state import AuctionState, ComparableProperty, PropertyMetadata


def test_calculates_median_market_value_and_discount_without_llm():
    metadata = PropertyMetadata(area_m2=50, auction_price=100_000)
    comps = [
        ComparableProperty(price=200_000, area_m2=50, price_per_m2=4_000),
        ComparableProperty(price=250_000, area_m2=50, price_per_m2=5_000),
        ComparableProperty(price=300_000, area_m2=50, price_per_m2=6_000),
    ]

    result = calculate_market(metadata, comps)

    assert result.price_per_m2_neighborhood == 5_000
    assert result.discount_percentage == 60


def test_uses_cached_neighborhood_price_when_scrapers_return_nothing():
    metadata = PropertyMetadata(area_m2=50, auction_price=100_000)

    result = calculate_market(metadata, [], regional_price_per_m2=4_000)

    assert result.price_per_m2_neighborhood == 4_000
    assert result.comparable_properties == []


def test_request_market_node_uses_only_persisted_reference():
    state = AuctionState(
        property_metadata=PropertyMetadata(area_m2=50, auction_price=100_000),
    )

    result = market_node(state, regional_price_per_m2=4_000)["market_result"]

    assert result.price_per_m2_neighborhood == 4_000
    assert result.comparable_properties == []


def test_request_market_node_returns_unknown_without_reference():
    state = AuctionState(
        property_metadata=PropertyMetadata(area_m2=50, auction_price=100_000),
    )

    result = market_node(state)["market_result"]

    assert result.price_per_m2_neighborhood == 0
    assert result.discount_percentage == 0
