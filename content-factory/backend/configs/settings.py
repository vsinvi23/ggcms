from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, model_validator


def _require_secrets_outside_mock_mode(mock_mode: bool, jwt_secret: str, factory_sync_secret: str) -> None:
    """Fail fast when required secrets are unset and mock_mode is not enabled."""
    if mock_mode:
        return
    missing = [
        name
        for name, value in (("JWT_SECRET", jwt_secret), ("FACTORY_SYNC_SECRET", factory_sync_secret))
        if not value
    ]
    if missing:
        raise ValueError(
            f"Missing required environment variable(s): {', '.join(missing)}. "
            "Set them, or set MOCK_MODE=true for local development."
        )


class Settings(BaseSettings):
    data_dir: str = Field(default="./data", validation_alias="DATA_DIR")
    gemini_api_key: str = Field(default="mock", validation_alias="GEMINI_API_KEY")
    gemini_base_url: str = Field(default="", validation_alias="GEMINI_BASE_URL")

    llm_provider: str = Field(default="gemini", validation_alias="LLM_PROVIDER")
    anthropic_api_key: str = Field(default="", validation_alias="ANTHROPIC_API_KEY")
    anthropic_base_url: str = Field(default="", validation_alias="ANTHROPIC_BASE_URL")

    gemini_model_planner: str = Field(default="gemini-1.5-flash", validation_alias="GEMINI_MODEL_PLANNER")
    gemini_model_researcher: str = Field(default="gemini-1.5-flash", validation_alias="GEMINI_MODEL_RESEARCHER")
    gemini_model_writer: str = Field(default="gemini-1.5-pro", validation_alias="GEMINI_MODEL_WRITER")
    gemini_model_reviewer: str = Field(default="gemini-1.5-flash", validation_alias="GEMINI_MODEL_REVIEWER")

    claude_model_planner: str = Field(default="claude-sonnet-5", validation_alias="CLAUDE_MODEL_PLANNER")
    claude_model_researcher: str = Field(default="claude-sonnet-5", validation_alias="CLAUDE_MODEL_RESEARCHER")
    claude_model_writer: str = Field(default="claude-sonnet-5", validation_alias="CLAUDE_MODEL_WRITER")
    claude_model_reviewer: str = Field(default="claude-sonnet-5", validation_alias="CLAUDE_MODEL_REVIEWER")

    # CHEAP tier (see services/model_provider.py) -- for classification/dedup-style
    # calls that don't fit one of the 4 fixed roles above and shouldn't pay for a
    # planner/writer/reviewer-grade model. NOT yet mirrored on the AppSetting
    # domain model / system-settings overlay (backend/models/domain.py) -- add
    # gemini_cheap_model/claude_cheap_model there too if this needs to become
    # per-project-overridable like the other model fields.
    gemini_cheap_model: str = Field(default="gemini-1.5-flash-8b", validation_alias="GEMINI_CHEAP_MODEL")
    claude_cheap_model: str = Field(default="claude-haiku-4-5", validation_alias="CLAUDE_CHEAP_MODEL")

    gcs_bucket: str = Field(default="local-bucket", validation_alias="GCS_BUCKET")
    max_monthly_ai_budget: float = Field(default=500.00, validation_alias="MAX_MONTHLY_AI_BUDGET")
    max_cost_per_content_unit: float = Field(default=0.50, validation_alias="MAX_COST_PER_CONTENT_UNIT")
    max_revisions: int = Field(default=3, validation_alias="MAX_REVISIONS")
    source_max_pages: int = Field(default=50, validation_alias="SOURCE_MAX_PAGES")
    source_max_depth: int = Field(default=2, validation_alias="SOURCE_MAX_DEPTH")
    mock_mode: bool = Field(default=False, validation_alias="MOCK_MODE")
    embedding_model: str = Field(default="models/text-embedding-004", validation_alias="EMBEDDING_MODEL")
    ggcms_base_url: str = Field(default="http://localhost:8080", validation_alias="GGCMS_BASE_URL")
    factory_sync_secret: str = Field(default="", validation_alias="FACTORY_SYNC_SECRET")
    tavily_api_key: str = Field(default="", validation_alias="TAVILY_API_KEY")
    web_search_max_results: int = Field(default=5, validation_alias="WEB_SEARCH_MAX_RESULTS")
    # ── Auth — shared JWT secret with gg-cms backend ───────────────────────
    jwt_secret: str = Field(default="", validation_alias="JWT_SECRET")
    # ── Google Drive integration ───────────────────────────────────────────
    gdrive_enabled: bool = Field(default=False, validation_alias="GDRIVE_ENABLED")
    # SA key JSON string mounted from GCP Secret Manager (base64 or raw JSON)
    gdrive_service_account_key: str = Field(default="", validation_alias="GDRIVE_SA_KEY")
    # ── Fact-check retrieval ────────────────────────────────────────────────
    fact_check_context_top_k: int = Field(default=10, validation_alias="FACT_CHECK_CONTEXT_TOP_K")
    # ── Image provider ──────────────────────────────────────────────────────
    image_provider: str = Field(default="pexels", validation_alias="IMAGE_PROVIDER")
    # Optional -- image generation soft-fails when unset, never hard-fails startup.
    pexels_api_key: str | None = Field(default=None, validation_alias="PEXELS_API_KEY")
    image_generation_enabled: bool = Field(default=True, validation_alias="IMAGE_GENERATION_ENABLED")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @model_validator(mode="after")
    def _check_required_secrets(self) -> "Settings":
        _require_secrets_outside_mock_mode(self.mock_mode, self.jwt_secret, self.factory_sync_secret)
        return self

settings = Settings()

