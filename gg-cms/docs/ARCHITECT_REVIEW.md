# Architect Review: GeekGully CMS (gg-cms)

Scope: dashboard tabs, API/DB alignment for Course, Article, Learning Path, Interview Prep and Practice, content fetch/update, and readiness for ~10K hits.
Date: 2026-10-05. Branch: `release` (7889962a). Method: static read-only review by four parallel tracks (DB, backend API, frontend mapping, scalability). Nothing was load-tested or run against a database.

Legend: **[V]** verified by a direct read of the code. **[A]** reported by a review agent, not re-read; confirm before acting.

Companion document: [INTERACTIVE_METADATA_REVIEW.md](INTERACTIVE_METADATA_REVIEW.md) (Interview Prep and Practice deep dive plus feedback log).

**Verdict:** dashboard tabs are mostly wired to real APIs. The data model, security and capacity are not ready for 10K concurrent users. Interview Prep and Practice are the weakest sections: their data cannot currently be saved from the editor.

---

## 1. Section-by-section status

| Section | Storage | Fetch / open | Save / update | Verdict |
|---|---|---|---|---|
| Course | `courses` + `sections` + `lessons` + `attachments` | Works; child sections duplicated at top level, nested lessons missing [A] | Works, but cannot clear fields, no transaction [A] | Usable with bugs |
| Article | `articles` | Works | Same update semantics as course [A] | Usable with bugs |
| Learning Path | `learning_paths` + `learning_path_courses` | Works; list unbounded [A] | Slug never set on create; no kind validation [A] | Usable with bugs |
| Interview Prep | `courses.course_type='ASSESSMENT'` + JSON `assessmentType=INTERVIEW` (no own tables); a second model, `learning_paths.kind='INTERVIEW_PREP'`, also exists | Questions regex-parsed from body text, not from metadata [V] | **Metadata cannot be saved from the editor [V]** | Weak |
| Practice | `courses.course_type='ASSESSMENT'` + JSON `assessmentType=PRACTICE` | Reads `questions[]`; falls back to generated questions if absent [V] | **Metadata cannot be saved from the editor [V]**; answers not persisted [A] | Weak |

Seed data note: seeded rows in the migration are **configuration** (taxonomy and reference data), not mock data, and are kept as is. The local deployment retains existing volumes.

## 2. interactiveMetadata perspective (Interview Prep and Practice)

Full detail in the companion document. Summary of what drives the architecture:

- **M1 (Critical) [V]:** `AssessmentCreator.tsx:181,183` sends `interactiveMetadata`, but `CreateCMSRequest` / `UpdateCMSRequest` in `dto/cms_dto.go` have no such field (only the response struct does, line 21). Gin drops it silently, so saves report success and store nothing. The bulk importer is the only working writer today.
- **No contract exists.** There is no JSON schema, no validation, and the `assessmentType` discriminator is a key inside the JSON. A missing or misspelled value makes an item vanish from both hubs with no error (filters return false; parse errors are swallowed).
- **Filler content is mixed with real content [V]:** generated questions (`generateQuestionsForSlug`), hard-coded placeholder options in `CourseViewPage`, and invented `round`, `difficulty` and `estimatedHours` in the Interview hub. This makes content review unreliable.
- **Two competing models for Interview Prep** (`ASSESSMENT` course vs `INTERVIEW_PREP` learning path). Pick one.
- **No attempts, scores or progress tables.** Practice answers live in React state only.
- **Answer keys ship to the browser** for every published assessment, and anonymous `?preview=true` can read unpublished ones [V for preview flag; A for impact].
- **Architectural decision required:** keep `interactive_metadata` as a validated, versioned document (cheap, flexible), or promote to tables (`assessment_questions`, `assessment_attempts`) once content volume and scoring requirements are known. Whichever is chosen, add server-side validation and an expression index on `(interactive_metadata->>'assessmentType')`, and filter in SQL rather than in the browser.

## 3. Dashboard tabs vs APIs

Every management tab (Articles, Courses, Assessments, Learning Paths, Admin Overview, MyLearning, view pages) has a matching backend route. Defects:

