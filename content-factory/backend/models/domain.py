"""
Plain Pydantic domain models for the AI Learning Content Factory.

STAGE 1 REWRITE: these were SQLAlchemy 2.0 declarative classes mapped to a
PostgreSQL 16 + pgvector schema (see git history / docs/architecture/
IMPLEMENTATION_SPECIFICATION.md section 2 for the original DDL this mirrors).
The project has moved to file-based YAML storage (backend/storage/file_store.py)
for a single-operator utility app with no real concurrency, so every class
below is now a plain `pydantic.BaseModel` -- there is no engine, session,
table, foreign key, or CHECK constraint backing these anymore. Field names
and types are kept identical to the SQLAlchemy originals for downstream
(agents/routers/schemas) compatibility, with two deliberate exceptions:

  * ContentItem.status is now `Literal["draft", "exported"]` (default
    "draft"). The old 11-value CHECK constraint
    (DISCOVERED/APPROVED/RESEARCHING/PLANNED/GENERATING/VALIDATING/REVISION/
    READY/EXPORTED/PUBLISHED/ARCHIVED) is gone -- there's no DB to enforce
    it, and the file-based lifecycle only needs to distinguish "not yet
    exported" from "exported". Routers that still assign the old values
    (e.g. "READY", "REVISION") are a later-stage fix, not this one.
  * KnowledgeChunk.embedding (previously `Vector(768)`) has been dropped
    entirely. A later stage replaces pgvector similarity search with
    keyword search over stored chunk text, so this column has no purpose
    going forward and carrying an unused list[float] around in every YAML
    file would just bloat the on-disk format.

Timestamps are plain timezone-aware `datetime` objects in memory; the YAML
layer (backend/storage/file_store.py) is responsible for (de)serializing
them to/from ISO-8601 strings. UUIDs are plain `uuid.UUID` in memory for the
same reason -- file_store.py serializes them to strings on write.
"""
from typing import Literal
import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from backend.models.base import utcnow

__all__ = [
    "Project",
    "ProjectStrategy",
    "Source",
    "KnowledgeDocument",
    "KnowledgeChunk",
    "KnowledgePack",
    "Opportunity",
    "ResearchRun",
    "EvidencePack",
    "LearningPlan",
    "ContentPlan",
    "ResourceLink",
    "ContentItem",
    "ContentVersion",
    "QualityReport",
    "GenerationJob",
    "ExportPackage",
    "AppSetting",
]


# ---------------------------------------------------------------------------
# project / project_strategy
# ---------------------------------------------------------------------------

