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
    "ContentJob",
    "ExportPackage",
    "AppSetting",
    "SchedulerRun",
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
    # Autonomous Content Factory extension (plan section 8): the minimum
    # QualityReport.overall_score (0-100) required, in addition to
    # QualityReport.passed, for a ContentJob with
    # publish_policy=="auto_if_quality_pass" to actually auto-publish rather
    # than fall back to HUMAN_REVIEW. See backend/services/quality_scoring.py.
    auto_publish_threshold: int = 85
    # Autonomous Content Factory extension (plan section 16): caps how many
    # ContentJobs the scheduler will dispatch concurrently within one pass.
    # Named (not a global env var) since AI spend/concurrency budgets are
    # naturally per-project, matching daily_limit's existing shape.
    max_concurrent_generation_jobs: int = 3
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


class Portal(BaseModel):
    """
    A recurring "portal" to periodically scan for new content (a listing
    page or an RSS feed) -- newly discovered links are ingested via
    ingestion.pipeline.ingest_discovered_source(discovery_method="portal_scrape"),
    landing as review_status="PENDING" like web-search discovery does today.
    See backend/services/portal_scanner.py.
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    project_id: uuid.UUID
    name: str
    url: str
    portal_type: str = "listing"  # "listing" | "rss"
    link_selector: str | None = None
    scan_interval_minutes: int = 360
    is_active: bool = True
    last_scanned_at: datetime | None = None
    last_scan_status: str | None = None  # "success" | "failed" | None (never run)
    last_scan_new_count: int | None = None
    created_at: datetime = Field(default_factory=utcnow)


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
    # --- Autonomous Content Factory extensions (see docs/architecture/
    # AUTONOMOUS_CONTENT_FACTORY_IMPLEMENTATION_PLAN.md section 6.2). All
    # optional/default-empty so existing knowledge_packs.yaml rows keep
    # loading unchanged. `source_claim_ids` inside each concepts/definitions/
    # etc. entry is expected (by a later Knowledge Pack builder step, not
    # this one) to resolve to a Claim actually present in the EvidencePack
    # referenced by `evidence_pack_id`.
    summary: str | None = None
    concepts: list[dict] = Field(default_factory=list)          # {concept, description, source_claim_ids}
    definitions: list[dict] = Field(default_factory=list)       # {term, definition, source_claim_ids}
    common_mistakes: list[dict] = Field(default_factory=list)
    practical_patterns: list[dict] = Field(default_factory=list)
    misconceptions: list[dict] = Field(default_factory=list)
    comparisons: list[dict] = Field(default_factory=list)
    learning_objectives: list[str] = Field(default_factory=list)
    difficulty_levels: list[str] = Field(default_factory=list)
    research_gaps: list[str] = Field(default_factory=list)
    contradictions: list[dict] = Field(default_factory=list)
    evidence_pack_id: uuid.UUID | None = None
    evidence_version: int = 1
    knowledge_version: int = 1


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
    # Still a plain str, not a strict enum -- matches the existing loose-string
    # pattern used elsewhere in this file (e.g. Source.status). Historically
    # only DISCOVERED/APPROVED/REJECTED were ever assigned; per the Autonomous
    # Content Factory plan (docs/architecture/
    # AUTONOMOUS_CONTENT_FACTORY_IMPLEMENTATION_PLAN.md section 6.1), Opportunity
    # now also serves as the Topic Registry, so this field additionally supports:
    # RESEARCHING, KNOWLEDGE_READY, CONTENT_PLANNED, GENERATING, QUALITY_REVIEW,
    # PUBLISHED, DEFERRED, HUMAN_REVIEW, FAILED. No validator enforcement.
    status: str = "DISCOVERED"
    created_at: datetime = Field(default_factory=utcnow)
    # --- Autonomous Content Factory extensions (plan section 6.1). All
    # optional/default-None so existing opportunities.yaml rows keep loading
    # unchanged.
    canonical_topic: str | None = None       # normalized/deduped key (slug of topic, lowercased)
    freshness_score: float | None = None
    evidence_strength_score: float | None = None
    opportunity_score_version: str | None = None   # ties to scoring weight version (services/scoring.py)
    evaluated_at: datetime | None = None
    last_generated_at: datetime | None = None
    cooldown_until: datetime | None = None
    knowledge_pack_id: uuid.UUID | None = None      # set once research completes
    scoring_breakdown: dict | None = None           # {sub_scores, weights, version, llm_reasoning}


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
    # Autonomous Content Factory extensions (plan section 8). All optional
    # so existing quality_reports.yaml rows keep loading unchanged.
    # source_integrity_score: new 8th dimension -- see
    # backend/agents/quality_agent.py for how it's populated (currently a
    # deterministic proxy derived from the fact-check/citation-check
    # pass/fail signals, not its own LLM-scored dimension -- see that
    # module's docstring for the rationale).
    source_integrity_score: float | None = None
    # overall_score: COMPUTED, not LLM-decided -- a deterministic weighted
    # average across all 8 dimensions above, produced by
    # backend/services/quality_scoring.py::compute_overall_quality_score.
    # `passed` below is likewise derived deterministically from this value
    # (see that module's determine_pass), never from an LLM's own
    # pass/fail judgment.
    overall_score: float | None = None
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


class ContentJob(BaseModel):
    """
    NEW (autonomous content factory, plan §6.3). One `KnowledgePack` fans out
    into many `ContentJob`s -- this is the higher-level "what and why" (which
    topic, which content type, for whom, under what publish policy). It does
    NOT replace `GenerationJob`, which remains the existing lower-level
    "one pipeline run" tracking entity; `generation_job_id` below links the
    two once this job's pipeline run is dispatched.

    Lifecycle (`status`):
        QUEUED -> RUNNING -> GENERATED -> QUALITY_PASSED -> PUBLISHING -> PUBLISHED
                                        -> QUALITY_FAILED -> HUMAN_REVIEW
                           -> PUBLISH_FAILED -> RETRY -> HUMAN_REVIEW
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    project_id: uuid.UUID
    opportunity_id: uuid.UUID
    knowledge_pack_id: uuid.UUID
    content_type: str
    audience: str | None = None
    difficulty: str | None = None
    learning_objectives: list[str] = Field(default_factory=list)
    priority: int = 0
    publish_policy: Literal["auto_if_quality_pass", "always_review"] = "always_review"
    status: str = "QUEUED"
    generation_job_id: uuid.UUID | None = None
    content_item_id: uuid.UUID | None = None
    export_package_id: uuid.UUID | None = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class ExportPackage(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    project_id: uuid.UUID
    manifest: dict
    gcs_path: str | None = None
    ggcms_imported_id: str | None = None
    ggcms_slug: str | None = None
    status: str = "PENDING"
    created_at: datetime = Field(default_factory=utcnow)


class SchedulerRun(BaseModel):
    """
    NEW (autonomous content factory, plan §9/§17 Wave 3). Tracks one
    end-to-end autonomous scheduler pass for a project (discover -> score ->
    select -> knowledge-pack -> content-jobs -> generate -> publish), backing
    `POST /api/autonomous/run` + `GET /api/autonomous/status/{run_id}` the
    same way `GenerationJob` backs `POST /api/generate` + `GET /api/jobs/{id}`.

    Unlike AgentRunLogEntry (one line per agent invocation), this is one row
    per whole pass -- coarse-grained progress/counters for the dashboard, not
    a replacement for the fine-grained agent_runs.jsonl log.
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    project_id: uuid.UUID
    status: str = "QUEUED"  # QUEUED -> RUNNING -> SUCCEEDED | FAILED
    current_stage: str | None = None
    opportunities_discovered: int = 0
    opportunities_selected: int = 0
    content_jobs_created: int = 0
    content_jobs_generated: int = 0
    content_jobs_published: int = 0
    content_jobs_human_review: int = 0
    content_jobs_failed: int = 0
    error_message: str | None = None
    decision_log: list[str] = Field(default_factory=list)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


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
