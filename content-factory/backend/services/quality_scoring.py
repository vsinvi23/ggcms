from __future__ import annotations
"""Quality-gate scoring for generated content.

Computes a weighted overall quality score from the eight per-dimension
scores on `QualityReport`, per docs/architecture/
AUTONOMOUS_CONTENT_FACTORY_IMPLEMENTATION_PLAN.md section 8 ("Quality Gate --
Making Thresholds Explicit"). All inputs and the output are on a 0-100
scale, mirroring `services/scoring.py`'s pattern (versioned weights
constant + a pure compute function) so the two scoring subsystems stay
consistent in shape even though they score different things (topic
opportunity vs. generated-content quality).

Unlike `services/scoring.py::compute_opportunity_score`, this module also
owns the deterministic PASS/FAIL decision for the quality gate: an LLM
decides individual dimension scores, but whether the report as a whole
`passed` is a pure function of those numbers plus two documented
constants (`QUALITY_PASS_THRESHOLD`, `QUALITY_MIN_DIMENSION_FLOOR`) -- never
an LLM's own yes/no judgment call. See `backend/agents/quality_agent.py`.
"""

# The eight dimensions from QualityReport (backend/models/domain.py). Weights
# reflect that a factually wrong or uncited/ungrounded article is a much
# worse outcome than one that is merely a little dry or under-optimized for
# search/generative-engine discovery:
#   - factuality (0.25) and citation (0.15) are the two existing "is this
#     actually true and attributed" checks -- weighted highest.
#   - source_integrity (0.15) is the new dimension (plan section 8): does the
#     content's sourcing hang together as a whole (not just per-claim
#     citation presence, which citation_score already covers). Weighted on
#     par with citation since both are grounding-in-evidence signals.
#   - learning_quality (0.15) matters because this is a *learning* content
#     factory -- pedagogically confusing content fails its purpose even if
#     every fact is correct.
#   - originality (0.10) and readability (0.10) are real quality signals but
#     more about polish than correctness.
#   - seo (0.05) and geo (0.05) are the smallest weights: valuable for
#     discovery, but a perfectly-optimized article built on shaky facts or
#     poor sourcing should not be able to out-score a wrong-but-SEO'd one.
# Sums to 1.0.
QUALITY_WEIGHTS_V1 = {
    "factuality_score": 0.25,
    "citation_score": 0.15,
    "source_integrity_score": 0.15,
    "learning_quality_score": 0.15,
    "originality_score": 0.10,
    "readability_score": 0.10,
    "seo_score": 0.05,
    "geo_score": 0.05,
}

# v2 adds a ninth dimension, "narrative_voice_score" -- does the content read
# in a consistent, engaging voice rather than generic/robotic prose. All
# weights are rebalanced (still summing to 1.0) so the new dimension carries
# real weight without disturbing the relative ordering established in v1
# (factuality/citation/source_integrity still weighted highest; seo/geo still
# smallest).
QUALITY_WEIGHTS_V2 = {
    "factuality_score": 0.22,
    "citation_score": 0.13,
    "source_integrity_score": 0.13,
    "learning_quality_score": 0.13,
    "narrative_voice_score": 0.13,
    "originality_score": 0.09,
    "readability_score": 0.09,
    "seo_score": 0.04,
    "geo_score": 0.04,
}

QUALITY_SCORING_VERSION = "v1"

QUALITY_WEIGHTS_BY_VERSION = {
    "v1": QUALITY_WEIGHTS_V1,
    "v2": QUALITY_WEIGHTS_V2,
}

# Deterministic PASS/FAIL constants (plan section 8). `passed` is computed
# from these two numbers alone -- no LLM judgment call is part of the
# decision. Both are on the same 0-100 scale as the dimension scores.
#   - QUALITY_PASS_THRESHOLD: the weighted overall_score must clear this bar.
#   - QUALITY_MIN_DIMENSION_FLOOR: additionally, no single dimension may be
#     "carried" by the others -- e.g. a report cannot pass on the strength of
#     great SEO/readability while factuality craters, even if the weighted
#     average alone would clear QUALITY_PASS_THRESHOLD.
QUALITY_PASS_THRESHOLD = 75.0
QUALITY_MIN_DIMENSION_FLOOR = 50.0