class Project(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    name: str
    niche: list[str] = Field(default_factory=list)
    audience: list[str] = Field(default_factory=list)
    language: str = "en"
    country: str | None = None
    levels: list[str] = Field(default_factory=list)
    content_types: list[str] = Field(default_factory=list)
    brand_voice: str | None = None
    autonomy_enabled: bool = False
    min_opportunity_score: int = 75
    daily_limit: int = 10
    require_human_approval: bool = True
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class ProjectStrategy(BaseModel):
    project_id: uuid.UUID
    content_goals: list[str] = Field(default_factory=list)
    prohibited_topics: list[str] = Field(default_factory=list)
    preferred_sources: list[str] = Field(default_factory=list)
    publishing_frequency: str | None = None
    updated_at: datetime = Field(default_factory=utcnow)


# ---------------------------------------------------------------------------
# source / knowledge_document / knowledge_chunk / knowledge_pack
# ---------------------------------------------------------------------------

class Source(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    project_id: uuid.UUID
    source_type: str
    title: str | None = None
    author: str | None = None
    publisher: str | None = None
    url: str | None = None
    published_at: datetime | None = None
    ingested_at: datetime = Field(default_factory=utcnow)
    license_note: str | None = None
    content_hash: str
    status: str = "PENDING"
    error: str | None = None
    discovery_method: str = "manual"
    review_status: str = "APPROVED"
    discovered_snippet: str | None = None
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    search_query: str | None = None
    search_rank: int | None = None


class KnowledgeDocument(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    source_id: uuid.UUID
    extracted_text: str
    section_map: dict | None = None
    page_count: int | None = None
    created_at: datetime = Field(default_factory=utcnow)


class KnowledgeChunk(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    document_id: uuid.UUID
    chunk_index: int
    text: str
    section_ref: str | None = None
    page_ref: int | None = None
    created_at: datetime = Field(default_factory=utcnow)
    # NOTE: `embedding` (Vector(768)) intentionally removed -- see module
    # docstring. Keyword search over `text` replaces similarity search.


class KnowledgePack(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    project_id: uuid.UUID
    topic: str
    description: str | None = None
    source_ids: list[uuid.UUID] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utcnow)
    refreshed_at: datetime | None = None


# ---------------------------------------------------------------------------
# opportunity / research_run / evidence_pack
# ---------------------------------------------------------------------------

class Opportunity(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    project_id: uuid.UUID
    topic: str
    score: float
    demand: str | None = None
    trend: str | None = None
    competition: str | None = None
    content_gap: str | None = None
    audience: str | None = None
    recommended_content_type: str | None = None
    reason: str | None = None
    # {"brief": ..., "references": [...], "reference_source": ...} -- see
    # backend/api/routers/opportunities.py and backend/agents/opportunity_agent.py.
    signals: dict | None = None
    status: str = "DISCOVERED"
    created_at: datetime = Field(default_factory=utcnow)


class ResearchRun(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    opportunity_id: uuid.UUID | None = None
    knowledge_pack_id: uuid.UUID | None = None
    status: str = "RUNNING"
    started_at: datetime = Field(default_factory=utcnow)
    completed_at: datetime | None = None


class EvidencePack(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    research_run_id: uuid.UUID
    topic: str
    claims: list = Field(default_factory=list)
    definitions: list = Field(default_factory=list)
    examples: list = Field(default_factory=list)
    limitations: list = Field(default_factory=list)
    controversies: list = Field(default_factory=list)
    open_questions: list = Field(default_factory=list)
    citations: list = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utcnow)


# ---------------------------------------------------------------------------
# learning_plan / content_plan
# ---------------------------------------------------------------------------

class LearningPlan(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    evidence_pack_id: uuid.UUID
    learner_profile: str | None = None
    problem_statement: str | None = None
    objectives: list[str] = Field(default_factory=list)
    prerequisites: list[str] = Field(default_factory=list)
    difficulty: str | None = None
    sequence: dict | None = None
    created_at: datetime = Field(default_factory=utcnow)


class ContentPlan(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    learning_plan_id: uuid.UUID
    content_type: str
    title: str | None = None
    sections: list = Field(default_factory=list)
    examples: list = Field(default_factory=list)
    exercises: list = Field(default_factory=list)
    citations_required: bool = True
    created_at: datetime = Field(default_factory=utcnow)


# ---------------------------------------------------------------------------
# content_item / content_version / quality_report
# ---------------------------------------------------------------------------

class ResourceLink(BaseModel):
    """
    One user-recommended (or opportunity-carried) reference link attached to
    a ContentItem's resource section. `source` distinguishes a link the
    operator added by hand from one seeded automatically off the approved
    Opportunity's `signals["references"]` (see backend/api/routers/
    opportunities.py) at generation time.
    """
    url: str
    label: str | None = None
    note: str | None = None
    source: Literal["user_added", "carried_from_opportunity"] = "user_added"


class ContentItem(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    project_id: uuid.UUID
    content_plan_id: uuid.UUID | None = None
    content_type: str
    title: str
    slug: str
    summary: str | None = None
    audience: str | None = None
    difficulty: str | None = None
    body_markdown: str | None = None
    body_json: dict | None = None
    # Populated (as a dict -- see backend/schemas/course.py::CourseOutline)
    # when content_type == "course", before generation writes any lesson
    # bodies. Produced by backend/agents/course_agent.py::plan_course_outline
    # via POST /api/content/course-outline, reviewed by the operator, then
    # attached here as the plan generation fills in from
    # backend/workflows/content_pipeline.py. body_json["sections"][...] is
    # populated from this outline's sections/lessons once each lesson's
    # markdown_body has been written (see build_sync_payload in
    # backend/exporters/ggcms_client.py, which reads that same shape).
    course_outline: dict | None = None
    seo: dict | None = None
    geo: dict | None = None
    # User-recommended reference links (plus any carried over from the
    # approved Opportunity that seeded this item's generation -- see
    # run_pipeline_job in backend/api/routers/generation.py). Managed via
    # POST/DELETE /api/content/{id}/resources in backend/api/routers/content.py.
    resources: list[ResourceLink] = Field(default_factory=list)
    # Old 11-value CHECK constraint dropped -- no DB to enforce it. See
    # module docstring for rationale.
    status: Literal["draft", "exported"] = "draft"
    current_version: int = 1
    generated_at: datetime | None = None
    created_at: datetime = Field(default_factory=utcnow)


class ContentVersion(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    content_item_id: uuid.UUID
    version: int
    parent_version: int | None = None
    body_markdown: str | None = None
    body_json: dict | None = None
    provenance: dict
    created_at: datetime = Field(default_factory=utcnow)


class QualityReport(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    content_version_id: uuid.UUID
    factuality_score: float | None = None
    citation_score: float | None = None
    learning_quality_score: float | None = None
    originality_score: float | None = None
    readability_score: float | None = None
    seo_score: float | None = None
    geo_score: float | None = None
    passed: bool
    issues: list = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utcnow)


# ---------------------------------------------------------------------------
# generation_job / export_package
# ---------------------------------------------------------------------------

class GenerationJob(BaseModel):
    """
    Tracks one `/api/generate` (or `/api/content/{id}/refresh`) pipeline run.
    Lifecycle: QUEUED -> RUNNING -> SUCCEEDED | FAILED. `topic` and
    `current_node` let GET /api/jobs/{id} report live progress
    (`{ job_id, status, current_node, error, cost_estimate }`).
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    project_id: uuid.UUID
    content_item_id: uuid.UUID | None = None
    topic: str | None = None
    current_node: str | None = None
    status: str = "QUEUED"
    error_type: str | None = None
    error_message: str | None = None
    retryable: bool | None = None
    cost_estimate: float | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime = Field(default_factory=utcnow)


class ExportPackage(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    project_id: uuid.UUID
    manifest: dict
    gcs_path: str | None = None
    ggcms_imported_id: str | None = None
    ggcms_slug: str | None = None
    status: str = "PENDING"
    created_at: datetime = Field(default_factory=utcnow)


# ---------------------------------------------------------------------------
# app_setting -- single-row global config override (backend/configs/settings.py)
# ---------------------------------------------------------------------------

class AppSetting(BaseModel):
    id: int = 1
    gemini_api_key: str | None = None
    gemini_model_planner: str | None = None
    gemini_model_researcher: str | None = None
    gemini_model_writer: str | None = None
    gemini_model_reviewer: str | None = None
    gemini_base_url: str | None = None
    embedding_model: str | None = None
    gcs_bucket: str | None = None
    max_monthly_ai_budget: float | None = None
    max_cost_per_content_unit: float | None = None
    max_revisions: int | None = None
    source_max_pages: int | None = None
    source_max_depth: int | None = None
    mock_mode: bool | None = None
    ggcms_base_url: str | None = None
    factory_sync_secret: str | None = None
    tavily_api_key: str | None = None
    web_search_max_results: int | None = None
    updated_at: datetime = Field(default_factory=utcnow)
