# AI Content Factory — Implementation Specification
**Version 1.0 — companion to `SLAD_AI_CONTENT_FACTORY.md`. This is the build guide: concrete schemas, contracts, config, and phased delivery.**

Stack (fixed by the SLAD): Python 3.12, FastAPI, LangGraph, Pydantic v2, PostgreSQL 16 + pgvector, SQLAlchemy 2 + Alembic, React/TS/Vite/Tailwind, Docker, Cloud Run.

---

## 1. Repository Structure (concrete)

Replace the current empty scaffold and orphaned Go files with:

```text
ai-learning-content-factory/
├── frontend/
│   ├── src/
│   │   ├── pages/          (Dashboard, ProjectConfig, KnowledgeLibrary, Opportunities, Generation, Content, Settings)
│   │   ├── components/
│   │   └── services/        (api client, typed from openapi.json)
│   ├── index.html  vite.config.ts  tailwind.config.js  package.json
│
├── backend/
│   ├── api/
│   │   ├── main.py                     # FastAPI app factory
│   │   ├── deps.py                     # DB session, auth, settings DI
│   │   └── routers/
│   │       ├── projects.py  sources.py  knowledge_packs.py
│   │       ├── opportunities.py  generation.py  jobs.py
│   │       ├── content.py  analytics.py
│   │
│   ├── agents/
│   │   ├── base.py                     # Agent base class / contract
│   │   ├── strategy_agent.py
│   │   ├── opportunity_agent.py
│   │   ├── research_agent.py
│   │   ├── learning_architect_agent.py
│   │   ├── content_planner_agent.py
│   │   ├── writer_agent.py
│   │   ├── fact_checker_agent.py
│   │   ├── citation_checker_agent.py
│   │   ├── quality_agent.py
│   │   └── revision_agent.py
│   │
│   ├── workflows/
│   │   └── content_pipeline.py         # LangGraph StateGraph definition
│   │
│   ├── ingestion/
│   │   ├── fetchers/  (http_fetcher.py, playwright_fetcher.py, rss_fetcher.py, sitemap_fetcher.py, github_fetcher.py)
│   │   ├── extractors/ (pdf_extractor.py, html_extractor.py — wraps trafilatura)
│   │   └── pipeline.py                 # fetch → extract → normalize → chunk → embed
│   │
│   ├── knowledge/
│   │   ├── chunking.py  embeddings.py  packs.py  retrieval.py (pgvector queries)
│   │
│   ├── retrieval/
│   │   └── vector_store.py             # pgvector query/insert layer
│   │
│   ├── models/                          # SQLAlchemy ORM models (1:1 with §2 DDL)
│   │   └── *.py
│   │
│   ├── schemas/                         # Pydantic request/response + agent I/O contracts
│   │   ├── evidence_pack.py  learning_plan.py  content_plan.py
│   │   ├── content_item.py  opportunity.py  sync_payload.py
│   │
│   ├── exporters/
│   │   ├── markdown_exporter.py  json_exporter.py  ggcms_client.py
│   │
│   ├── services/
│   │   ├── model_provider.py            # LiteLLM-backed ModelProvider abstraction
│   │   ├── cost_tracker.py  scoring.py  dedup.py
│   │
│   ├── prompts/
│   │   ├── strategy.md  opportunity.md  research.md
│   │   ├── learning_architect.md  planner.md  writer.md
│   │   ├── fact_checker.md  citation_checker.md  quality.md
│   │
│   ├── migrations/                      # Alembic
│   ├── configs/
│   │   └── settings.py                  # pydantic-settings, reads .env
│   └── worker/
│       └── main.py                      # Phase 2: Pub/Sub subscriber entrypoint
│
├── infra/
│   ├── docker/  Dockerfile.api  Dockerfile.worker  Dockerfile.web
│   └── gcp/     cloudrun.yaml  cloud-scheduler.tf (Phase 2)
│
├── tests/
│   ├── unit/  integration/  evaluation/
│
├── docker-compose.yml   .env.example   requirements.txt / pyproject.toml
└── README.md
```

