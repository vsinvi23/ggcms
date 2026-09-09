"""Section/lesson illustrative image lookup.

Provider is Pexels; all provider-specific request/response handling lives in
this module so switching providers later is a config-scoped change. Image
lookup soft-fails to `None` on any error (missing key, HTTP error, no
results) -- a missing illustrative image should never fail the content
pipeline, mirroring the mock_mode / soft-fail pattern in
`web_search_service.py`.
"""

import logging

import httpx

from backend.configs.settings import settings

logger = logging.getLogger(__name__)

AGENT_NAME = "ImageService"
PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search"

# A stable, local placeholder path used by the legacy stub / as a last-resort
# fallback reference when no real image is available.
PLACEHOLDER_IMAGE_PATH = "/static/placeholder-image.svg"


async def get_section_image(prompt: str) -> str | None:
    """
    Returns a photo URL illustrating `prompt`, or None if no image is
    available.

    In mock mode, returns a deterministic mock URL (no network calls, no API
    key required) so pipeline runs stay reproducible in tests/dev. Outside
    mock mode, calls the Pexels API and returns the first result's photo
    URL. Any failure -- missing API key, HTTP error, no results -- soft-fails
    to None rather than raising, since a missing illustrative image should
    never fail the content pipeline.
    """
    if settings.mock_mode:
        return f"https://images.example.com/mock-image?query={prompt}"

    if not settings.pexels_api_key:
        logger.warning(f"[{AGENT_NAME}] PEXELS_API_KEY is not set; skipping image lookup for '{prompt}'.")
        return None

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                PEXELS_SEARCH_URL,
                headers={"Authorization": settings.pexels_api_key},
                params={"query": prompt, "per_page": 1},
            )
            response.raise_for_status()
            data = response.json()
    except Exception as e:
        logger.error(f"[{AGENT_NAME}] image lookup failed for prompt '{prompt}': {e}")
        return None

    photos = data.get("photos") or []
    if not photos:
        return None

    src = photos[0].get("src") or {}
    return src.get("large") or src.get("original") or src.get("medium")


def generate_placeholder_image(prompt: str) -> str:
    """
    Deprecated thin compat wrapper kept for any remaining callers that need a
    synchronous, always-non-None image reference. Prefer `get_section_image`
    (async, real Pexels lookup with soft-fail to None) for new code.
    """
    return PLACEHOLDER_IMAGE_PATH
