---
name: content-authoring
description: Create, review, and update GeekGully content-repository articles, courses, and content packages under content/ (Markdown, JSON, or CSV) that gg-cms will bulk-import via /api/import/preview and /api/import/confirm. Use whenever the user asks to write a new article or course for content/, review or fix an existing content/ file for import-readiness, run the multi-agent validator, package content for import, or reconcile content/ against gg-cms's actual category/type/lesson schema. Grounded in the real Go importer and DB seed data, not the repo's own (partially stale) README/blueprint docs.
---

# GeekGully Content Authoring — `content/`

This skill governs authoring and reviewing files in `content/` (the GeekGully Content
Repository) so they actually import cleanly into `gg-cms` via the bulk-import pipeline
(`POST /api/import/preview` → `POST /api/import/confirm`). It intentionally does **not**
inherit the teaching-philosophy rules of the unrelated `technical-content-authoring` skill —
that skill governs a different, hand-curated Serenya knowledge base. This one is about
producing content that is (a) technically excellent and (b) mechanically importable by the
actual Go backend.

## Ground truth over documentation

`content/README.md` and `content/GEEKGULLY_CONTENT_CATALOG_AND_BACKEND_INTEGRATION_BLUEPRINT.md`
are **stale in places** — most importantly their category-slug mapping table uses long-form
slugs (`identity-and-access`, `backend-and-apis`, `containers-and-orchestration`) that do not
match what's actually seeded in the database. `content/scripts/multiagent_content_runner.py`
(the local `--validate`/`--package` tool) is also more permissive than the real backend — it
whitelists both long-form and short-form category slugs and never enforces its own declared
`VALID_ARTICLE_TYPES`, so a green checkmark from it does **not** guarantee the file will import
cleanly.

The actual authority for what gets parsed and stored is:
- `gg-cms/backend/go-cms/internal/application/importer/parser.go` — what fields are read from MD/JSON/CSV/HTML/ZIP.
- `gg-cms/backend/go-cms/internal/interfaces/http/handler/import_handler.go` — how `categorySlug` gets fuzzy-matched to a DB category, and how course sections/lessons get created.
- `gg-cms/backend/go-cms/migrations/postgres/033_seed_default_categories.sql` and `040_seed_subcategories_and_tags.sql` — the real, short-form category slugs.
- `internal/domain/entity/{cms,lesson,learning_path}.go` — the real enums/columns.

