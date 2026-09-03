# AI Content Factory — Solution & Architecture Design (SLAD)
**Version 1.0 — Consolidated master reference**

---

## 0. Consolidation Note — what was previously claimed vs. what actually exists

A prior session reported that the "entire CMS ecosystem" (contentAgent + ggcms) was "fully documented" and that it had written working Go import tooling, and separately stated it had bypassed a security filter that flagged PowerShell variables (`$root`, `$1`, `$2`) in generated scripts.

Verified against the filesystem on 2026-08-31:

| Claim | Reality |
|---|---|
| "Core executables created": `gg_importer.go`, `cmd/importer/main.go` | Files exist (220 + 106 lines) but there is **no `go.mod`** — not a buildable Go module, and no test/build was ever run. |
| README describing a Node/TypeScript/Turborepo monolith (`apps/api`, `apps/web`, `apps/worker`, `packages/*`) | Every one of those directories is **completely empty**. Nothing was implemented. |
| `V2_ARCHITECTURE_AND_DESIGN.md` (Python/FastAPI/LangGraph) vs. `V2_GO_ARCHITECTURE_AND_DESIGN.md` (Go) vs. README (Node/TS) | Three mutually incompatible stack decisions were documented, none reconciled, none built. |
| "Bypassed the evaluation filters" for PowerShell variable patterns | This describes defeating a security guard rail rather than fixing the script to pass it legitimately. Treated as untrustworthy; not repeated or relied on in this document. |

**Net effect:** only the root-level product spec (`AI Content Factory — V2.md`) and the import contract (`CONTENT_IMPORT_SCHEMA.md`) are usable as-is. Everything else under `ai-learning-content-factory/` was scaffolding/documentation with no working implementation behind it. This SLAD supersedes the conflicting architecture docs and picks one stack.

**Stack decision made in this document: Python.** Rationale: the original product spec was written natively for FastAPI/LangGraph/pgvector; the sibling `article_platform/` project in this same workspace is already Python; and Postgres/pgvector lets the factory share infrastructure patterns with `ggcms` without needing a second runtime. The Go and Node scaffolds should be deleted once this plan is approved.

---

## 1. Product Vision

> **Knowledge-driven autonomous learning content factory** — not an "AI article writer."

Transforms: user expertise, books, PDFs, websites, existing content, live web signals, and learner needs → Knowledge & Opportunity Intelligence → Research → Learning Design → Content Production → Quality Validation → Markdown + JSON → an external learning platform (`ggcms`).

Two operating modes:
- **Mode A — user-directed:** "Create a practical tutorial about AI coding agents."
- **Mode B — autonomous discovery** (the strategic differentiator): "Find useful topics people are searching for in my niche and continuously create high-value content."

### Product principles
1. **Knowledge first** — documents/URLs become reusable Knowledge Packs, not one-off inputs.
2. **Opportunity before generation** — never generate purely because an LLM can; require demand/gap evidence.
3. **Learning quality before SEO** — priority order: learner value → accuracy → instructional quality → practical usefulness → citations → freshness → SEO/GEO.
4. **Cheap operations first** — deterministic filtering and cheap models gate expensive LLM calls.
5. **Human control with progressive autonomy** — manual → semi-automatic → automatic → fully autonomous, with topic approval gates.
6. **Useful content, not maximum content** — 10,000 items/month is a capacity target, not a goal in itself; relevance and evidence quality gate volume.

---

## 2. Target Users

- **Primary:** learning-platform operators (tech, AI, cybersecurity, cloud, dev, professional/certification education).
- **Secondary:** subject-matter experts, trainers, content/SEO teams, corporate L&D teams.

---

## 3. Core Product Modules

1. Content Strategy
2. Knowledge Library
3. Source Ingestion
4. Opportunity Discovery
5. Research
6. Learning Architecture
7. Content Planning
8. Content Generation
9. Quality Assurance
10. Export & Integration

---

## 4. High-Level Architecture

```text
                         ┌───────────────────────┐
                         │      React UI          │
                         │  Content Factory Console│
                         └───────────┬───────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │      FastAPI API      │
                         └───────────┬───────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │  Agent Orchestrator   │
                         │      LangGraph        │
                         └───────────┬───────────┘
                                     │
             ┌───────────────────────┼────────────────────────┐
             ▼                       ▼                        ▼
    ┌────────────────┐      ┌────────────────┐       ┌────────────────┐
    │ Opportunity    │      │ Knowledge      │       │ Learning       │
    │ Engine         │      │ Engine         │       │ Engine         │
    └───────┬────────┘      └───────┬────────┘       └───────┬────────┘
            │                       │                        │
       Trends/Search         PDFs/Books/URLs          Learning Design
       Content Gaps          Web Research/RAG          Objectives/Exercises
            │                       │                        │
            └───────────────────────┼────────────────────────┘
                                    ▼
                           Content Planner → Writer → Quality Gate
                                    │
                              ┌─────┴─────┐
                            PASS         FAIL → Revision (max 3 cycles)
                              ▼
                     Markdown + JSON Export
                                    │
                                    ▼
                    ggcms  POST /api/import/ingest
```

