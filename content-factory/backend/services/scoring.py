"""Opportunity scoring for content topics.

Computes a weighted opportunity score from explicit sub-scores, per
SLAD_AI_CONTENT_FACTORY.md section 5.2. All inputs and the output are on a
0-100 scale.
"""

DEFAULT_WEIGHTS = {
    "demand": 0.25,
    "trend": 0.20,
    "content_gap": 0.20,
    "competition": 0.15,
    "audience_relevance": 0.10,
    "business_value": 0.10,
}


def compute_opportunity_score(
    demand: float,
    trend: float,
    content_gap: float,
    competition: float,
    audience_relevance: float,
    business_value: float,
    weights: dict | None = None,
) -> float:
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
            for the result to remain on the 0-100 scale.

    Returns:
        The weighted opportunity score, on a 0-100 scale.

    Raises:
        ValueError: if any input sub-score is outside [0, 100], or if
            `weights` contains an unknown key.
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

    effective_weights = dict(DEFAULT_WEIGHTS)
    if weights:
        unknown = set(weights) - set(DEFAULT_WEIGHTS)
        if unknown:
            raise ValueError(f"Unknown weight key(s): {sorted(unknown)}")
        effective_weights.update(weights)

    score = sum(
        sub_scores[key] * effective_weights[key] for key in DEFAULT_WEIGHTS
    )
    return round(score, 4)