def compute_overall_quality_score(
    report_scores: dict,
    weights: dict | None = None,
    version: str = QUALITY_SCORING_VERSION,
) -> dict:
    """Compute the weighted overall quality score for a QualityReport.

    Args:
        report_scores: dict keyed by the same names as QUALITY_WEIGHTS_V1
            (factuality_score, citation_score, source_integrity_score,
            learning_quality_score, originality_score, readability_score,
            seo_score, geo_score), each a 0-100 float. All eight keys are
            required -- this function does not silently treat a missing
            dimension as 0 or skip it, since that would make the weighted
            average misleading.
        weights: Optional override dict with the same keys as
            QUALITY_WEIGHTS_V1. Missing keys fall back to the default
            weight for that key. Takes precedence over `version`'s weight
            set for any key it specifies.
        version: The quality-scoring version whose default weight set to
            use as the base. Defaults to the current
            QUALITY_SCORING_VERSION. Stamped onto the returned result.

    Returns:
        A dict with:
            - "overall_score": the weighted overall score, 0-100 scale.
            - "version": the scoring version string used.
            - "breakdown": {"scores": {...}, "weights": {...}} -- the exact
              per-dimension inputs and effective weights applied.

    Raises:
        ValueError: if any required dimension is missing from
            `report_scores`, if any score is outside [0, 100], if `weights`
            contains an unknown key, or if `version` is not known.
    """
    base_weights = QUALITY_WEIGHTS_BY_VERSION.get(version)
    if base_weights is None:
        raise ValueError(f"Unknown quality scoring version: {version!r}")

    required_keys = set(base_weights)

    missing = required_keys - set(report_scores)
    if missing:
        raise ValueError(f"Missing required quality dimension(s): {sorted(missing)}")

    scores = {key: report_scores[key] for key in required_keys}
    for name, value in scores.items():
        if value is None or not 0 <= value <= 100:
            raise ValueError(f"{name} must be between 0 and 100, got {value!r}")

    effective_weights = dict(base_weights)
    if weights:
        unknown = set(weights) - required_keys
        if unknown:
            raise ValueError(f"Unknown weight key(s): {sorted(unknown)}")
        effective_weights.update(weights)

    overall_score = sum(
        scores[key] * effective_weights[key] for key in required_keys
    )
    return {
        "overall_score": round(overall_score, 4),
        "version": version,
        "breakdown": {
            "scores": scores,
            "weights": effective_weights,
        },
    }


def determine_pass(
    report_scores: dict,
    overall_score: float,
    pass_threshold: float = QUALITY_PASS_THRESHOLD,
    min_dimension_floor: float = QUALITY_MIN_DIMENSION_FLOOR,
    version: str = QUALITY_SCORING_VERSION,
) -> bool:
    """Deterministically decide PASS/FAIL for a QualityReport.

    Pure function of numbers already computed -- no LLM judgment call. A
    report passes only if the weighted overall score clears
    `pass_threshold` AND every individual dimension required by `version`
    clears `min_dimension_floor` (so no single very-low dimension can be
    masked by strong scores elsewhere in the weighted average).

    `version` determines which set of dimension keys must be present and
    checked against the floor -- it must match the version that was used to
    produce `overall_score` (see `compute_overall_quality_score`), since a
    different version may score a different set of dimensions (e.g. v2 adds
    "narrative_voice_score").

    Raises:
        ValueError: if `version` is not known, or if any dimension required
            by that version is missing from `report_scores`.
    """
    required_keys = QUALITY_WEIGHTS_BY_VERSION.get(version)
    if required_keys is None:
        raise ValueError(f"Unknown quality scoring version: {version!r}")

    missing = set(required_keys) - set(report_scores)
    if missing:
        raise ValueError(f"Missing required quality dimension(s): {sorted(missing)}")

    if overall_score < pass_threshold:
        return False
    return all(
        report_scores.get(key) is not None and report_scores[key] >= min_dimension_floor
        for key in required_keys
    )