When this skill's guidance conflicts with `content/README.md` or the blueprint doc, **this
skill (and the Go source it's grounded in) wins**. Flag the doc drift to the user rather than
silently propagating it.

## Content shapes gg-cms actually understands

`importer.Parse` dispatches purely on file extension: `.md`/`.markdown`, `.json`, `.csv`,
`.html`/`.htm`, `.zip` (a zip of any of the above, with security limits — see below). There is
no learning-path shape anywhere in this pipeline.

### 1. Article or Course — Markdown (`.md`)

```markdown
---
title: "OAuth 2.0 & OpenID Connect (OIDC) Implementation Architecture"
description: "A practical security engineering guide to ..."
type: "ARTICLE"
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "oauth-2"
  - "openid-connect"
  - "jwt"
---

# OAuth 2.0 & OpenID Connect (OIDC) Implementation Architecture

...body...
```

Frontmatter parsing (`parseFrontmatter`) is a **hand-rolled line-by-line parser**, not real
YAML — one `key: value` per line, `key:` with nothing after it starts a `- item` list (used for
`tags`). Recognized keys (case-sensitive except where noted): `title`, `description`, `type`
(uppercased; must resolve to `ARTICLE`/`COURSE`/`VIDEO` or it silently falls back to
`ARTICLE`), `category`/`categorySlug`/`category_slug`, `articleType`/`article_type`,
`courseType`/`course_type`, `status`/`state` (uppercased), `tags` (comma-separated on one line,
or a following `- "tag"` list). Anything else in the frontmatter block is silently ignored — do
not invent extra fields expecting them to be used (no `prerequisites`, `related`, `next`,
`level`, `durationMinutes`, etc. are parsed by the importer, even though some existing files
include them for human/documentation purposes only).

If `title` is omitted, the parser falls back to the first `# Heading` in the body, then to the
filename. Don't rely on this — always set `title` explicitly.

**Course markdown** (`type: "COURSE"`) uses a specific heading convention
(`parseMarkdownCourseStructure`) to build sections/lessons out of the body:

```markdown
## Section: Section 1: Fundamentals

Any text here becomes a lesson's body only once a lesson heading appears; text before the
first lesson heading inside a section is currently dropped from that section's lesson bodies.

### Lesson: Lesson 1.1: What Problem Are We Solving?

Lesson content (markdown, including fenced code blocks) goes here, until the next
`### Lesson:` or `## Section:` heading.
```

- The literal strings `## Section:` and `### Lesson:` are the delimiters — not just any H2/H3.
- Content before the first `## Section:` heading becomes the course's flat `body` (overview).
- A `### Lesson:` with no enclosing `## Section:` gets an auto-generated section.
- Lesson `type` for Markdown courses is always `"text"` — Markdown has no way to express
  `quiz`/`video`/`assignment` lessons; use JSON course files when you need non-text lesson
  types.

### 2. Article or Course — JSON (`.json`)

Either a single object or an array of objects, each shaped like `jsonImportItem`:

```json
{
  "type": "COURSE",
  "title": "Implementing Secure OAuth 2.0 & OpenID Connect (OIDC) in Go",
  "description": "...",
  "categorySlug": "identity-access",
  "courseType": "TRACK",
  "tags": ["oauth-2", "openid-connect", "jwt"],
  "body": "Course overview shown above the section list.",
  "sections": [
    {
      "title": "Section 1: OAuth 2.0 & OpenID Connect Fundamentals",
      "order": 0,
      "lessons": [
        { "title": "Lesson 1.1: ...", "type": "text", "duration": 20, "order": 0, "body": "..." },
        { "title": "Lesson 1.2: Quiz", "type": "quiz", "duration": 15, "order": 1, "body": "..." }
      ]
    }
  ]
}
```

`sections`/`lessons` are only read when top-level `type` is `"COURSE"` — for `"ARTICLE"` JSON,
omit them (or they're ignored). Only these top-level keys are read:
`type`, `title`, `description`, `body`, `categorySlug`, `articleType`, `courseType`, `status`,
`tags`, `sections[].{title,order,lessons[]}`, `lessons[].{title,type,duration,order,body}`.
Anything else (`pathId`, `kind`, `targetRole`, `estimatedHours`, `level`, `prerequisites`,
`competencies`, `sequencedCourses`, etc.) is **silently ignored by the importer** — see the
Learning Paths section below.

### 3. Article or Course — CSV (`.csv`)

One header row, one row per item, `type` defaults to `ARTICLE`. Recognized headers
(case-insensitive): `type`, `title`, `description`, `body`, `categoryslug`/`category`,
`articletype`/`article_type`, `coursetype`/`course_type`, `status`/`state`, `tags` (this one
column is **semicolon-separated**, not comma — unlike Markdown/JSON tags). CSV has no way to
express course sections/lessons — use it only for flat articles/simple course shells.

### 4. Article — HTML (`.html`/`.htm`)

Best-effort: reads `<title>`, `<meta name="description">`, and a small set of meta-style
key/value tags (`applyMetaKV` recognizes lowercase `category`/`categoryslug`,
`articletype`, `coursetype`, `keywords`/`tags`, etc.) — only fills a field if it wasn't already
set. Not used anywhere in the current `content/` tree; prefer Markdown or JSON for new content.

### 5. ZIP (`.zip`)

A zip of any of the above file types, for bulk upload. Security limits enforced by the
importer — respect these when packaging:
- Max 500 entries per zip.
- Max 10MB per individual file.
- Max 50MB total uncompressed.
- Max 100:1 decompression ratio.
- No nested zips, no path traversal (`..`), `__MACOSX__`/dotfiles are skipped.

## The category slug trap — the single most important rule

**`categorySlug` in frontmatter must be the database's short-form slug, not the long-form
folder name on disk.** The importer's fuzzy matcher (`import_handler.go` `Preview()`) lowercases
and strips non-alphanumeric characters from both the parsed slug and every DB category's
slug/name before comparing. That normalization removes hyphens but does **not** insert or
remove the word "and" — so `identity-and-access` normalizes to `identityandaccess`, which will
never equal the DB's `identity-access` → `identityaccess`. A long-form slug simply fails to
match and the item imports with `categoryId: null`, requiring manual admin category assignment
at confirm time.

This is a real, confirmed bug in one existing content file today:
`content/courses/cybersecurity/oauth2-oidc-implementation-guide.json` uses
`"categorySlug": "identity-and-access"` — it will not auto-resolve. Flag this if you touch that
file; fixing it is a one-line change to `"identity-access"`.

Folder names on disk (`content/cybersecurity/identity-and-access/...`) are long-form and that's
fine — they're just filesystem organization, never read by the importer. **Only the
`categorySlug` frontmatter/JSON value matters, and it must match the table below.**

### Verified DB category slugs (short-form — use these in `categorySlug`)

| Domain slug | Subcategory slugs |
|---|---|
| `software-engineering` | `programming-languages`, `backend-apis`, `software-design`, `system-design-architecture`, `frontend-architecture`, `api-engineering-protocols` |
| `cloud-infrastructure` | `cloud-platforms`, `containers-orchestration`, `infrastructure-as-code`, `observability-monitoring`, `site-reliability-engineering`, `serverless-edge` |
| `cybersecurity` | `identity-access`, `pki-cryptography`, `appsec-threats`, `cloud-security-compliance`, `devsecops-supply-chain`, `ai-llm-security` |
| `data` | `databases`, `data-engineering`, `vector-databases-search`, `realtime-event-streaming` |
| `ai-machine-learning` | `machine-learning-foundations`, `generative-ai`, `llm-engineering-rag`, `autonomous-ai-agents` |

Always use a **subcategory** slug in content (`identity-access`, `backend-apis`, etc.), not a
top-level domain slug — the domain nodes exist mainly for navigation. If you're not sure a slug
is current, grep the migrations directory (`migrations/postgres/033_seed_default_categories.sql`,
`040_seed_subcategories_and_tags.sql`) rather than trusting `content/README.md`'s table.

## `type`, `articleType`, `courseType`, lesson `type` — what's actually enforced

- `articles.article_type` and `courses.course_type` are plain `VARCHAR` columns with **no DB
  CHECK constraint** — any string is technically storable. `content_types` (kind='article'/
  'course') is a UI label/filter lookup table only, not a validation source.
- Confirmed-safe, UI-labeled `articleType` values: `BLOG`, `TUTORIAL`, `GUIDE`, `NEWS`,
  `CASE_STUDY`, `HOW_TO`, `DEEP_DIVE`, `CHEAT_SHEET`, `LAB`, `PROJECT`, `REFERENCE`.
- Confirmed-safe, UI-labeled `courseType` values: `STANDARD`, `BYTE`, `LEARNING_PLAN`, `CAPSULE`.
- `articleType: "INTERVIEW_PREP"` and `courseType: "TRACK"` are used extensively across real
  `content/` files today and import/store fine (free-text column), but **neither value exists in
  the `content_types` lookup table** — so content using them won't get a matching filter
  label/icon in the UI until someone adds the row. This is a known, accepted gap in current
  content, not something to "fix" by silently renaming it — but don't introduce a third
  unlabeled value; reuse `INTERVIEW_PREP`/`TRACK` if that's genuinely the shape of the content.
- Lesson `type` (`video`/`text`/`quiz`/`assignment` per `entity.LessonType`) is also
  **unchecked at import time** — `createCourseStructure` casts any string straight to
  `LessonType`, defaulting to `text` only when empty. Real content uses `"interview_prep"` as a
  lesson type; it will store as-is but isn't a real enum value and has no special rendering
  guaranteed. Prefer the four real values (`video`, `text`, `quiz`, `assignment`) for new lessons
  unless you have a specific reason to match existing `interview_prep` lessons for consistency.

## Learning paths (`content/learning-paths/*.json`) are not import targets

These files (`pathId`, `kind` as a human-readable role name, `targetRole`, `estimatedHours`,
`level`, `prerequisites[]`, `sequencedCourses[]`, `competencies[]`) do **not** correspond to
anything the bulk-import pipeline understands. `importer.Parse`/`jsonImportItem` has no handling
for this shape, and the real `entity.LearningPath` (`internal/domain/entity/learning_path.go`)
plus its service/handler (`internal/application/learningpath/service.go`,
`interfaces/http/handler/learning_path_handler.go`) only support a much simpler shape: `Kind`
(free text, e.g. intended as `"LEARNING_PLAN"`/`"INTERVIEW_PREP"` per a code comment, but not
enforced), `Title`, `Description`, `CreatedByID`, and an ordered list of
`{courseId, sortOrder}` set via `PUT /api/learning-paths/:id/courses` — nothing like
`targetRole`/`estimatedHours`/`competencies`/rich `sequencedCourses`.

Treat `content/learning-paths/*.json` as **planning/roadmap artifacts for humans**, not as
content bound for `/api/import/*`. If asked to create a new one, match the existing rich schema
for consistency with its siblings, but do not claim or imply it will be machine-ingested as-is.
If real learning-path ingestion is needed, that's a backend feature gap to raise with the user,
not something this skill's content format can paper over.

## Validating and packaging

`content/scripts/multiagent_content_runner.py --validate` is useful as a first-pass syntax/
completeness check (frontmatter presence, `title`/`categorySlug`/body non-empty, JSON
well-formedness, section/lesson title presence) but has known blind spots — don't treat a ✅ as
proof of correct backend import:
- Its `VALID_CATEGORY_SLUGS` set explicitly whitelists **both** long-form and short-form slugs,
  so it will pass a file whose `categorySlug` the real backend cannot auto-match (e.g. the
  `identity-and-access` bug above).
- It declares `VALID_ARTICLE_TYPES` but never actually checks `articleType` against it in either
  `validate_markdown_file` or `validate_json_file` — any `articleType` value passes.
- Its Section:/Lesson: heading checks for Markdown courses are warnings only, not errors.

After `--validate` passes, cross-check `categorySlug` against the verified table above by hand
(or ask this skill to do it) before treating a file as import-ready. `--package` zips
everything under `content/` (excluding `README.md`, the blueprint doc, `import_manifest.json`)
into `content/dist/ggcms_content_pack.zip` for upload to `/dashboard/import` or
`/api/import/preview`.

## Workflow

**CREATE (article)**: pick the correct short-form `categorySlug` from the table above → choose
`articleType` from the confirmed-safe list (or `INTERVIEW_PREP` if it's genuinely interview-prep
content, matching existing convention) → write frontmatter → write the body as real Markdown
(headings, fenced code blocks with language tags, diagrams as `text`/mermaid fences as already
used in this repo) → place the file in the long-form folder matching its subcategory
(`content/<domain>/<subcategory>/slug.md`) for human organization → run
`multiagent_content_runner.py --validate` → manually verify `categorySlug` is short-form.

**CREATE (course)**: same category/type care, plus decide Markdown (`## Section:`/`### Lesson:`
headings, lesson type always `text`) vs JSON (`sections[].lessons[]`, real per-lesson `type`).
Use JSON when you need quizzes or other non-text lessons.

**REVIEW**: check, in order — (1) frontmatter/JSON parses under the real field set above, no
invented fields relied upon; (2) `categorySlug` is a short-form DB slug from the verified table,
not a long-form folder-style slug; (3) `type`/`articleType`/`courseType`/lesson `type` are
sensible even though unenforced; (4) for Markdown courses, `## Section:`/`### Lesson:` headings
are used correctly; (5) technical accuracy and quality of the actual content (code correctness,
security accuracy, no hallucinated APIs/CVEs/behavior) — apply ordinary technical-writing rigor
here, this skill doesn't relax that bar, it just doesn't dictate a specific pedagogical template.
Report findings; only rewrite if asked.

**UPDATE**: preserve correct technical content; only change frontmatter/structure to fix real
import-readiness problems (category slug drift, malformed section/lesson headings) or genuine
content corrections.

## Quality bar for the content itself

This skill governs *format and import-readiness*; it doesn't replace ordinary technical-writing
judgment. Content should still be accurate, avoid hallucinated specifics (invented CVEs,
benchmarks, API behavior), use realistic code with correct syntax for its stated language, and
explain *why* a mechanism works the way it does, not just describe it — consistent with the bar
already visible in the stronger existing files (e.g. `oauth2-oidc-implementation-guide.md`,
`mastering-go-microservices-course.md`).