**Cleanup actions before starting:** delete `apps/`, `packages/` (empty Node scaffold), `cmd/importer/main.go`, `packages/exports/gg_importer.go` (orphaned, non-buildable Go), and `docs/architecture/V2_GO_ARCHITECTURE_AND_DESIGN.md` (superseded).

---

## 2. Data Model (PostgreSQL 16 + pgvector DDL)

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE project (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    niche TEXT[] NOT NULL DEFAULT '{}',
    audience TEXT[] NOT NULL DEFAULT '{}',
    language TEXT NOT NULL DEFAULT 'en',
    country TEXT,
    levels TEXT[] NOT NULL DEFAULT '{}',
    content_types TEXT[] NOT NULL DEFAULT '{}',
    brand_voice TEXT,
    autonomy_enabled BOOLEAN NOT NULL DEFAULT false,
    min_opportunity_score INT NOT NULL DEFAULT 75,
    daily_limit INT NOT NULL DEFAULT 10,
    require_human_approval BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE project_strategy (
    project_id UUID PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
    content_goals TEXT[] NOT NULL DEFAULT '{}',
    prohibited_topics TEXT[] NOT NULL DEFAULT '{}',
    preferred_sources TEXT[] NOT NULL DEFAULT '{}',
    publishing_frequency TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE source (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN
        ('pdf','docx','markdown','txt','url','website','sitemap','rss','github')),
    title TEXT,
    author TEXT,
    publisher TEXT,
    url TEXT,
    published_at TIMESTAMPTZ,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    license_note TEXT,
    content_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','FETCHED','EXTRACTED','FAILED')),
    error TEXT,
    UNIQUE (project_id, content_hash)
);

CREATE TABLE knowledge_document (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES source(id) ON DELETE CASCADE,
    extracted_text TEXT NOT NULL,
    section_map JSONB,        -- chapter/heading -> char offsets
    page_count INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE knowledge_chunk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES knowledge_document(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    text TEXT NOT NULL,
    section_ref TEXT,
    page_ref INT,
    embedding VECTOR(768),     -- dimension matches configured embedding model
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_chunk_embedding_idx ON knowledge_chunk
    USING hnsw (embedding vector_cosine_ops);

CREATE TABLE knowledge_pack (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    description TEXT,
    source_ids UUID[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    refreshed_at TIMESTAMPTZ
);

CREATE TABLE opportunity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    score NUMERIC(5,2) NOT NULL,
    demand TEXT, trend TEXT, competition TEXT,
    content_gap TEXT,
    audience TEXT,
    recommended_content_type TEXT,
    reason TEXT,
    signals JSONB,             -- raw signal snapshot (trends/search/reddit/etc.)
    status TEXT NOT NULL DEFAULT 'DISCOVERED'
        CHECK (status IN ('DISCOVERED','APPROVED','REJECTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE research_run (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID REFERENCES opportunity(id) ON DELETE SET NULL,
    knowledge_pack_id UUID REFERENCES knowledge_pack(id),
    status TEXT NOT NULL DEFAULT 'RUNNING',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE evidence_pack (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_run_id UUID NOT NULL REFERENCES research_run(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    claims JSONB NOT NULL DEFAULT '[]',
    definitions JSONB NOT NULL DEFAULT '[]',
    examples JSONB NOT NULL DEFAULT '[]',
    limitations JSONB NOT NULL DEFAULT '[]',
    controversies JSONB NOT NULL DEFAULT '[]',
    open_questions JSONB NOT NULL DEFAULT '[]',
    citations JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE learning_plan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_pack_id UUID NOT NULL REFERENCES evidence_pack(id) ON DELETE CASCADE,
    learner_profile TEXT,
    problem_statement TEXT,
    objectives TEXT[] NOT NULL DEFAULT '{}',
    prerequisites TEXT[] NOT NULL DEFAULT '{}',
    difficulty TEXT,
    sequence JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE content_plan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_plan_id UUID NOT NULL REFERENCES learning_plan(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    title TEXT,
    sections JSONB NOT NULL DEFAULT '[]',
    examples JSONB NOT NULL DEFAULT '[]',
    exercises JSONB NOT NULL DEFAULT '[]',
    citations_required BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE content_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    content_plan_id UUID REFERENCES content_plan(id),
    content_type TEXT NOT NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    summary TEXT,
    audience TEXT,
    difficulty TEXT,
    body_markdown TEXT,
    body_json JSONB,
    seo JSONB, geo JSONB,
    status TEXT NOT NULL DEFAULT 'DISCOVERED' CHECK (status IN
        ('DISCOVERED','APPROVED','RESEARCHING','PLANNED','GENERATING',
         'VALIDATING','REVISION','READY','EXPORTED','PUBLISHED','ARCHIVED')),
    current_version INT NOT NULL DEFAULT 1,
    generated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, slug, current_version)
);

CREATE TABLE content_version (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_item_id UUID NOT NULL REFERENCES content_item(id) ON DELETE CASCADE,
    version INT NOT NULL,
    parent_version INT,
    body_markdown TEXT,
    body_json JSONB,
    provenance JSONB NOT NULL,   -- knowledge sources, model, agent_version, quality_scores
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (content_item_id, version)
);

CREATE TABLE quality_report (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_version_id UUID NOT NULL REFERENCES content_version(id) ON DELETE CASCADE,
    factuality_score NUMERIC(4,2),
    citation_score NUMERIC(4,2),
    learning_quality_score NUMERIC(4,2),
    originality_score NUMERIC(4,2),
    readability_score NUMERIC(4,2),
    seo_score NUMERIC(4,2),
    geo_score NUMERIC(4,2),
    passed BOOLEAN NOT NULL,
    issues JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE generation_job (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    content_item_id UUID REFERENCES content_item(id),
    status TEXT NOT NULL DEFAULT 'QUEUED'
        CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED')),
    error_type TEXT, error_message TEXT, retryable BOOLEAN,
    cost_estimate NUMERIC(8,4),
    started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE export_package (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    manifest JSONB NOT NULL,
    gcs_path TEXT,
    ggcms_imported_id TEXT,
    ggcms_slug TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','SENT','ACKED','FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Migrations are managed with **Alembic**; the above is the target schema for migration `0001_init`.

---

## 3. Core Pydantic Schemas (agent I/O contracts)

```python
# backend/schemas/evidence_pack.py
from pydantic import BaseModel, Field

class Claim(BaseModel):
    claim: str
    evidence: str
    source: str
    confidence: float = Field(ge=0, le=1)

class EvidencePack(BaseModel):
    topic: str
    claims: list[Claim] = []
    definitions: list[str] = []
    examples: list[str] = []
    limitations: list[str] = []
    controversies: list[str] = []
    open_questions: list[str] = []
    citations: list[str] = []

# backend/schemas/learning_plan.py
class LearningPlan(BaseModel):
    learner_profile: str
    problem_statement: str
    objectives: list[str]
    prerequisites: list[str] = []
    difficulty: str  # beginner | intermediate | advanced
    sequence: list[str] = []

# backend/schemas/content_plan.py
class ContentPlan(BaseModel):
    content_type: str
    title: str
    audience: str
    objectives: list[str] = []
    sections: list[dict] = []
    examples: list[dict] = []
    exercises: list[dict] = []
    citations_required: bool = True

# backend/schemas/opportunity.py
class Opportunity(BaseModel):
    topic: str
    score: float = Field(ge=0, le=100)
    demand: str
    trend: str
    competition: str
    content_gap: str
    audience: str
    recommended_content_type: str
    reason: str

# backend/schemas/agent_error.py
class AgentError(BaseModel):
    error_type: str   # e.g. "RESEARCH_INSUFFICIENT"
    message: str
    retryable: bool
```

`sync_payload.py` mirrors the `SyncPayload` DTO in `docs/import-contract/CONTENT_IMPORT_SCHEMA.md` 1:1 as Pydantic models (this is the wire format sent to `ggcms`; keep field names byte-identical to the JSON contract, not the Go struct names).

---

## 4. Agent Implementation Spec

Common contract (`backend/agents/base.py`):

```python
class Agent(Protocol):
    name: str
    input_schema: type[BaseModel]
    output_schema: type[BaseModel]
    prompt_path: str          # e.g. "prompts/research.md"
    tools: list[str]
    max_retries: int = 2

    async def run(self, input: BaseModel, ctx: RunContext) -> BaseModel | AgentError: ...
```

| Agent | Input | Output | Tools | Retry policy |
|---|---|---|---|---|
| StrategyAgent | Project config form | `ProjectStrategy` | none | 0 (deterministic) |
| OpportunityAgent | strategy, signal snapshot | `list[Opportunity]` | TrendTool, SearchDataTool, GitHubTool | 1 |
| ResearchAgent | topic, strategy, knowledge_pack | `EvidencePack` | web_search, knowledge_search (pgvector) | 2 |
| LearningArchitectAgent | EvidencePack, audience/level | `LearningPlan` | none | 1 |
| ContentPlannerAgent | EvidencePack, LearningPlan | `ContentPlan` | none | 1 |
| WriterAgent | Strategy, KnowledgePack, EvidencePack, LearningPlan, ContentPlan | draft markdown/JSON | none | 2 |
| FactCheckerAgent | draft, EvidencePack | pass/fail + issues | knowledge_search | 1 |
| CitationCheckerAgent | draft, EvidencePack | pass/fail + issues | none | 1 |
| QualityAgent | draft, all prior checks | `QualityReport` | none | 0 |
| RevisionAgent | draft, QualityReport issues | revised draft | same as WriterAgent | max 3 cycles total (spec §27) |

Each agent's prompt lives at `backend/prompts/<name>.md`, is loaded by path (never inlined in Python), and is version-controlled — prompt changes are ordinary git diffs.

`ModelProvider` config (`backend/configs/settings.py`, via LiteLLM router):
```yaml
models:
  classifier: gemini-1.5-flash     # cheap filtering / opportunity scoring
  embedding: text-embedding-004
  researcher: gemini-1.5-pro       # or claude/gpt per ModelProvider config
  writer: gemini-1.5-pro
  validator: gemini-1.5-flash      # quality gate checks — cheap where possible
```

---

## 5. LangGraph Workflow Definition

`backend/workflows/content_pipeline.py` — a `StateGraph` over a single `PipelineState` (Pydantic) threading `strategy → opportunity → evidence_pack → learning_plan → content_plan → draft → quality_report` fields, with conditional edges:

```text
nodes:
  load_strategy, discover_opportunities, rank_opportunities, select_topic,
  retrieve_knowledge, research_web, build_evidence_pack,
  design_learning_structure, create_content_plan, generate_draft,
  fact_check, citation_check, learning_quality_check, seo_geo_check,
  revise, finalize, export

edges:
  load_strategy -> discover_opportunities -> rank_opportunities -> select_topic
  select_topic -> retrieve_knowledge -> research_web -> build_evidence_pack
  build_evidence_pack -> design_learning_structure -> create_content_plan -> generate_draft
  generate_draft -> fact_check -> citation_check -> learning_quality_check -> seo_geo_check

  conditional(seo_geo_check):
     all_passed              -> finalize -> export -> END
     failed AND revisions<3  -> revise -> fact_check   (loop back into the check chain)
     failed AND revisions>=3 -> finalize (status=NEEDS_REVIEW) -> END
```

Each node writes its `GenerationJob` row transition and appends to `content_version`/`quality_report` as it completes, so a crashed run is resumable from the last persisted node rather than restarted from scratch.

---

## 6. API Contract (request/response bodies)

```text
POST /api/projects
  body: { name, niche[], audience[], language, country?, levels[], content_types[] }
  201 -> Project

PUT /api/projects/{id}/strategy
  body: { content_goals[], prohibited_topics[], preferred_sources[], publishing_frequency? }
  200 -> ProjectStrategy

POST /api/sources
  body: { project_id, source_type, url? }              # for url/website/sitemap/rss/github
POST /api/sources/upload
  multipart: { project_id, file }                        # for pdf/docx/markdown/txt
  202 -> { source_id, status: "PENDING" }

GET  /api/knowledge-packs?project_id=
POST /api/knowledge-packs
  body: { project_id, topic, source_ids[] }
  201 -> KnowledgePack

GET  /api/opportunities?project_id=&status=
POST /api/opportunities/{id}/approve
  200 -> { id, status: "APPROVED" }

POST /api/generate
  body: { project_id, opportunity_id, content_type, knowledge_pack_ids[],
          enable_web_research: bool, target_length?, audience?, difficulty? }
  202 -> { job_id }

GET  /api/jobs/{id}
  200 -> { job_id, status, current_node, error?, cost_estimate }

GET  /api/content?project_id=&status=
GET  /api/content/{id}
POST /api/content/{id}/refresh          # re-research + new version
POST /api/content/{id}/export           # -> triggers ggcms_client push

GET  /api/analytics?project_id=
```

Auth: bearer token per project (stored hashed in `project` table or a separate `api_key` table — add if multi-tenant use is needed; MVP can run single-tenant with one shared operator token from Secret Manager). All routers depend on `deps.get_db` + `deps.get_current_project`.

---

## 7. Ingestion Pipeline (implementation notes)

```text
fetch          -> httpx (default) | Playwright (only if httpx response fails a
                  "looks like an SPA shell" heuristic, or source is flagged auth-required)
extract        -> trafilatura first; PyMuPDF for PDF; fallback to BeautifulSoup
                  for structural edge cases trafilatura can't parse
normalize      -> strip boilerplate, unify whitespace/encoding, detect language
chunk          -> ~500-800 token chunks with 10-15% overlap, section-aware
                  (split on headings first, then hard-wrap oversized sections)
metadata       -> title/author/publisher/date extracted where present, else null
embed          -> ModelProvider.embed(chunks) -> text-embedding-004 (768-dim)
store          -> knowledge_chunk rows + pgvector HNSW index
```

Dedup (`services/dedup.py`): canonical URL normalization → content SHA-256 hash → title+source+date fallback, per spec §43. A `source` row with a duplicate `(project_id, content_hash)` is short-circuited before fetch.

---

## 8. Quality Gate — concrete check functions

| Check | Implementation approach | Default threshold |
|---|---|---|
| Factuality | For each claim extracted from the draft, re-query `EvidencePack.claims` (and re-run `knowledge_search` if not found) for supporting evidence; flag unsupported claims | ≥ 95% of extracted claims supported |
| Citation validation | Every claim tagged `citations_required` must resolve to a non-empty `citations[]` entry present in the EvidencePack | 100% for Tier-1-required claims |
| Source integrity | LLM-as-judge: does the cited source text actually support the specific claim (not just topically related)? | pass/fail per claim, aggregate ≥ 90% |
| Learning quality | Rubric check against `LearningPlan.objectives` — are all objectives addressed, is difficulty consistent, are prerequisites stated | all objectives covered |
| Originality | n-gram / embedding similarity between draft and source chunks it drew from | < 30% substantive overlap |
| Readability | Flesch-Kincaid or similar via `textstat` | grade level appropriate to `difficulty` |
| SEO | Rule-based: title length, heading structure, keyword presence, meta description | pass/fail checklist |
| GEO | Rule-based: has direct-answer opening, has clear definitions, has structured headings | pass/fail checklist |

`passed = all(checks)`; failing checks populate `quality_report.issues` consumed by `RevisionAgent`.

---

## 9. Export Formats

**JSON** (canonical, `content_item.body_json`) — matches SLAD §5.8 schema (`schema_version, content_id, content_type, title, slug, summary, audience, difficulty, objectives, sections, sources, seo, geo, quality, generated_at`).

**Markdown** — generated from the JSON via `exporters/markdown_exporter.py`; must include title, metadata frontmatter, summary, body, references/sources.

**Export package layout** (`exporters/json_exporter.py` writes to Cloud Storage):
```text
export/<run_id>/
    manifest.json
    articles/<content_id>.json
    articles/<content_id>.md
    research/<content_id>_evidence.json
    sources/<source_id>.json
```

**ggcms push** (`exporters/ggcms_client.py`):
```python
async def push_content(item: ContentItem) -> SyncResult:
    payload = build_sync_payload(item)   # -> SyncPayload pydantic model
    resp = await http_client.post(
        f"{settings.GGCMS_BASE_URL}/api/import/ingest",
        json=payload.model_dump(mode="json"),
        headers={"X-Factory-Sync-Secret": settings.FACTORY_SYNC_SECRET},
    )
    resp.raise_for_status()
    return SyncResult.model_validate(resp.json())
```
`FACTORY_SYNC_SECRET` and `GGCMS_BASE_URL` come from Secret Manager / `.env` (local only), never hardcoded.

---

## 10. Configuration

`.env.example` (extends the existing file already present in the repo):
```bash
DATABASE_URL="postgresql+asyncpg://factory_admin:local_password@localhost:5432/content_factory"
GEMINI_API_KEY=""
GEMINI_MODEL_PLANNER="gemini-1.5-flash"
GEMINI_MODEL_RESEARCHER="gemini-1.5-pro"
GEMINI_MODEL_WRITER="gemini-1.5-pro"
GEMINI_MODEL_REVIEWER="gemini-1.5-flash"
EMBEDDING_MODEL="text-embedding-004"
GCS_BUCKET=""
MAX_MONTHLY_AI_BUDGET=500.00
MAX_COST_PER_CONTENT_UNIT=0.50
MAX_REVISIONS=3
SOURCE_MAX_PAGES=50
SOURCE_MAX_DEPTH=2
GGCMS_BASE_URL="https://ggcms.example.com"
FACTORY_SYNC_SECRET=""
```
(Note: bump `MAX_REVISIONS` to 3 to match SLAD §5.7/spec §27; the existing file had 2.)

`docker-compose.yml` must be updated — it currently launches a bare `node:20` container for `api`, left over from the abandoned Node scaffold. Replace with:
```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: content_factory
      POSTGRES_USER: factory_admin
      POSTGRES_PASSWORD: local_password
  api:
    build: { context: ., dockerfile: infra/docker/Dockerfile.api }
    command: uvicorn backend.api.main:app --host 0.0.0.0 --port 8000 --reload
    volumes: [".:/app"]
    ports: ["8000:8000"]
    env_file: .env
    depends_on: [postgres]
  web:
    build: { context: ./frontend, dockerfile: ../infra/docker/Dockerfile.web }
    command: npm run dev -- --host
    volumes: ["./frontend:/app"]
    ports: ["5173:5173"]
```

---

## 11. Delivery Phases (build order with acceptance criteria)

### Phase 0 — Cleanup & scaffold (0.5 week)
- Remove Node/Go leftovers listed in §1.
- Init Python project (`pyproject.toml`), Alembic, apply migration `0001_init` from §2.
- **Accept:** `docker-compose up` brings up Postgres+pgvector and an empty FastAPI app responding on `/health`.

### Phase 1 — Knowledge Library + ingestion (1–1.5 weeks)
- Implement `/api/sources`, `/api/sources/upload`, ingestion pipeline (§7), Knowledge Pack CRUD.
- **Accept:** upload a PDF and a URL, see both reach `EXTRACTED` status with chunks + embeddings queryable via a manual pgvector similarity query.

### Phase 2 — Research + Learning Architecture (1 week)
- Implement `ResearchAgent`, `LearningArchitectAgent`, `EvidencePack`/`LearningPlan` persistence.
- **Accept:** given a Knowledge Pack + topic, produce a persisted `EvidencePack` with ≥1 claim per definition/example category and a `LearningPlan` with ≥3 objectives.

### Phase 3 — Planning, Writing, Quality Gate (1.5–2 weeks)
- Implement `ContentPlannerAgent`, `WriterAgent`, all quality checks (§8), `RevisionAgent`, the LangGraph pipeline (§5) wired end-to-end.
- **Accept:** a full `POST /api/generate` run reaches `READY` or `NEEDS_REVIEW` without manual intervention, with a populated `quality_report`.

### Phase 4 — Export & ggcms integration (0.5–1 week)
- Implement Markdown/JSON exporters, `ggcms_client.py`, `/api/content/{id}/export`.
- **Accept:** a `READY` content item successfully round-trips through a local/staging `ggcms` `/api/import/ingest` and appears as a `DRAFT` article there.

### Phase 5 — Opportunity Discovery + UI (1.5 weeks)
- Implement `OpportunityAgent` (start with Google Trends + basic search-result scraping — defer Reddit/YouTube/GitHub signals to Phase 2 per SLAD §14), scoring (SLAD §5.2 weights), the Opportunity board, Generation console, Dashboard.
- **Accept:** operator can see scored opportunities, approve one, trigger generation, and watch job progress live in the UI.

### Phase 6 — Autonomy, job queue, hardening (ongoing, Phase 2 of SLAD)
- Cloud Scheduler + Pub/Sub workers, autonomous mode, cost tracking against `MAX_MONTHLY_AI_BUDGET`, refresh/versioning workflow, observability (OTel + Cloud Monitoring dashboards for the metrics in SLAD §13).

Each phase should end with the **Accept** criterion demonstrably working before moving to the next — do not parallelize phases 1–4, since each depends on the previous phase's persisted state.

---

## 12. Testing Strategy

- **Unit:** each agent tested with a fixed `EvidencePack`/`LearningPlan` fixture, asserting schema-valid output (pytest, no live LLM calls — mock `ModelProvider`).
- **Integration:** full pipeline run against a local Postgres+pgvector, using a cheap/mock model provider, asserting the state machine reaches `READY`/`NEEDS_REVIEW` and every DB table is populated as expected.
- **Evaluation (`tests/evaluation/`):** a small fixed set of real topics run periodically against live models to track quality-score drift over time (this is what `packages/evaluation` in the original scaffold was presumably meant for — implement it as a scheduled pytest-based eval script, not a separate package).
- **Contract test:** a fixture `SyncPayload` validated against `ggcms`'s actual `/api/import/ingest` in a staging environment before each release.

---

## 13. Open Items Requiring a Decision

1. **Auth model** — single shared operator token (MVP) vs. multi-user auth. Recommend starting single-tenant/single-token; revisit only if multiple operators need isolated projects.
2. **Embedding model choice** — `text-embedding-004` (Gemini) assumed above for consistency with the Gemini generation models already in `.env.example`; confirm before locking the `VECTOR(768)` dimension in the DDL (dimension must match whichever embedding model is actually used).
3. **Trend/search signal providers** — the spec lists Google Trends, search results, Reddit, YouTube, GitHub as signals; each needs a concrete API/library choice (e.g., `pytrends` for Trends) before `OpportunityAgent` can be implemented — recommend deciding this at the start of Phase 5, not before, since it doesn't block Phases 0–4.
