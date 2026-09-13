# Implementation Status

**Written:** 2026-09-01, as part of final integration verification across the
agents, data layer, knowledge/retrieval, exporters, API, and frontend
workstreams. This file exists specifically to give an honest, per-module
account of what is genuinely working end-to-end in this sandbox versus what
is still deferred or unverified — after two prior status reports in this
project overstated completion. Treat any claim not backed by a command run
in this session as unverified.

Verification environment: local sandbox, no live Postgres, no live Gemini
API key with working network/TLS egress, no live ggcms instance reachable.
Everything marked "verified" below was verified against that constraint —
i.e. verified as far as this sandbox allows, not against production
infrastructure.

---

## 1. Backend import / API wiring — VERIFIED

`backend.api.main:app` imports cleanly with
`.venv\Scripts\python.exe -c "from backend.api.main import app"` — no
circular imports, no missing `__init__.py` exports, no mismatched class
names found. This was already true at the start of this verification pass;
no fixes were required here.

Full route table (methods, path), enumerated by walking `app.routes`
including the FastAPI 0.141 `_IncludedRouter` wrapper:

```
GET    /api/analytics
GET    /api/content
GET    /api/content/{content_id}
POST   /api/content/{content_id}/export
POST   /api/content/{content_id}/refresh
POST   /api/generate
GET    /api/health
GET    /api/jobs/{job_id}
POST   /api/knowledge-packs
GET    /api/knowledge-packs
GET    /api/opportunities
POST   /api/opportunities/{opportunity_id}/approve
POST   /api/projects
GET    /api/projects
GET    /api/projects/{project_id}/strategy
PUT    /api/projects/{project_id}/strategy
GET    /api/sources
POST   /api/sources
POST   /api/sources/upload
```

This matches IMPLEMENTATION_SPECIFICATION.md section 6 exactly — every
path, verb, and route parameter name lines up with the spec's API Contract
block. No divergence found; no edits made to any router in this pass.

**Not verified:** that any of these endpoints actually completes a real
request against a live Postgres — no DB is reachable in this sandbox (see
section 2). Import success and route registration is not the same as a
passing request/response cycle.

## 2. Agents + shared scoring — VERIFIED (with one fix)

- `OpportunityAgent` (`backend/agents/opportunity_agent.py`) already called
  `backend.services.scoring.compute_opportunity_score(...)` for its final
  weighted score — it does not compute an inline duplicate formula. No
  refactor was needed here; the shared-source-of-truth requirement was
  already met by the agents workstream.
- Every agent (`research`, `learning_architect`, `content_planner`,
  `writer`, `fact_checker`, `citation_checker`, `quality`, `strategy`,
  and the LLM-estimation branch inside `opportunity`) wraps its LLM/logic
  call in `try/except Exception`, logs the failure, and re-raises as
  `AgentExecutionError(AgentError(error_type=..., agent_name=..., message=...,
  retryable=...))` — never swallows and never falls back to fabricated
  "success" data when `settings.mock_mode` is `False`.
- **Fix applied:** `run_test.py` itself caught the propagated
  `AgentExecutionError` in a bare `except Exception` and printed only
  `str(e)`, discarding the structured `error_type` / `agent_name` /
  `retryable` fields — a real (if minor) regression of the fail-loud intent
  at the outermost layer. Rewrote it to catch `AgentExecutionError`
  specifically, print all structured fields, and exit non-zero; a second,
  narrower `except Exception` remains only to catch a genuinely
  *unstructured* error and flag it distinctly as unexpected.

### Mock-mode run — PASS, clearly labeled

`MOCK_MODE=true .venv\Scripts\python.exe run_test.py` completes the full
9-node LangGraph pipeline (`research → learning_architect → content_planner
→ writer → fact_check → citation_check → quality_check → export`), ends
with `Is Approved: True`, and the underlying draft/evidence objects contain
literal `"MOCK ..."` strings (e.g. `title="MOCK Draft Title"`,
`claim="MOCK claim"`) — this is not silently-empty fallback data, it is
unmistakably labeled as mock at every field.

### Non-mock run — PASS, fails loud with a structured error

With `MOCK_MODE` unset, the same run hits a real network/TLS failure
calling `generativelanguage.googleapis.com` (no working Gemini credential/
egress in this sandbox), and now:

```
FAILED: AgentExecutionError raised (fail-loud path working as intended)
  error_type: LLM_CALL_FAILED
  agent_name: ResearchAgent
  retryable: True
  message: Cannot connect to host generativelanguage.googleapis.com:443 ...
```

Exit code is `1`. No silent success, no empty/garbage `EvidencePack`
returned as if valid. This is the fail-loud correctness bar the user asked
for, and it holds at every agent boundary checked, not just `ResearchAgent`
— confirmed by code inspection of all nine agent files.

**Not verified:** fail-loud behavior against a real Gemini call that
returns a *malformed but 200-OK* structured-output response (e.g. schema
violation from the model itself, not a transport error) — this sandbox
only exercised the transport-failure path, not a live-API schema-violation
path, since no working Gemini key/egress is available here.

## 3. Data layer (models + Alembic) — PARTIALLY VERIFIED

`backend/models/domain.py` defines 16 ORM classes (`Project`,
`ProjectStrategy`, `Source`, `KnowledgeDocument`, `KnowledgeChunk`,
`KnowledgePack`, `Opportunity`, `ResearchRun`, `EvidencePack`,
`LearningPlan`, `ContentPlan`, `ContentItem`, `ContentVersion`,
`QualityReport`, `GenerationJob`, `ExportPackage`) and imports cleanly.
`backend/migrations/versions/0001_init.py` compiles
(`python -m py_compile`) with no syntax errors.

