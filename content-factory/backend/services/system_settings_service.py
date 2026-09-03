from backend.configs.settings import settings
from backend.models.domain import AppSetting
from backend.storage import file_store

# Fields the UI can override. Excludes database_url (stays .env-only -- live
# DB reconnection is out of scope/dangerous).
OVERRIDABLE_FIELDS = [
    "gemini_api_key",
    "gemini_model_planner",
    "gemini_model_researcher",
    "gemini_model_writer",
    "gemini_model_reviewer",
    "gemini_base_url",
    "embedding_model",
    "gcs_bucket",
    "max_monthly_ai_budget",
    "max_cost_per_content_unit",
    "max_revisions",
    "source_max_pages",
    "source_max_depth",
    "mock_mode",
    "ggcms_base_url",
    "factory_sync_secret",
    "tavily_api_key",
    "web_search_max_results",
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

SECRET_FIELDS = {"gemini_api_key", "tavily_api_key", "factory_sync_secret"}


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


def mask_secret(value: str | None) -> str:
    if not value:
        return ""
    if len(value) <= 4:
        return "*" * len(value)
    return "*" * (len(value) - 4) + value[-4:]


def effective_view(db_row: AppSetting | None) -> dict:
    """Builds the GET response: effective value (override or .env default) + source marker."""
    view = {}
    for field in OVERRIDABLE_FIELDS:
        override_value = getattr(db_row, field, None) if db_row is not None else None
        effective = override_value if override_value is not None else getattr(settings, field)
        source = "override" if override_value is not None else "default"
        if field in SECRET_FIELDS:
            effective = mask_secret(effective)
        view[field] = {"value": effective, "source": source}
    return view
