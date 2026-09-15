from __future__ import annotations
"""
Unit tests for backend/services/quality_scoring.py.

Covers the version -> weight-set contract: compute_overall_quality_score and
determine_pass must both derive the REQUIRED/scored dimension keys from the
resolved version's weight dict (QUALITY_WEIGHTS_BY_VERSION[version]), not
from a hardcoded QUALITY_WEIGHTS_V1 name -- so a version with a different
dimension set (v2 adds "narrative_voice_score") is fully controlled by its
own weights, both for scoring and for the pass/fail floor check.
"""
import pytest

from backend.services.quality_scoring import (
    QUALITY_MIN_DIMENSION_FLOOR,
    QUALITY_PASS_THRESHOLD,
    QUALITY_WEIGHTS_V1,
    QUALITY_WEIGHTS_V2,
    compute_overall_quality_score,
    determine_pass,
)

# All-high v1 dimensions -- comfortably clears both the overall threshold and
# the per-dimension floor under v1.
V1_HIGH_SCORES = {
    "factuality_score": 95.0,
    "citation_score": 90.0,
    "source_integrity_score": 92.0,
    "learning_quality_score": 88.0,
    "originality_score": 85.0,
    "readability_score": 90.0,
    "seo_score": 80.0,
    "geo_score": 80.0,
}


class TestV1BehaviorUnchanged:
    def test_all_high_v1_scores_pass_under_v1(self):
        computed = compute_overall_quality_score(V1_HIGH_SCORES, version="v1")
        assert computed["overall_score"] >= QUALITY_PASS_THRESHOLD
        assert determine_pass(V1_HIGH_SCORES, computed["overall_score"], version="v1") is True

    def test_v1_default_version_matches_explicit_v1(self):
        default_result = compute_overall_quality_score(V1_HIGH_SCORES)
        explicit_result = compute_overall_quality_score(V1_HIGH_SCORES, version="v1")
        assert default_result == explicit_result

    def test_v1_weights_still_sum_to_one(self):
        assert sum(QUALITY_WEIGHTS_V1.values()) == pytest.approx(1.0)

    def test_v1_missing_dimension_raises(self):
        incomplete = dict(V1_HIGH_SCORES)
        del incomplete["factuality_score"]
        with pytest.raises(ValueError, match="factuality_score"):
            compute_overall_quality_score(incomplete, version="v1")


class TestV2AddsNarrativeVoiceDimension:
    def test_v2_weights_sum_to_one_and_include_narrative_voice(self):
        assert sum(QUALITY_WEIGHTS_V2.values()) == pytest.approx(1.0)
        assert "narrative_voice_score" in QUALITY_WEIGHTS_V2

    def test_v1_only_dimensions_high_but_low_narrative_voice_fails_under_v2(self):
        # All eight v1 dimensions are high, plus a low narrative_voice_score.
        # Scored under v2, this must FAIL: the v2 weight set (not v1's) is
        # what determine_pass should be checking dimensions against.
        v2_scores = dict(V1_HIGH_SCORES, narrative_voice_score=10.0)

        computed = compute_overall_quality_score(v2_scores, version="v2")
        assert computed["version"] == "v2"

        passed = determine_pass(v2_scores, computed["overall_score"], version="v2")
        assert passed is False, (
            "A report with a low narrative_voice_score must fail under v2 "
            "even though every v1-only dimension looks great -- the min "
            "dimension floor must be enforced over v2's own key set."
        )

    def test_all_high_v2_scores_pass_under_v2(self):
        v2_scores = dict(V1_HIGH_SCORES, narrative_voice_score=90.0)
        computed = compute_overall_quality_score(v2_scores, version="v2")
        assert determine_pass(v2_scores, computed["overall_score"], version="v2") is True

    def test_v2_missing_narrative_voice_raises_in_compute(self):
        # v1-shaped input (no narrative_voice_score) scored under v2 must
        # raise -- v2 requires the ninth dimension, it isn't optional.
        with pytest.raises(ValueError, match="narrative_voice_score"):
            compute_overall_quality_score(V1_HIGH_SCORES, version="v2")

    def test_v2_missing_narrative_voice_raises_in_determine_pass(self):
        # Even if overall_score was somehow computed elsewhere, determine_pass
        # itself must also validate the version's required key set before
        # applying the per-dimension floor.
        with pytest.raises(ValueError, match="narrative_voice_score"):
            determine_pass(V1_HIGH_SCORES, 99.0, version="v2")


class TestUnknownVersionAndDimensionFloor:
    def test_unknown_version_raises_in_compute(self):
        with pytest.raises(ValueError, match="Unknown quality scoring version"):
            compute_overall_quality_score(V1_HIGH_SCORES, version="v999")

    def test_unknown_version_raises_in_determine_pass(self):
        with pytest.raises(ValueError, match="Unknown quality scoring version"):
            determine_pass(V1_HIGH_SCORES, 99.0, version="v999")

    def test_single_low_dimension_fails_v1_even_with_high_overall(self):
        scores = dict(V1_HIGH_SCORES, geo_score=10.0)
        computed = compute_overall_quality_score(scores, version="v1")
        # geo_score's small weight (0.05) keeps the weighted overall score
        # above threshold, but the per-dimension floor must still fail it.
        assert computed["overall_score"] >= QUALITY_PASS_THRESHOLD
        assert scores["geo_score"] < QUALITY_MIN_DIMENSION_FLOOR
        assert determine_pass(scores, computed["overall_score"], version="v1") is False
