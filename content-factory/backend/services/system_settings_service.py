from __future__ import annotations
from backend.configs.settings import settings
from backend.models.domain import AppSetting
from backend.storage import file_store

# Fields the UI can override. Excludes database_url (stays .env-only -- live
# DB reconnection is out of scope/dangerous).
# factory_sync_secret is machine-to-machine only -- set via GCP Secret Manager,
# never via the UI to prevent accidental exposure.
OVERRIDABLE_FIELDS = [
    "gemini_api_key",
    "gemini_model_planner",
    "gemini_model_researcher",
    "gemini_model_writer",
    "gemini_model_reviewer",
    "max_monthly_ai_budget",
    "max_cost_per_content_unit",
    "max_revisions",
    "source_max_pages",
    "source_max_depth",
    "mock_mode",
    "tavily_api_key",
    "web_search_max_results",
    "fact_check_context_top_k",
    "image_provider",
    "pexels_api_key",
    "image_generation_enabled",
]

# Internal/infra fields — returned read-only in GET for visibility,
# but the PUT endpoint ignores them. Not editable via the UI.
READONLY_FIELDS = [
    "ggcms_base_url",
    "gemini_base_url",
    "embedding_model",
    "gcs_bucket",
]

# Fields that only take effect on the next process restart -- they're read
# once at agent __init__ time (backend/workflows/content_pipeline.py builds
# agent singletons at import time), not re-read per call.
RESTART_REQUIRED_FIELDS = {
    "gemini_api_key",
    "gemini_model_planner",
    "gemini_model_researcher",
    "gemini_model_writer",
    "gemini_model_reviewer",
    "gemini_base_url",
    "embedding_model",
}

# Secret fields — values are NEVER returned in plaintext in any API response.
# factory_sync_secret is intentionally excluded from this view entirely.
SECRET_FIELDS = {"gemini_api_key", "tavily_api_key", "pexels_api_key"}


def get_row() -> AppSetting:
    """Loads the global AppSetting singleton from data/settings.yaml (defaults if absent)."""
    return file_store.get_settings()


def load_overrides(row: AppSetting) -> dict:
    """Returns {field: value} for every non-null override in the app_setting row."""
    if row is None:
        return {}
    return {
        field: getattr(row, field)
        for field in OVERRIDABLE_FIELDS
        if getattr(row, field) is not None
    }


def apply_overrides(row: AppSetting) -> None:
    """Mutates the in-memory `settings` singleton with any stored overrides.

    Fields that are re-read per-call by their consumers (mock_mode,
    tavily_api_key, web_search_max_results, ggcms_base_url,
    factory_sync_secret, budget/limit fields) take effect immediately.
    RESTART_REQUIRED_FIELDS are baked into already-constructed agent
    singletons and only take effect after the process restarts.
    """
    overrides = load_overrides(row)
    for field, value in overrides.items():
        setattr(settings, field, value)


def effective_view(db_row: AppSetting | None) -> dict:
    """Builds the GET /api/system-settings response.

    Security rules for secret fields:
    - source='override' (user explicitly set via UI → in data/settings.yaml):
        return is_set=True with value='' — UI shows 'Key configured' badge
    - source='default' (from env var / GCP Secret Manager injection):
        return is_set=True/False with value='' — never leak any chars

    Plaintext key values are NEVER returned. Not even partially.
    Non-secret fields return their actual effective value.
    """
    all_fields = OVERRIDABLE_FIELDS + READONLY_FIELDS
    view = {}
    for field in all_fields:
        override_value = getattr(db_row, field, None) if db_row is not None else None
        effective = override_value if override_value is not None else getattr(settings, field, None)
        source = "override" if override_value is not None else "default"
        readonly = field in READONLY_FIELDS

        if field in SECRET_FIELDS:
            # Never send any key characters — only signal whether the key is set
            view[field] = {
                "value": "",          # always empty — no characters ever returned
                "source": source,
                "readonly": readonly,
                "is_set": bool(effective),  # True/False so UI shows configured state
            }
        else:
            view[field] = {
                "value": effective,
                "source": source,
                "readonly": readonly,
                "is_set": bool(effective),
            }

    return view
