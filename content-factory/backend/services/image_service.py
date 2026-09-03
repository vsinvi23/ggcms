"""Placeholder image generation for section/lesson illustrations.

STUB: this module does not call any real image-generation provider. It
exists so the pipeline can plan for illustrative images (one per article
section / course lesson) ahead of actually wiring up a provider. Replace
`generate_placeholder_image` with a real API call (and add the relevant
provider config) when image generation is implemented for real.
"""

# A stable, local placeholder path. Any provider-specific config (API keys,
# base URLs, model names) would be added alongside a real implementation --
# intentionally absent here.
PLACEHOLDER_IMAGE_PATH = "/static/placeholder-image.svg"


def generate_placeholder_image(prompt: str) -> str:
    """
    Returns a fixed placeholder image reference for the given visual prompt.

    This is a stub: it makes no network calls and requires no API keys. It
    ignores `prompt` today (kept as a parameter so callers already pass the
    right shape of input once a real image provider is wired in) and always
    returns the same local placeholder path.
    """
    return PLACEHOLDER_IMAGE_PATH
