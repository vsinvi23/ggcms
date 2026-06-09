# Glossary — Domain Language

> Canonical terms used in this codebase. Use exact terms in code and discussion.

---

## Content Domain

| Term | Definition |
|------|-----------|
| **CMS Item** | An Article or Course — unified concept in the cms service |
| **Article** | Standalone written content. Types: standard, byte, etc. |
| **Course** | Structured learning content with Sections → Lessons hierarchy |
| **Section** | A chapter within a Course |
| **Lesson** | A page/unit within a Section; has `published` flag |
| **Content Type** | Admin-configurable label for Article or Course types |
| **Category** | Hierarchical content taxonomy node (parent_id based tree) |
| **Virtual Category** | System-only category (`is_virtual=true`) hidden from users. "geek" is the root. |
| **Geek Category** | The single virtual root — all admin-reviewed content lives under it |
| **Tag** | Flat keyword label (lowercase, globally unique) associated with Categories |
| **Learning Path** | Admin-curated ordered list of Courses (Kind: LEARNING_PLAN or INTERVIEW_PREP) |
| **Slug** | URL-friendly identifier auto-generated from title (indexed, unique) |

---

## Workflow Domain

| Term | Definition |
|------|-----------|
| **CMS Status** | DRAFT → REVIEW → APPROVED → PUBLISHED / REJECTED |
| **Submit** | Author sends content from DRAFT to REVIEW |
| **Approve** | Reviewer advances from REVIEW to APPROVED |
| **Publish** | Admin/editor moves APPROVED to PUBLISHED |
| **Send Back** | Reviewer returns REVIEW to DRAFT with comment |
| **Reject** | Hard rejection — content returned to DRAFT |
| **Reviewer** | User assigned to review a specific content item (`reviewer_id`) |
| **Reviewer Group** | Group linked to a Category to route review assignments |
| **Required Approvals** | Number of distinct reviewers needed before APPROVED state (per category) |
| **Content Review** | Row in `content_reviews` table — one per approving reviewer |
| **Has Pending Draft** | `has_pending_draft=true` — published version exists while new version is under review |
| **Snapshot** | Saved state of title/description/body at publish time (for diff comparison) |
| **Review Baseline** | Snapshot saved at SendBack time — reviewer can diff what changed in re-submission |
| **Chapters Snapshot** | JSONB of section/lesson hierarchy saved at publish time for Courses |

---

## User Domain

| Term | Definition |
|------|-----------|
| **User** | A platform account (email + password or OAuth) |
| **Group** | Permission container — users belong to groups |
| **Role** | Preset group configuration (admin, editor, moderator, viewer) |
| **GroupPermissions** | JSONB object on Group defining per-resource access flags |
| **Admin** | User whose role === 'admin' OR member of ADMIN_GROUP_NAME group |
| **Task** | Work queue item linking a User to a CMS item |
| **Task Ownership Type** | OWNED (creator), REVIEWING (assigned reviewer), CONTRIBUTED (collaborator) |

---

## Learning Domain

| Term | Definition |
|------|-----------|
| **Enrollment** | User ↔ Course link with status (active/completed/dropped) and progress |
| **Completed Lessons** | M2M junction between Enrollment and Lesson |
| **Progress** | Fraction of lessons completed (computed client-side) |
| **User Profile** | Learner persona: experience level, role type, tag interests, category preferences |
| **Experience Level** | beginner / intermediate / advanced / expert |
| **Role Type** | learner / developer / architect / manager / researcher / executive |
| **Is Default Profile** | The currently active profile for recommendations (one per user) |
| **Recommendation Score** | +4 preferred category, +3 matching tag, -10 already enrolled |
| **Visitor Profile** | Anonymous profile stored in localStorage (cms_visitor_profile) |

---

## Engagement Domain

| Term | Definition |
|------|-----------|
| **Reaction** | Like or dislike on a content item (stored in MongoDB) |
| **Note** | User's private text note on a content item (one per user per item) |
| **Favourite** | Bookmarked content item |
| **Highlight** | Text selection within content with color annotation |

---

## Infrastructure Domain

| Term | Definition |
|------|-----------|
| **Write DB** | Primary PostgreSQL instance — all mutations go here |
| **Read DB** | Read-replica PostgreSQL (falls back to write if DB_READ_URL not set) |
| **configsyncer** | Agent component polling policy-service — not in this repo |
| **Audit Shipper** | Background agent that ships audit events — not in this repo |
| **singleflight** | Go pattern to coalesce concurrent identical requests — planned for Redis layer |
| **PgBouncer** | Connection pooler for PostgreSQL — planned for scale |

---

## Frontend Domain

| Term | Definition |
|------|-----------|
| **Service** | Module in `src/api/services/` making axios calls |
| **Hook** | React Query wrapper in `src/api/hooks/` |
| **staleTime** | How long React Query considers cached data fresh |
| **Query Key** | Array identifier for React Query cache entries |
| **Invalidation** | Clearing React Query cache to force refetch after mutation |
| **Protected Route** | Route wrapped in `<ProtectedRoute>` HOC — redirects to /auth if unauthenticated |
| **Auth Context** | `contexts/AuthContext.tsx` — source of truth for authentication state |
| **Feature Flag** | AppSetting key-value — referenced via `useFeatureFlags()` hook |