**Explicitly deferred / not verified:**
- The Alembic migration has **never been applied to a live database**. No
  Postgres instance (with or without pgvector) is reachable in this
  sandbox — `alembic check` fails immediately on connection, as expected.
  Whether `0001_init.py` actually produces a schema that matches the ORM
  models (column types, indexes, pgvector extension, FK constraints) is
  unverified beyond static compilation.
- No round-trip (insert/query) test has been run against any of the 16
  tables.

## 4. Knowledge / retrieval + ingestion pipeline — PARTIALLY VERIFIED

`backend/ingestion/` contains `pipeline.py`, an RSS fetcher
(`fetchers/rss_fetcher.py`), and HTML/PDF extractors
(`extractors/html_extractor.py`, `extractors/pdf_extractor.py`).
`backend/retrieval/vector_store.py` carries two explicit `TODO` markers
(a fallback-branch reconciliation note and a data-layer migration note) —
these are pre-existing, marked TODOs, not silent gaps.

**Explicitly deferred / not verified:**
- **No real Trends/Reddit/GitHub signal ingestion exists.** `"github"` only
  appears as a `source_type` enum value for ingesting a GitHub repo's docs
  as a knowledge source — there is no scraper/agent that pulls trending
  topics, Reddit discussions, or GitHub issue/star signals to seed
  `Opportunity` candidates. `backend/api/routers/opportunities.py` only
  reads/writes `Opportunity` rows already in the DB; nothing in this
  codebase populates `signals[topic]` from a live external source today —
  that dict is only ever exercised by tests/manual calls into
  `OpportunityAgent.run(candidates, signals)`.
- No live document fetch was run against a real URL/RSS feed/GitHub repo in
  this pass — only static import/compile checks were performed on the
  ingestion modules.
- Vector store correctness (embeddings actually inserted/searchable via
  pgvector) is unverified — no live DB, per section 3.

## 5. Exporters (JSON canonical + ggcms sync) — VERIFIED, no mismatches found

`backend/exporters/json_exporter.py::build_canonical_json` was checked
field-for-field against IMPLEMENTATION_SPECIFICATION.md section 9. Its
output dict contains exactly: `schema_version, content_id, content_type,
title, slug, summary, audience, difficulty, objectives, sections, sources,
seo, geo, quality, generated_at` — all 15 spec fields present, no extras,
no renames. No fix was needed.

`backend/schemas/sync_payload.py` was checked field-for-field against
CONTENT_IMPORT_SCHEMA.md section 3.1's Go DTO. Every nested type
(`ContentMetadata`, `LearningSpecs`, `ArticleBody`/`ArticleSection`,
`CourseSpecs`/`CourseSection`/`LessonSpec`, `QuizSpec`, `ExerciseSpec`,
`ProvenanceSpecs`) mirrors the Go `json:"..."` tag names exactly (including
`sort_order`, `markdown_body`, `knowledge_pack_id`, `agent_version`), and
the `omitempty` pointer fields (`article_body`, `course_details`) are
correctly modeled as `X | None = None`. No fix was needed.

`backend/exporters/ggcms_client.py::build_sync_payload` correctly builds a
`SyncPayload` from `build_canonical_json(...)` plus `body_json` extras, and
`push_content` posts to `{ggcms_base_url}/api/import/ingest` with the
`X-Factory-Sync-Secret` header, raising a structured `GgcmsSyncError`
(carrying status code + response body) on transport failure, non-2xx, non-
JSON body, or a `SyncResult` schema mismatch — no silent-success path.

**Explicitly deferred / not verified:**
- `upload_export_package` (real GCS upload of the export package) is an
  intentional, clearly-labeled stub (`raise NotImplementedError`, with a
  `TODO(export/gcs)` docstring) — not implemented, not silently faked.
- **No live ggcms integration test was run.** `push_content` was read and
  reasoned about, not executed against a real or fake `httpx.AsyncClient`
  in this session — no test suite run confirms the payload is actually
  accepted by a real ggcms `/api/import/ingest` endpoint.

## 6. Frontend UI — VERIFIED (build only)

`npm run build` (`tsc && vite build`) in `frontend/` succeeds with zero
TypeScript errors: 1486 modules transformed, output emitted to `dist/`
(`index.html`, one CSS bundle, one JS bundle ~219 kB / 65 kB gzipped). No
type-error fixes were required.

**Not verified:**
- No manual/browser run of the built app was performed — build success
  only confirms type-correctness and bundling, not that any page actually
  renders correctly or that its API calls succeed against the (currently
  unreachable) backend.
- No frontend test suite was run (none was located as part of this pass).

## 7. Overall fail-loud correctness bar (the key ask)

**Met**, to the extent this sandbox can exercise it: every agent boundary
re-raises a structured `AgentExecutionError` instead of swallowing an
exception or returning fabricated non-mock data, mock mode is unambiguously
labeled at the field level rather than being empty/silent, and the one
remaining downgrade site (`run_test.py`'s own outer `except`, which
discarded the structured error down to a bare string) has been fixed in
this pass. This was verified for the transport-failure case only (no
Gemini credential/egress here) — a live-API schema-violation case was not
exercised.

## 8. Files touched in this verification pass

- `run_test.py` — outer exception handling rewritten to preserve and print
  the structured `AgentExecutionError` fields, and to exit non-zero on
  failure, instead of collapsing the error to a bare string. This is the
  only code change made in this pass; every other module checked (routers,
  `opportunity_agent.py`, `json_exporter.py`, `sync_payload.py`,
  `ggcms_client.py`, frontend) matched its spec/contract already and
  required no edit.
