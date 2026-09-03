from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

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
    gcs_bucket: str = Field(default="local-bucket", validation_alias="GCS_BUCKET")
    max_monthly_ai_budget: float = Field(default=500.00, validation_alias="MAX_MONTHLY_AI_BUDGET")
    max_cost_per_content_unit: float = Field(default=0.50, validation_alias="MAX_COST_PER_CONTENT_UNIT")
    max_revisions: int = Field(default=3, validation_alias="MAX_REVISIONS")
    source_max_pages: int = Field(default=50, validation_alias="SOURCE_MAX_PAGES")
    source_max_depth: int = Field(default=2, validation_alias="SOURCE_MAX_DEPTH")
    mock_mode: bool = Field(default=False, validation_alias="MOCK_MODE")
    embedding_model: str = Field(default="models/text-embedding-004", validation_alias="EMBEDDING_MODEL")
    ggcms_base_url: str = Field(default="http://localhost:8080", validation_alias="GGCMS_BASE_URL")
    factory_sync_secret: str = Field(default="mock-sync-secret", validation_alias="FACTORY_SYNC_SECRET")
    tavily_api_key: str = Field(default="", validation_alias="TAVILY_API_KEY")
    web_search_max_results: int = Field(default=5, validation_alias="WEB_SEARCH_MAX_RESULTS")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

