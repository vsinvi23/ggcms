# AI Content Factory — Solution & Architecture Design (SLAD)
**Version 1.1 — Consolidated master reference + Quality/Grounding Hardening**

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

**Trust fast-track (added §18):** Tier-1 domains (`wikipedia.org`, `*.gov`, `*.edu`, official docs sites) discovered during autonomous web research are marked `review_status = AUTO_APPROVED` rather than sitting `PENDING` until a human reviews them — retrieval (`similarity_search`, `count_approved_sources`) treats `APPROVED` and `AUTO_APPROVED` as equally usable. This closes the original gap where an autonomous pass could research a topic, find good sources, and still generate from zero usable context because nothing had been manually approved yet. Retrieval itself moved from keyword-count scanning to real cosine-similarity ranking over Gemini embeddings (cached in a local SQLite store), using the same embedding client the Knowledge Pack pipeline already had (§6) — no new ML dependency introduced.

### 5.4 Learning Architecture
Determines learner problem, objectives, prerequisites, difficulty, conceptual sequence, examples, exercises, and assessment points before any prose is written.

### 5.5 Content Types
article, tutorial, explainer, how-to, comparison, troubleshooting guide, FAQ, cheat sheet, lesson, quiz, exercise, project, learning path — extensible.

### 5.6 Writer Agent
Synthesizes Strategy + Knowledge Pack + Evidence Pack + Learning Plan + Content Plan + Brand Voice into original material. Must not copy source text — summarize/transform only.

### 5.7 Quality Gate
Checks per item: factuality, citation validation, source-integrity (citation actually supports the claim), learning quality (objectives/progression/prerequisites/clarity/examples/difficulty), originality, readability, SEO, GEO/AI-search readiness (clear definitions, direct answers, structured sections, concise summaries), and (added §18) **narrative voice / humanization** — scored against the same story-driven-writing rubric the Writer agent is instructed to follow, so a factually correct but robotic draft no longer passes silently.

Revision loop: Draft → Audit → Issues → Revision Agent → Audit again, max **3 cycles**, then `status = NEEDS_REVIEW` (never silently discarded). As of §18, the Quality Gate's `issues` and `narrative_voice_issues` are no longer discarded between cycles — they are formatted into structured revision feedback and fed back into the next Writer pass, so revisions actually address what failed rather than the Writer blindly retrying.

**Evidence-drift fact-checking (added §18):** the Fact Checker previously checked claims only against the already-synthesized Evidence Pack, one step removed from raw source text — a claim could be attributed to a source that never actually said it, and this went undetected. The Fact Checker now also receives the raw retrieved source chunks (unioned with, not replacing, the existing evidence-pack context, so PENDING web-discovered chunks aren't dropped) and reports `evidence_drift_claims` (claim attributed to a source but the source's actual wording differs or contradicts it) as a distinct signal from the original "no source support at all" check.

**Course-level tone consistency & originality (added §18):** multi-lesson courses previously had no mechanism keeping voice consistent lesson-to-lesson, and no check for near-verbatim copying from source material. A one-time "style fingerprint" is now extracted from a course's first lesson and reused as the brand-voice input for every subsequent lesson. A deterministic (no-embeddings) n-gram overlap check flags drafts with high verbatim overlap against source chunks as a **warning** in `issues` — not a hard failure, since grounded quotes legitimately overlap with source text.

### 5.8 Canonical Format & Export
Canonical representation is **JSON**; Markdown is derived from it. Export package: `manifest.json + articles/ + research/ + sources/`. The factory's responsibility ends at Generate → Validate → Package → Export — it does **not** own import, publishing, users, courses, navigation, access control, or analytics (that's `ggcms`'s job — no Strapi dependency, no CMS lock-in).

### 5.9 Scale & Cost Control
Target: ~10,000 items/month **without** 10,000 independent research operations. Mechanism: 1 topic research → 1 Knowledge/Evidence Pack → many derived items (article, tutorial, FAQ, quiz, exercise, cheat sheet). Cost pipeline: rules → cheap filtering → small/cheap model → expensive model reserved for high-value work only.

**Real cost metering (added §18):** `GenerationJob.cost_estimate` was previously a flat per-job constant, unrelated to what a job actually spent — meaning `max_monthly_ai_budget` didn't correspond to anything real. Every structured LLM call across every agent is now metered per-call (input/output tokens × a static per-model pricing table), accumulated into a single `CostTracker` instance threaded through the whole pipeline run (including multi-lesson course generation and revision-loop iterations), and logged per-agent-run for auditability — turning the budget cap from a no-op into an enforceable one.

### 5.10 Content Lifecycle & Versioning
States: `DISCOVERED → APPROVED → RESEARCHING → PLANNED → GENERATING → VALIDATING → REVISION → READY → EXPORTED → PUBLISHED → ARCHIVED`.