| Defect | Evidence |
|---|---|
| Dashboard reads `.data` / `.meta.pagination.total` but the service returns `{items, total}`; passes `pageSize` which is ignored. Featured articles and totals are always empty/0. | [V] `Dashboard.tsx:27,35,122,251,256`; `publicCmsService.ts` |
| `topicService.resolveTopic` calls `/topics/resolve`, no backend route. Dead code. | [V] `topicService.ts:67`; no match in `router.go` |
| Analytics counts client-side from the first 200 users; real `/analytics/dashboard` endpoint unused. | [A] `Analytics.tsx:21` |
| Explore, Practice, Interview, Technology, Topic pages fetch 50-200 items and filter in the browser; content beyond the cap never appears. | [A] |
| Saving content does not invalidate the `['public-cms']` cache; `useEnroll` does not refresh MyLearning. | [A] `useCms.ts`, `useEnrollments.ts` |
| Errors are shown as empty lists on most public pages. | [A] |
| Mock slices (`mockUsers`, 129 fake users) remain in the store; unused status unconfirmed. | [A] `store/slices/*` |
| The separate `web/` app is a static marketing site and calls no API. | [A] |

## 4. Data model and DB integrity

**Critical**
- **C1 [V]:** `001_initial_schema_reset.sql:1-3` terminates connections and runs `DROP SCHEMA public CASCADE`. The only guard is a `schema_migrations` row written after the file runs, with no transaction or advisory lock (`migrations.go:69-85`). A restore, a fresh database or a failed first run wipes the database on next boot.
- **C2 [A]:** the runner tracks files by name only and everything is in one file, so later edits to 001 never reach existing databases.
- **C3 [A]:** content seeds select an admin user that does not exist until bootstrap runs, and hard-code category ids.

**High [A]**
- Soft delete does not cascade: sections, lessons, enrollments and learning-path links survive a deleted course.
- Unique constraints are not partial (`WHERE deleted_at IS NULL`): re-enroll, email and slug reuse blocked after soft delete.
- Article, course and learning-path slugs are not UNIQUE; uniqueness is checked app-side on the read replica (racy).
- No CHECK constraints on `status`, `course_type`, `article_type`, `kind`, `lessons.type`; seeds use values outside the code enums (`MODULE`, `STRUCTURED_PATH`).
- Category has two sources of truth (`category_id` and `content_categories`).
- Polymorphic references (`content_id` + `content_type`) have no FK or cleanup; casing inconsistent. Comments, notes, favourites, reactions and analytics live in Mongo with no link to Postgres.

**Indexes [A]:** no `pg_trgm`/GIN; no published-list partial index (the `status OR has_pending_draft` filter defeats existing indexes); no `courses.published_at` index; no index on `learning_path_courses.course_id` or `enrollment_lessons.lesson_id`; reviewer-queue query unindexed.

## 5. Fetch and update correctness (backend)

- **H2 [A]:** updates cannot clear fields (nil = no change); removing the last attachment is impossible and removed attachment rows linger; `Save()` rewrites preloaded associations from stale data.
- **H3 [A]:** no transactions around publish, update-published, submit, approve, import confirm or factory ingest; errors discarded with `_ =`. Partial failures leave orphan courses or stale pending drafts; retries duplicate content.
- **H7 [A]:** enrollment partial update resets progress to 0; progress and completed lessons unvalidated; enroll does not check course exists/is published; no unique index in the entity.
- **Importer [A]:** overwrite appends all sections again every time; tags and slug not persisted; Markdown/HTML bodies stored as `blocks`; factory ingest reads categories with `GetAll(ctx, 1, 100)` against a 0-indexed repository, skipping the first 100 [V line 149]; no idempotency key.
- By-category public endpoints filter in memory after paging, so totals and pages are wrong [A].
- A GET writes to the database (`ensureCourseBaseline`) [A].

## 6. Security gaps affecting content access