### Agent workflow (LangGraph state machine)

```text
START → Load Strategy → Discover Opportunities → Rank Opportunities → Select Topic
      → Retrieve Knowledge → Research Web → Build Evidence Pack
      → Design Learning Structure → Create Content Plan → Generate Draft
      → Fact Check → Citation Check → Learning Quality Check → SEO/GEO Check
      → Revision if required → Finalize → Export → END
```

Agents communicate via structured state (Pydantic schemas), never free-form prose handoffs.

---

## 5. Feature Detail

### 5.1 Knowledge Library
Sources: PDF, EPUB, Markdown, TXT, DOCX, URL/website/sitemap/RSS, documentation sites, GitHub repos, existing exported CMS content.

Ingestion pipeline: `Upload/URL → Source registration → Fetch → Extract → Normalize → Chunk → Metadata → Embedding → Vector storage → Knowledge Library`.

Every source retains: source ID, title, author, publisher, URL, publication/ingestion dates, source type, license metadata, checksum, extracted text, section/page info.

**Knowledge Pack** — a reusable, curated evidence bundle per subject (definitions, concepts, examples, patterns, limitations, references) reused across article/tutorial/lesson/quiz/exercise/project generation from a single research pass — this is the core cost-control mechanism at scale (§5.9).

### 5.2 Opportunity Discovery
Signals: Google Trends, search results, keyword data, Reddit, YouTube, news, GitHub activity, competitor content, learner questions, knowledge gaps. No single-signal dependency.

Default scoring weights (configurable): Search demand 25%, Trend momentum 20%, Content gap 20%, Competition 15%, Audience relevance 10%, Business/learning value 10%.

Content gap detection asks: what exists / what do competitors cover / what do learners ask / what's missing, outdated, or poorly explained.

### 5.3 Research & Evidence
Source hierarchy:
- **Tier 1:** official docs, standards, government/academic sources.
- **Tier 2:** established technical publications, reputable vendor research, recognized experts.
- **Tier 3:** community discussions/Reddit/forums — usable for terminology/sentiment/pain-points, never as sole authoritative evidence.

Output is a structured **Evidence Pack** (claims + evidence + source + confidence, definitions, examples, limitations, controversies, open questions, citations) — the Writer works primarily from this, not raw search results.

### 5.4 Learning Architecture
Determines learner problem, objectives, prerequisites, difficulty, conceptual sequence, examples, exercises, and assessment points before any prose is written.

### 5.5 Content Types
article, tutorial, explainer, how-to, comparison, troubleshooting guide, FAQ, cheat sheet, lesson, quiz, exercise, project, learning path — extensible.

### 5.6 Writer Agent
Synthesizes Strategy + Knowledge Pack + Evidence Pack + Learning Plan + Content Plan + Brand Voice into original material. Must not copy source text — summarize/transform only.

### 5.7 Quality Gate
Checks per item: factuality, citation validation, source-integrity (citation actually supports the claim), learning quality (objectives/progression/prerequisites/clarity/examples/difficulty), originality, readability, SEO, GEO/AI-search readiness (clear definitions, direct answers, structured sections, concise summaries).

Revision loop: Draft → Audit → Issues → Revision Agent → Audit again, max **3 cycles**, then `status = NEEDS_REVIEW` (never silently discarded).

### 5.8 Canonical Format & Export
Canonical representation is **JSON**; Markdown is derived from it. Export package: `manifest.json + articles/ + research/ + sources/`. The factory's responsibility ends at Generate → Validate → Package → Export — it does **not** own import, publishing, users, courses, navigation, access control, or analytics (that's `ggcms`'s job — no Strapi dependency, no CMS lock-in).

### 5.9 Scale & Cost Control
Target: ~10,000 items/month **without** 10,000 independent research operations. Mechanism: 1 topic research → 1 Knowledge/Evidence Pack → many derived items (article, tutorial, FAQ, quiz, exercise, cheat sheet). Cost pipeline: rules → cheap filtering → small/cheap model → expensive model reserved for high-value work only.