Every item retains `content_id, version, parent_version, created_at, updated_at` and full provenance (knowledge sources, research sources, claims, citations, model, generation timestamp, agent workflow, quality scores) — auditable by design. Refresh workflow re-researches stale claims and creates a new version rather than overwriting.

### 5.11 Autonomy & Human Approval
Configurable per project: topics/day, content types, minimum opportunity score, required source quality, max generation cost, require-approval flag, automatic export.

Approval modes:
1. Discover → **Ask approval** → Generate
2. Discover → Generate → **Ask approval** → Export
3. Discover → Generate → Validate → Export (fully automatic)

**Auto-publish gates (added §18):** mode 3's automatic export previously gated only on the weighted overall quality score, so a draft could score well on average while being ungrounded or robotic and still auto-publish. The scheduler's `_maybe_publish` decision now additionally requires (a) `narrative_voice_score` to clear a configurable per-project floor (`humanization_auto_publish_floor`, default 70) independent of the weighted average, and (b) the content to be `is_grounded` (i.e., generated from real approved/auto-approved source material, not a research-fallback). Both gates fail **open** (not closed) when the underlying field is `None` — protecting pre-cutover `QualityReport` rows from being retroactively blocked — and each gate now logs a distinct reason in the scheduler's decision log so operators can tell which check blocked a given item.

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

## 18. Quality & Grounding Hardening (2026-09) — findings and fixes

A deep review of the implemented factory (which by this point had moved well past MVP scaffolding into a working LangGraph pipeline) found that autonomous generation could produce content that was factually checked but not actually humanized, story-driven, or reliably grounded in the sources it claimed to draw from. Seven gaps were identified and fixed in one coordinated multi-agent implementation pass:

| # | Gap | Fix |
|---|---|---|
| 1 | Weak source grounding — approved-source filter blocked freshly-discovered trustworthy sources; retrieval was keyword-count matching, not semantic | Trust fast-track (`AUTO_APPROVED` review status for Tier-1 domains) + real embedding-based semantic retrieval via the existing Gemini embedding client, with a new `is_grounded` signal threaded end-to-end into the persisted `QualityReport` |
| 2 | Fact-checking worked only against the synthesized Evidence Pack, not raw source text | `FactCheckerAgent` now also checks against raw retrieved source chunks; new `evidence_drift_claims` field distinct from "unsupported claim" |
| 3 | No scoring of narrative voice/humanization — a robotic-but-accurate draft could pass | New `narrative_voice_score` dimension in the Quality Gate, scored against the Writer agent's own voice rubric; version-aware scoring weights (`v2`) so the dimension set scored is fully determined by the resolved weighting version, not hardcoded |
| 4 | No course-level tone consistency across lessons; no plagiarism/near-copy detection | Once-per-course style fingerprint threaded through lesson generation; deterministic n-gram overlap check flags (warns, doesn't hard-fail) near-verbatim source copying |
| 5 | Cost tracking was a flat per-job estimate, unrelated to actual spend | Real per-call token metering (input/output tokens × static pricing table) accumulated in a `CostTracker` threaded through the whole pipeline run, replacing the flat constant |
| 6 | Auto-publish gated only on weighted overall score | Added independent humanization-floor and grounding gates to the scheduler's publish decision, both fail-open on missing data for backward compatibility |
| 7 | Image placement was a permanent stub (no real images ever attached) | Real image lookup service (Pexels) with mock-mode/soft-fail behavior matching the existing web-search service's pattern; minimal frontend rendering support |

**Root shared wiring point:** `backend/api/routers/generation.py`'s `QualityReport(...)` construction is the single place every quality signal must be explicitly mapped from the pipeline's internal dict to the persisted domain model — any new signal not added there is silently dropped before it ever reaches the scheduler's publish decision. This is now the documented integration seam for future quality dimensions.

**Deferred (explicitly out of scope for this pass):** an LLM-as-judge golden-corpus evaluation tier (`tests/eval/`) for humanization quality — needs CI/secrets infrastructure decisions; and extending the Citation Checker with the same evidence-drift awareness as the Fact Checker.

---

## 19. Immediate Next Steps

1. Delete the empty Node/TS scaffold (`apps/*`, `packages/*`) and the orphaned, non-buildable Go files (`cmd/importer/main.go`, `packages/exports/gg_importer.go`) — or explicitly archive them if you want to keep the Go exploration for reference.
2. Delete or clearly mark `V2_GO_ARCHITECTURE_AND_DESIGN.md` as superseded by this document.
3. Stand up the deferred `tests/eval/` LLM-as-judge tier for narrative-voice quality once CI/secrets infra decisions are made (§18).
4. Extend the Citation Checker agent with the same evidence-drift awareness added to the Fact Checker (§18).
5. Continue MVP/Phase 2 feature buildout (§14) — trend discovery, autonomous topic selection, scheduled generation.