- **Draft leak [V]:** `?preview=true` is read straight from the query string on public article, course and cms endpoints with no auth check (`public_handler.go:60,149,248`).
- **Section create has no ownership check [V]** (`section_handler.go:73`; Update and Delete have it). Lesson create looks the same [A].
- **Public `/api/sections` [A]** exposes sections and nested lesson content of any course, drafts included.
- **Workflow [A]:** any authenticated user can submit, claim or reassign anyone's review; an assigned reviewer can publish straight from REVIEW or DRAFT; tag create/delete is not admin-only; `GET /cms` lists all users' drafts to any logged-in user.

## 7. Capacity for 10K hits

**Not ready as deployed.** Estimate (needs a load test): roughly 1.5K-3K concurrent users before errors; a 10K burst cascades into 5xx.

| Bottleneck | Evidence |
|---|---|
| Production Cloud Run min 0 / max 3 / concurrency 80; Postgres on one VM with `max_connections=20` | [V] `release/gcp/cloudbuild.yaml:59-61`, `docker-compose.vm-dbs.yml:38` |
| No pool limits (`SetMaxOpenConns` etc.) and no `SetTrustedProxies` anywhere | [V] grep over backend |
| No response caching or CDN; assets and SPA served from Go without long-lived cache headers | [A] |
| Per-view goroutine with synchronous Mongo insert using the request context (often cancelled, inserts lost); views never attributed to users | [A] `public_handler.go:353-361` |
| Search is a full-table `ILIKE` over article bodies and lesson content | [A] |
| In-memory per-instance rate limiter behind one global mutex; client IP spoofable or collapsed | [A] `rate_limit.go` |
| GraphQL has no depth, complexity, timeout or body limits | [A] |
| `/api/health` does not check the DB; migrations and admin seed run on every cold start; local-disk uploads on stateless Cloud Run unconfirmed | [A] |

Good foundations: stateless JWT, read/write DB split, async audit logging, SPA can move to a CDN.

## 8. Remediation plan

**Before anything else (days)**
1. Remove `DROP SCHEMA` from 001, freeze it, add numbered migrations with transaction, checksum and advisory lock.
2. Gate `?preview=true` behind auth plus owner/admin/reviewer; check publish status on `/sections` and `/lessons`; add ownership checks to section and lesson create.
3. **Add `interactiveMetadata` to the create and update DTOs and handler mapping (M1).** Add server-side validation with clear 400 errors.
4. Set pool limits (about 8 per pool, plus idle and lifetime), call `SetTrustedProxies`.
5. Fix the Dashboard response shape and cache invalidation; wrap publish, update and import in transactions and stop swallowing errors.

**Scale quick wins (1-2 weeks)**
6. `Cache-Control` and ETag on public GETs, CDN in front, immutable caching for `/assets`.
7. Short singleflight cache on list endpoints; buffered, batched view-tracking writer with a background context.
8. Trigram/tsvector search indexes; the missing partial and composite indexes; GraphQL limits.
9. Cloud Run min 2+, max 10+; migrations as a separate job; `/ready` that checks the DB.

**Interview Prep and Practice (design)**
10. Remove generated/placeholder fallbacks; show explicit empty states.
11. Define and version a JSON schema for `interactiveMetadata`; move Interview questions into `questions[]` and stop regex-parsing the body.
12. Choose one model for Interview Prep (assessment course vs learning path kind).
13. Decide on tables for questions, attempts and scores before adding scoring or progress.

**Structural (weeks)**
14. Managed Postgres (HA, replica, PgBouncer) and managed Mongo; Redis for shared cache and distributed rate limiting.
15. Move SPA and media to GCS/CDN.
16. Partial unique indexes, cascade or filter soft deletes, CHECK constraints on type fields, metrics and tracing.
17. k6 load test against the target topology to size instances. With a CDN absorbing about 90% of reads, 10K concurrent users should need about 100-200 origin requests per second.

## 9. Open items and caveats

- This review was static. The claims marked [A] should be confirmed before fixes are scheduled.
- Response field-case for individual DTOs, `PublicCourseView` internals, `ArticleCreator` / `CourseCreator` save flows, and the upload-to-storage wiring were not verified.
- Capacity numbers are estimates.
