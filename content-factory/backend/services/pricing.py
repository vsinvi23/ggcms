"""Static per-model token pricing used for AI generation cost estimation.

Prices are USD cost per 1,000 tokens, split by input/output, since most
vendors (Gemini, Anthropic) charge asymmetric rates for prompt vs completion
tokens.

IMPORTANT: These figures are approximate placeholders based on publicly
published list pricing at the time this file was written. They are NOT
pulled from a live pricing API and will drift out of date. Update them from
the vendor pricing pages before relying on this for real budget/billing
decisions:
  - Gemini: https://ai.google.dev/gemini-api/docs/pricing
  - Anthropic (Claude): https://www.anthropic.com/pricing

Model names below match (as case-insensitive substrings) the values
configured in backend/configs/settings.py (gemini_model_planner/
researcher/writer/reviewer, gemini_cheap_model, claude_model_*,
claude_cheap_model) and resolved via backend/services/model_provider.py's
get_llm/get_llm_for_tier.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelPrice:
    input_cost_per_1k: float
    output_cost_per_1k: float


# Keys are matched as case-insensitive substrings against the actual model
# name passed to estimate_cost (e.g. "gemini-1.5-pro-002" matches the
# "gemini-1.5-pro" key). Order doesn't matter for lookup -- see
# estimate_cost's matching logic below.
MODEL_PRICING: dict[str, ModelPrice] = {
    # --- Gemini (approximate, USD per 1k tokens) ---
    "gemini-1.5-flash-8b": ModelPrice(input_cost_per_1k=0.0000375, output_cost_per_1k=0.00015),
    "gemini-1.5-flash": ModelPrice(input_cost_per_1k=0.000075, output_cost_per_1k=0.0003),
    "gemini-1.5-pro": ModelPrice(input_cost_per_1k=0.00125, output_cost_per_1k=0.005),
    "gemini-1.0-pro": ModelPrice(input_cost_per_1k=0.0005, output_cost_per_1k=0.0015),

    # --- Anthropic Claude (approximate, USD per 1k tokens) ---
    "claude-haiku-4-5": ModelPrice(input_cost_per_1k=0.001, output_cost_per_1k=0.005),
    "claude-sonnet-5": ModelPrice(input_cost_per_1k=0.003, output_cost_per_1k=0.015),
    "claude-opus": ModelPrice(input_cost_per_1k=0.015, output_cost_per_1k=0.075),
}

# Conservative fallback for any model name that doesn't match a known key
# above -- deliberately the highest known per-1k rate (both input and
# output) so an unrecognized/new model never silently under-charges against
# the budget caps in cost_tracker.py.
_FALLBACK_PRICE = ModelPrice(
    input_cost_per_1k=max(p.input_cost_per_1k for p in MODEL_PRICING.values()),
    output_cost_per_1k=max(p.output_cost_per_1k for p in MODEL_PRICING.values()),
)


def _lookup_price(model_name: str) -> ModelPrice:
    """Case-insensitive substring match of model_name against MODEL_PRICING
    keys. Falls back to the conservative _FALLBACK_PRICE when no key
    matches. If multiple keys match, the longest (most specific) key wins
    -- e.g. "gemini-1.5-flash-8b" over "gemini-1.5-flash" for a model name
    that contains both substrings.
    """
    if not model_name:
        return _FALLBACK_PRICE

    lowered = model_name.lower()
    matches = [key for key in MODEL_PRICING if key in lowered]
    if not matches:
        return _FALLBACK_PRICE

    best_key = max(matches, key=len)
    return MODEL_PRICING[best_key]


def estimate_cost(model_name: str, input_tokens: int, output_tokens: int) -> float:
    """Estimate USD cost for a single LLM call given its model name and
    token counts.

    Looks up MODEL_PRICING by case-insensitive substring match on
    model_name; unrecognized models fall back to the conservative
    (highest known rate) bucket so unknown models never under-charge
    silently against budget caps.
    """
    price = _lookup_price(model_name)
    return (
        (input_tokens / 1000.0) * price.input_cost_per_1k
        + (output_tokens / 1000.0) * price.output_cost_per_1k
    )
