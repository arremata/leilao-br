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
    assert result.raw_score == score
    assert result.comparable_count == count
    assert result.radius_applied is True
    assert result.complete_high_confidence_data is True
    assert result.qualifies_as_high is (count >= 4)


def test_incomplete_comparables_keep_partial_score_but_cannot_receive_high_confidence():
    result = calculate_market_confidence(_subject(), _comparables(5, beds=None))

    assert result.level == "medium"
    assert result.score == 70
    assert result.raw_score > 70
    assert result.comparable_count == 5
    assert result.radius_applied is True
    assert result.complete_high_confidence_data is False
    assert result.qualifies_as_high is False


def test_missing_subject_coordinates_keeps_non_location_evidence():
    subject = _subject()
    subject.lat = None
    subject.lng = None

    result = calculate_market_confidence(subject, _comparables(4, beds=None))

    assert result.comparable_count == 4
    assert result.quantity_score == 40
    assert result.subject_similarity_score > 0
    assert result.group_consistency_score > 0
    assert result.score > 40
    assert result.radius_applied is False
    assert result.complete_high_confidence_data is False
    assert result.qualifies_as_high is False


def test_area_similarity_is_continuous_and_symmetric():
    subject = _subject()
    subject.area_m2 = 171.19
    comparable = _comparables(1)[0]
    comparable.area_m2 = 212

    result = calculate_market_confidence(subject, [comparable])

    expected_area_points = 2.4 * (171.19 / 212)
    assert result.subject_similarity_score == pytest.approx(
        round(2.1 + expected_area_points + 0.9 + 0.6, 2)
    )

    subject.area_m2, comparable.area_m2 = comparable.area_m2, subject.area_m2
    reversed_result = calculate_market_confidence(subject, [comparable])
    assert reversed_result.subject_similarity_score == result.subject_similarity_score


def test_debug_keeps_raw_score_when_final_score_is_capped_by_high_gate():
    comparables = _comparables(5)
    for index, comparable in enumerate(comparables):
        comparable.area_m2 = 46 if index % 2 == 0 else 94
        comparable.price_per_m2 = 1_000 + index * 3_000

    result = calculate_market_confidence(_subject(), comparables)

    assert result.raw_score > 70
    assert result.group_consistency_score < 12
    assert result.score == 70
    assert result.level == "medium"
    assert result.qualifies_as_high is False
