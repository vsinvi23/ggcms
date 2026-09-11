from __future__ import annotations
"""Opportunity scoring for content topics.

Computes a weighted opportunity score from explicit sub-scores, per
SLAD_AI_CONTENT_FACTORY.md section 5.2. All inputs and the output are on a
0-100 scale.

Scoring is versioned (see docs/architecture/
AUTONOMOUS_CONTENT_FACTORY_IMPLEMENTATION_PLAN.md §7): each named weight
set has a corresponding version string, so an `Opportunity` can be stamped
with the exact version/weights/sub-scores that produced its score and keep
that stamp even if the default weights change later.
"""

# Original default weights, kept under its original name for backward
# compatibility with any existing importers (e.g. `weights=DEFAULT_WEIGHTS`
# overrides). Aliased below as the v1 versioned weight set.
DEFAULT_WEIGHTS = {
    "demand": 0.25,
    "trend": 0.20,
    "content_gap": 0.20,
    "competition": 0.15,
    "audience_relevance": 0.10,
    "business_value": 0.10,
}

# Versioned weight sets. v1 is simply DEFAULT_WEIGHTS under a version label;
# future weight changes should add a new SCORING_WEIGHTS_v2 etc. and bump
# SCORING_VERSION, leaving v1 (and any Opportunity already stamped with it)
# unchanged.
SCORING_WEIGHTS_V1 = DEFAULT_WEIGHTS
SCORING_VERSION = "v1"

SCORING_WEIGHTS_BY_VERSION = {
    SCORING_VERSION: SCORING_WEIGHTS_V1,
}


def compute_opportunity_score(
    demand: float,
    trend: float,
    content_gap: float,
    competition: float,
    audience_relevance: float,
    business_value: float,
    weights: dict | None = None,
    version: str = SCORING_VERSION,
) -> dict:
    """Compute the weighted opportunity score.

    Args:
        demand: Demand sub-score (0-100).
        trend: Trend sub-score (0-100).
        content_gap: Content gap sub-score (0-100).
        competition: Competition sub-score (0-100).
        audience_relevance: Audience relevance sub-score (0-100).
        business_value: Business value sub-score (0-100).
        weights: Optional override dict with the same keys as
            DEFAULT_WEIGHTS. Missing keys fall back to the default weight
            for that key. Weights need not sum to 1.0 exactly, but should
            for the result to remain on the 0-100 scale. Takes precedence
            over `version`'s weight set for any key it specifies.
        version: The scoring version whose default weight set to use as
            the base (before any `weights` override is applied). Defaults
            to the current `SCORING_VERSION`. This is the version string
            stamped onto the returned result, so callers persisting it
            (e.g. onto `Opportunity.opportunity_score_version`) get a
            truthful record of which weight set produced the score.

    Returns:
        A dict with:
            - "score": the weighted opportunity score, on a 0-100 scale.
            - "version": the scoring version string used (`version`).
            - "breakdown": {"sub_scores": {...}, "weights": {...}} —
              the exact per-dimension inputs and effective weights applied,
              suitable for `Opportunity.scoring_breakdown`.

    Raises:
        ValueError: if any input sub-score is outside [0, 100], if
            `weights` contains an unknown key, or if `version` is not a
            known scoring version.
    """
    sub_scores = {
        "demand": demand,
        "trend": trend,
        "content_gap": content_gap,
        "competition": competition,
        "audience_relevance": audience_relevance,
        "business_value": business_value,
    }

    for name, value in sub_scores.items():
        if not 0 <= value <= 100:
            raise ValueError(f"{name} must be between 0 and 100, got {value}")

    base_weights = SCORING_WEIGHTS_BY_VERSION.get(version)
    if base_weights is None:
        raise ValueError(f"Unknown scoring version: {version!r}")

    effective_weights = dict(base_weights)
    if weights:
        unknown = set(weights) - set(DEFAULT_WEIGHTS)
        if unknown:
            raise ValueError(f"Unknown weight key(s): {sorted(unknown)}")
        effective_weights.update(weights)

    score = sum(
        sub_scores[key] * effective_weights[key] for key in DEFAULT_WEIGHTS
    )
    return {
        "score": round(score, 4),
        "version": version,
        "breakdown": {
            "sub_scores": sub_scores,
            "weights": effective_weights,
        },
    }
