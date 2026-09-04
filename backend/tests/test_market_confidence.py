import pytest

from graph.market_confidence import calculate_market_confidence
from graph.state import ComparableProperty, PropertyMetadata


def _subject():
    return PropertyMetadata(
        property_type="Apartamento", area_m2=70, beds=2,
        lat=-25.4284, lng=-49.2733,
    )


def _comparables(count: int, *, beds=2):
    return [
        ComparableProperty(
            address=f"Rua {index}", property_type="Apartamento",
            price=350_000, area_m2=70, beds=beds, price_per_m2=5_000,
            source="Portal", url=f"https://portal/{index}",
            lat=-25.4284, lng=-49.2733,
        )
        for index in range(count)
    ]


@pytest.mark.parametrize(("count", "score", "level", "group_score"), [
    (1, 16, "low", 0),
    (2, 37, "medium", 5),
    (3, 58, "medium", 10),
    (4, 79, "high", 15),
    (5, 100, "high", 20),
])
def test_perfect_comparable_scenarios(count, score, level, group_score):
    result = calculate_market_confidence(_subject(), _comparables(count))

    assert result.score == score
    assert result.level == level
    assert result.quantity_score == count * 10
    assert result.subject_similarity_score == count * 6
    assert result.group_consistency_score == group_score


def test_incomplete_comparables_cannot_receive_high_confidence():
    result = calculate_market_confidence(_subject(), _comparables(5, beds=None))

    assert result.level == "low"
    assert result.score == 0