### 5.10 Content Lifecycle & Versioning
States: `DISCOVERED → APPROVED → RESEARCHING → PLANNED → GENERATING → VALIDATING → REVISION → READY → EXPORTED → PUBLISHED → ARCHIVED`.

Every item retains `content_id, version, parent_version, created_at, updated_at` and full provenance (knowledge sources, research sources, claims, citations, model, generation timestamp, agent workflow, quality scores) — auditable by design. Refresh workflow re-researches stale claims and creates a new version rather than overwriting.

### 5.11 Autonomy & Human Approval
Configurable per project: topics/day, content types, minimum opportunity score, required source quality, max generation cost, require-approval flag, automatic export.

Approval modes:
1. Discover → **Ask approval** → Generate
2. Discover → Generate → **Ask approval** → Export
3. Discover → Generate → Validate → Export (fully automatic)

### 5.12 UI Screens
Dashboard (content/jobs/opportunities/quality/knowledge-source counts) · Project Configuration · Knowledge Library (upload/status/errors) · Content Opportunity board (score/demand/trend/gap, Approve/Reject/Generate/Edit) · Generation console (live agent progress ticker) · Autonomous Factory settings.

---

## 6. Open-Source Technology Selection

Selection criteria: maturity, license (permissive preferred), operational simplicity on GCP free-tier-adjacent infra, and fit with the existing `ggcms` (Postgres) and `article_platform` (Python) stacks already in this workspace.

| Layer | Chosen | Why chosen | Alternatives considered | Why not chosen |
|---|---|---|---|---|
| API framework | **FastAPI** | Async-native, Pydantic-integrated validation, best-in-class for LLM/agent backends | Flask, Django REST | Django too heavy for an agent-console API; Flask lacks native async + typed validation |
| Data validation / schemas | **Pydantic v2** | Same models double as agent I/O contracts (§9 Agent Contract) | marshmallow, attrs | Pydantic is FastAPI's native integration, avoids duplicate schema definitions |
| Agent orchestration | **LangGraph** | Explicit stateful graph (not a single freeform LLM call), first-class support for revision loops and structured state handoff | CrewAI, AutoGen, plain function chaining | CrewAI/AutoGen are more opinionated about agent "roles" and weaker on explicit state machines with conditional edges (needed for the Quality Gate pass/fail branch) |
| LLM abstraction | Custom `ModelProvider` interface over **LiteLLM** | One interface, swap Gemini/OpenAI/Anthropic/local without touching agents | LangChain's built-in model classes | LiteLLM gives a thinner, provider-agnostic router with cost tracking out of the box |
| Relational DB | **PostgreSQL** | Already the system-of-record pattern in `ggcms`; one relational engine across the ecosystem | MySQL | No feature advantage for this workload; Postgres wins on pgvector fit |
| Vector search | **pgvector** (Postgres extension) | Avoids a second database at MVP scale; co-located with relational metadata for simple joins/filtering | Pinecone, Weaviate, Qdrant, Milvus | Dedicated vector DBs add ops burden and cost with no benefit until corpus size/QPS actually requires it (spec §13, §41 explicitly defer this) |
| Object storage | **GCP Cloud Storage** | Native to the deployment target; store PDFs/raw pages/exports cheaply | MinIO (self-hosted S3) | Only worth it if avoiding cloud lock-in is a hard requirement; not stated here |
| Job queue / async workers | **Cloud Pub/Sub** (added at Phase 2, not MVP) | Matches GCP-native deployment; defers infra cost until volume justifies it | Celery + Redis, RQ | Redis/Celery adds a stateful component to operate; Pub/Sub is serverless and free-tier friendly |
| Web fetch (HTTP) | **httpx** | Async, HTTP/2, modern | requests, aiohttp | requests is sync-only; aiohttp works but httpx has a friendlier async API and better typing |
| HTML parsing | **BeautifulSoup4** | De facto standard, simple API for the fallback/structural parsing cases | lxml directly, selectolax | BS4 remains the pragmatic default; selectolax is faster but adds a dependency for marginal gain at this scale |
| Content extraction (readability) | **trafilatura** | Best-in-class boilerplate removal + metadata extraction benchmark results among open-source extractors | readability-lxml, newspaper3k | trafilatura consistently outperforms both in extraction-accuracy benchmarks and is actively maintained |
| Browser automation (JS-heavy/auth sources only) | **Playwright** | Modern, reliable, used only as an escape hatch per spec §42 | Selenium | Playwright has better auto-waiting semantics and is lower-maintenance; Selenium reserved only if a source specifically requires it |
| PDF extraction | **PyMuPDF (fitz)** | Fast, accurate text+layout extraction, active maintenance | pdfplumber, PyPDF2 | PyMuPDF is materially faster and more robust on real-world scanned/complex PDFs |
| Embeddings | Provider-native (Gemini/OpenAI embeddings) via the `ModelProvider` abstraction | Avoids running a separate embedding service | sentence-transformers (local) | Local embedding models are a valid future cost-reduction lever once volume justifies self-hosting; not needed at MVP |
| Frontend framework | **React + TypeScript + Vite** | Lightweight console, not a CMS; Vite gives fast dev iteration | Next.js | Next.js's SSR/routing features are unneeded for an internal agent-control console |
| Styling | **Tailwind CSS** | Fast to build a utility console UI without a design system investment | — | — |
| Containerization | **Docker** + **docker-compose** (local) | Standard, matches `ggcms`'s existing `docker-compose.yml` pattern | — | — |
| Deployment | **Cloud Run** | Serverless, scales to zero, matches the GCP free-tier deployment already used for `ggcms` | GKE, Compute Engine VM | Unnecessary operational overhead for this workload at MVP scale |
| Secrets | **GCP Secret Manager** | Native, IAM-integrated | `.env` files in prod | `.env` acceptable for local dev only, per spec §47 |
| Prompt management | Version-controlled `.md` files under `/prompts/` | Matches spec §64; keeps prompts reviewable in git diffs, decoupled from code | A prompt-management SaaS (e.g. PromptLayer) | Adds an external dependency/cost with no clear MVP benefit; revisit only if prompt iteration velocity demands it |
| Observability | **OpenTelemetry** + Cloud Logging/Monitoring | Already present as a dependency in the sibling `article_platform/.venv` (otel packages already in use in this workspace) | Datadog, custom logging | OTel is open standard, avoids vendor lock-in, exports to Cloud Monitoring natively |
| Testing | **pytest** + **pytest-asyncio** | Standard for async Python/FastAPI | unittest | pytest's fixture model and async support are a better fit for agent/workflow tests |

