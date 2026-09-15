from __future__ import annotations
"""
Unit tests for backend/services/scoring.py's compute_opportunity_score
determinism (plan §12: "scoring determinism (same inputs + same version ->
same score)"). Written against the CURRENT signature found in the file at
the time of writing -- compute_opportunity_score(demand, trend, content_gap,
competition, audience_relevance, business_value, weights=None,
version=SCORING_VERSION) -> dict with "score"/"version"/"breakdown" keys.
A parallel workstream owns scoring.py itself (scoring versioning, plan §7);
these tests deliberately do not assert anything about the internal weight
formula beyond determinism + the documented public contract, so they should
keep passing across in-flight edits to that file as long as the function
signature and return shape stay stable.
"""
import pytest

from backend.services.scoring import (
    DEFAULT_WEIGHTS,
    SCORING_VERSION,
    compute_opportunity_score,
)

SAMPLE_INPUTS = dict(
    demand=80.0,
    trend=70.0,
    content_gap=60.0,
    competition=50.0,
    audience_relevance=90.0,
    business_value=65.0,
)


class TestComputeOpportunityScoreDeterminism:
    def test_same_inputs_same_version_produce_same_score(self):
        result_a = compute_opportunity_score(**SAMPLE_INPUTS)
        result_b = compute_opportunity_score(**SAMPLE_INPUTS)
        assert result_a["score"] == result_b["score"]

    def test_same_inputs_produce_byte_identical_result_dict(self):
        # Full-dict equality, not just the score -- version/breakdown must
        # also be reproducible for the same inputs.
        result_a = compute_opportunity_score(**SAMPLE_INPUTS)
        result_b = compute_opportunity_score(**SAMPLE_INPUTS)
        assert result_a == result_b

    def test_many_repeated_calls_all_agree(self):
        results = [compute_opportunity_score(**SAMPLE_INPUTS) for _ in range(25)]
        scores = {r["score"] for r in results}
        assert len(scores) == 1

    def test_different_inputs_produce_different_score(self):
        result_a = compute_opportunity_score(**SAMPLE_INPUTS)
        other_inputs = dict(SAMPLE_INPUTS, demand=10.0)
        result_b = compute_opportunity_score(**other_inputs)
        assert result_a["score"] != result_b["score"]

    def test_result_is_stamped_with_the_requested_version(self):
        result = compute_opportunity_score(**SAMPLE_INPUTS, version=SCORING_VERSION)
        assert result["version"] == SCORING_VERSION

    def test_breakdown_records_sub_scores_and_weights(self):
        result = compute_opportunity_score(**SAMPLE_INPUTS)
        assert result["breakdown"]["sub_scores"] == SAMPLE_INPUTS
        assert set(result["breakdown"]["weights"].keys()) == set(DEFAULT_WEIGHTS.keys())

    def test_score_is_within_0_100_for_in_range_inputs(self):
        result = compute_opportunity_score(**SAMPLE_INPUTS)
        assert 0 <= result["score"] <= 100

    def test_all_zero_inputs_yield_zero_score(self):
        zero_inputs = {k: 0.0 for k in SAMPLE_INPUTS}
        result = compute_opportunity_score(**zero_inputs)
        assert result["score"] == 0

    def test_all_max_inputs_yield_max_score_when_weights_sum_to_one(self):
        max_inputs = {k: 100.0 for k in SAMPLE_INPUTS}
        result = compute_opportunity_score(**max_inputs)
        assert result["score"] == pytest.approx(100.0)

    def test_out_of_range_input_raises_value_error(self):
        bad_inputs = dict(SAMPLE_INPUTS, demand=150.0)
        with pytest.raises(ValueError):
            compute_opportunity_score(**bad_inputs)

    def test_negative_input_raises_value_error(self):
        bad_inputs = dict(SAMPLE_INPUTS, trend=-5.0)
        with pytest.raises(ValueError):
            compute_opportunity_score(**bad_inputs)

    def test_unknown_weight_key_raises_value_error(self):
        with pytest.raises(ValueError):
            compute_opportunity_score(**SAMPLE_INPUTS, weights={"not_a_real_dimension": 0.5})

    def test_unknown_version_raises_value_error(self):
        with pytest.raises(ValueError):
            compute_opportunity_score(**SAMPLE_INPUTS, version="v999-does-not-exist")

    def test_custom_weights_override_defaults_deterministically(self):
        custom_weights = {"demand": 1.0, "trend": 0.0, "content_gap": 0.0,
                           "competition": 0.0, "audience_relevance": 0.0, "business_value": 0.0}
        result_a = compute_opportunity_score(**SAMPLE_INPUTS, weights=custom_weights)
        result_b = compute_opportunity_score(**SAMPLE_INPUTS, weights=custom_weights)
        assert result_a["score"] == result_b["score"] == pytest.approx(SAMPLE_INPUTS["demand"])
