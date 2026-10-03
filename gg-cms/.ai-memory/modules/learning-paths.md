# Learning Paths — Module Notes

**Updated:** 2026-10-03 · **Load when:** touching learning paths, course player, listing pages.

## Data model
- `learning_paths` (id, kind, title, description, slug UNIQUE, created_by_id) — kinds seen: `STRUCTURED_PATH`, `SECURITY_TRACK`, `INTERVIEW_PREP`. No status/soft-delete: a path is public once created.
- `learning_path_courses` (learning_path_id, course_id, sort_order). **Migration 049** adds `fk_lpc_course` (ON DELETE CASCADE) and `UNIQUE (learning_path_id, course_id)` after removing orphan/duplicate rows. Entity: `LearningPathCourse.Course *Course`.
- Migration 048 links seeded `system-design` / `api-security` paths to existing courses (047 referenced slugs that were never seeded). Idempotent, only fills empty/short paths.

## API (public, no auth)
- `GET /api/learning-paths`, `GET /api/learning-paths/:idOrSlug` → `courses[]` now carries `courseId, sortOrder, title, slug, description, status, categoryName`.
- **Only PUBLISHED courses expose metadata**; drafts return id/status only. When a course `HasPendingDraft`, the published title/description is returned (never the draft). Repo preloads `Courses.Course.Category`.
- Admin writes: `POST/PUT/DELETE /learning-paths`, `PUT /learning-paths/:id/courses` (AdminOnly).

## Frontend flow
- `/learn/:path` → `LearningPathPage`: one page (intro, curriculum with per-module lessons via `useQueries`, Start/Continue, right rail: ≤3 related + ≤3 recently viewed).
- Start links: `<course-url>?path=<pathSlug>&learn=true[&lesson=<id>]`. `CourseViewPage` reads `?path=`; with it the header shows Back + course name and the left rail is `PathCourseNavigator` (all path modules, current expanded). Without `?path=` it is a normal course.
- Auto-launch: opens `lesson` param, else the saved lesson (`ggcms_course_state_<id>`), else first lesson.
- State (`lib/contentStateStore.ts`): `ggcms_path_resume_states`, `ggcms_recent_paths`, `ggcms_completed_lessons_<courseId>` (guests), course progress states.
- Exit prompt only when leaving the course/path context (not between modules of the same path, never for `/article/`). Link handling parses URLs (http(s), same-origin only).
- "Mark as Complete" always shown: guests saved locally; signed-in users are auto-enrolled then progress is synced. Enrolment also happens from "Start" actions.

## Rules the team should keep
- **No mock/fallback numbers in the UI** — hide a value when the API has none (curated `data/learningPathData.ts` was deleted).
- Related/recommended blocks must come from live data; hide the block when empty.
- Escape any user text interpolated into HTML (see `ContentDiffOverlay.computeWordDiff`).

## Known gaps (not done)
- Admin-created paths get an empty slug (second one → 500); `Update` ignores slug.
- `err.Error()` returned to clients on public handlers; `GetAll` unpaginated.
- No path-level enrolment/progress (derived client-side); no popularity signal for "most preferred".
- Level / estimated hours / skills are not stored on paths (hidden when absent).