---

## 7. Database Entities (minimum set)

```text
Project · ProjectStrategy · Source · KnowledgeDocument · KnowledgeChunk · KnowledgePack
Opportunity · ResearchRun · EvidencePack · LearningPlan · ContentPlan
ContentItem · ContentVersion · QualityReport · GenerationJob · ExportPackage
```

## 8. API Surface (minimum)

```text
GET/POST   /api/projects
GET/PUT    /api/projects/{id}/strategy
GET/POST   /api/sources
POST       /api/sources/upload
GET/POST   /api/knowledge-packs
GET        /api/opportunities
POST       /api/opportunities/{id}/approve
POST       /api/generate
GET        /api/jobs/{id}
GET        /api/content
GET        /api/content/{id}
POST       /api/content/{id}/refresh
POST       /api/content/{id}/export
GET        /api/analytics
```

## 9. Agent Contract Pattern

Every agent declares: Input schema, Output schema, Prompt (versioned file), Tools, Validation, Retry policy. Example:

```text
ResearchAgent
  Input:  topic, strategy, knowledge_pack
  Tools:  web_search, knowledge_search
  Output: EvidencePack
```

Tool interfaces to abstract regardless of provider: `WebSearchTool, WebFetchTool, KnowledgeSearchTool, PDFExtractor, WebsiteExtractor, TrendTool, SearchDataTool, GitHubTool, StorageTool, ModelTool, ExportTool`.

---

## 10. Integration Contract with ggcms

Reference: `docs/import-contract/CONTENT_IMPORT_SCHEMA.md` (retained — the one prior artifact that is sound and consistent with `ggcms`'s design).

- **Endpoint:** `POST /api/import/ingest` on `ggcms`, secured by `X-Factory-Sync-Secret` shared token (must live in Secret Manager on both sides, never in source).
- **Payload:** versioned `SyncPayload` (schema_version 2.0) — `metadata`, `learning` (objectives/prerequisites/skills), `article_body` **or** `course_details`, `quizzes`, `exercises`, `provenance` (model/provider/agent_version/knowledge_pack/quality_score).
- **ggcms-side handling:** category mapping, author mapping, `DRAFT`-first insert (published only if campaign specifies auto-publish), population of `tasks`/`enrollments` for quizzes/exercises, and clean semantic markdown segmentation so the highlighter (`web-highlighter`) can anchor DOM offsets reliably.
- **Note:** the schema doc's DTOs are written as Go structs for documentation clarity; the factory itself (Python) should define the equivalent as Pydantic models and serialize to the same JSON shape — the contract is the JSON wire format, not the implementation language on either side.

---

## 11. Deployment Architecture (GCP)

### MVP
```text
Internet → Cloud Run (FastAPI + UI) → PostgreSQL+pgvector
                                    → Cloud Storage (sources/knowledge/generated/exports)
```
Components: Cloud Run, Cloud Storage, PostgreSQL/pgvector, Secret Manager, Cloud Scheduler.

### Phase 2 (async, higher volume)
```text
Cloud Scheduler → Factory Scheduler → Pub/Sub → Worker → LangGraph → Agents
```
Worker categories: `opportunity-worker, ingestion-worker, research-worker, generation-worker, quality-worker, export-worker`.

**Explicitly deferred:** BigQuery (until analytical scale demands it), dedicated vector DB, complex authenticated portal crawling, large-scale distributed infra, multimodal generation, sophisticated competitor intelligence.

---

## 12. Security & Crawling Rules

- Secret Manager / env vars / service accounts / least-privilege IAM / encrypted storage / signed exports where appropriate.
- Never store passwords, API keys, or session cookies in source or normal config.
- Web crawling must respect `robots.txt` and source terms, rate-limit requests, self-identify where required, avoid unnecessary crawling, and never bypass access controls. Authenticated crawling limited to sources the user is actually authorized to access.
- *(See §0 above — no shortcuts around security tooling/hooks are acceptable; if a filter blocks generated code, fix the code, don't defeat the filter.)*

---

## 13. Observability

Per-job tracking: `job_id, project_id, started_at, completed_at, status, error, cost_estimate`.

Aggregate metrics: jobs started/completed/failed, sources ingested, documents processed, opportunities discovered, content generated/rejected, quality scores, revision counts, generation latency, model usage, estimated cost.

Failure objects are structured, e.g. `{"error_type":"RESEARCH_INSUFFICIENT","message":"...","retryable":false}` — content must never proceed to `READY` without minimum evidence.

---

## 14. MVP Scope

**Must have:** React UI, FastAPI, project configuration, PDF upload, URL/website ingestion, Knowledge Packs, pgvector retrieval, opportunity creation, web research, Learning Architect, content planner, writer, quality checks, Markdown export, JSON export, job tracking.

**Defer:** complex authenticated portal crawling, BigQuery, advanced learner analytics, automatic publishing, large-scale distributed infra, sophisticated competitor intelligence, multimodal generation.

**Phase 2:** trend discovery, Reddit/YouTube/GitHub signals, competitor analysis, autonomous topic selection, scheduled generation, Pub/Sub workers, cost controls, batch processing.

**Phase 3:** learner analytics, search-console feedback, content performance, automatic refresh, behavior-driven gap detection, learning-path generation, quizzes/exercises/projects at scale.

**Phase 4:** full "Learning Content Operating System" — Knowledge + Market Demand + Learner Behaviour → Content Intelligence → continuous production.

---

## 15. Success Metrics

- **Production:** items/month, successful generation rate, cost/item, time/item.
- **Quality:** factual accuracy, citation coverage, quality score, revision rate.
- **Learning:** objective completion, engagement, quiz performance, learner satisfaction.
- **Discovery:** impressions, search visibility, organic traffic, AI-search visibility.
- **Business:** returning users, registrations, course starts, conversions.

---

## 16. Recommended Repository Layout

```text
ai-content-factory/
├── frontend/        (React/TS/Vite/Tailwind — src, components, pages, services)
├── backend/
│   ├── api/
│   ├── agents/ (strategy, opportunity, research, learning, planning, writing, quality)
│   ├── ingestion/  knowledge/  retrieval/  models/  workflows/  exporters/  services/
├── migrations/  configs/  prompts/  schemas/  tests/  docker/  deployment/
└── README.md
```

---

## 17. Immediate Next Steps

1. Delete the empty Node/TS scaffold (`apps/*`, `packages/*`) and the orphaned, non-buildable Go files (`cmd/importer/main.go`, `packages/exports/gg_importer.go`) — or explicitly archive them if you want to keep the Go exploration for reference.
2. Delete or clearly mark `V2_GO_ARCHITECTURE_AND_DESIGN.md` as superseded by this document.
3. Scaffold the real Python repo per §16.
4. Implement MVP scope (§14) end-to-end before touching Phase 2+.
5. Implement the ggcms import client in Python against the contract in §10, replacing the orphaned Go importer.
