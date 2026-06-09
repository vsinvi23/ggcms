# Memory Bank — testcms (GeekGully CMS)

> Always load this file at session start. Single source of truth for project intelligence.

---

## Product

**GeekGully CMS** — Multi-role content management platform with editorial workflows, course management, and personalized learning. Built by SerenyaX.

**Primary Users:** Admins, Editors, Reviewers, Viewers, Learners  
**Stage:** Active development, pre-production

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | Go 1.25 |
| Web framework | Gin v1.9 |
| ORM | GORM v1.25 + pgx/v5 driver |
| Primary DB | PostgreSQL (read/write split via DB_WRITE_URL / DB_READ_URL) |
| Document DB | MongoDB (findings, audit, engagement, comments) |
| Cache | Redis (rate limiting, token cache, URL category TTL) — declared, not fully wired |
| Message queue | Kafka + Zookeeper |
| Frontend | React 19 + TypeScript + Vite |
| UI library | Shadcn/ui (Radix + Tailwind CSS) |
| Server state | TanStack React Query v5 |
| Client state | Redux Toolkit |
| Auth | JWT (HS256) — HttpOnly cookie preferred, Bearer fallback |
| GraphQL | graphql-go (public read-only content browsing) |
| Container | Docker + docker-compose |

---

## Repository Layout

```
testcms/
  backend/go-cms/          Go backend (Clean Architecture)
    cmd/server/main.go     Entry point — migrations → seed → router → listen
    migrations/postgres/   025 idempotent SQL files (IF NOT EXISTS)
    internal/
      domain/entity/       GORM structs + MongoDB bson structs
      domain/repository/   Interface contracts only
      application/*/       Business logic services
      infrastructure/persistence/postgres/  GORM implementations
      infrastructure/persistence/mongodb/   Mongo implementations
      interfaces/http/
        router.go          Gin route wiring + Services struct
        handler/           HTTP handlers
        dto/               Request/response DTOs
        middleware/         Auth, CORS, rate-limit, audit
    pkg/
      config/    Viper config loader
      database/  PG + Mongo connection factories
      jwt/       Manager (sign/validate)
      logger/    zap logger
      pagination/ Shared paging helpers
      response/  Standard JSON response helpers

  frontend/react-ui/       React 19 + Vite SPA
    src/
      api/
        client.ts          Axios instance + token management (sessionStorage)
        types.ts           All shared TS interfaces
        services/          Axios call wrappers (*Service.ts)
        hooks/             React Query wrappers (use*.ts)
      pages/               Route-level components (32 pages)
      components/          Reusable UI components (organized by domain)
      contexts/            AuthContext (auth state + visitor profile import)
      lib/                 Utilities (visitorProfile.ts, rolePresets.ts, slug.ts)
      store/               Redux slices
      config/api.ts        Storage keys, base URL constants

  docs/                    Project documentation
  CLAUDE.md                AI assistant project conventions (authoritative)
```

---

## Database Design

### PostgreSQL — Relational/Transactional
25 migrations. Key tables:

| Table | Purpose |
|-------|---------|
| users | Auth + OAuth (google_id, github_id) |
| groups | Permission groups (JSONB permissions column) |
| user_groups | M2M junction |
| categories | Hierarchical (parent_id, is_virtual, required_approvals) |
| category_reviewer_groups | M2M — routes review to specific groups |
| articles | CMS content with versioning snapshot columns |
| courses | CMS content with chapters snapshot (JSONB) |
| sections | Course hierarchy |
| lessons | Section children (published flag) |
| enrollments | User ↔ Course with completed_lessons M2M |
| tasks | Per-user work queue (OWNED/REVIEWING/CONTRIBUTED) |
| tags | Global tag dictionary (lowercase, unique) |
| category_tags | M2M |
| learning_paths | Ordered course lists |
| learning_path_courses | Junction with sort_order |
| content_types | Configurable type labels |
| content_reviews | Multi-reviewer approvals per content |
| workflow_events | Full audit trail of status transitions |
| user_profiles | Learner persona (name, is_default, JSONB tag/cat IDs) |
| app_settings | Key-value configuration store |

### MongoDB — Document/Flexible
| Collection | Purpose |
|-----------|---------|
| analytics_events | Page views, content events, personalization signals |
| audit_logs | System-wide audit trail |
| comments | Nested review comments (embedded replies) |
| reactions | Like/dislike per user per content |
| notes | User private notes on content |
| favourites | Bookmarked content |
| highlights | Text selection + color + optional note |
| workflow_events | Status change events (mirrored from PG) |

---

## Key Entities (Go)

`User`, `Group`, `Category`, `Article`, `Course`, `Section`, `Lesson`, `Enrollment`, `Task`, `Tag`, `LearningPath`, `LearningPathCourse`, `ContentType`, `ContentReview`, `WorkflowEvent`, `Notification`, `AppSetting`, `UserProfile`

MongoDB: `AnalyticsEvent`, `AuditLog`, `ReviewComment`, `Reaction`, `Note`, `Favourite`, `Highlight`

---

## Application Services

| Service | Responsibility |
|---------|---------------|
| auth | Login, register, JWT lifecycle |
| oauth | Google + GitHub OAuth flow |
| user | User CRUD, group membership |
| group | Group CRUD, permissions (JSONB) |
| category | Hierarchical CRUD, virtual root, reviewer routing |
| cms | Article + Course CRUD, review workflow, versioning |
| section / lesson | Course hierarchy |
| enrollment | Course enrollment + lesson completion |
| task | Per-user work queue management |
| tag | Tag CRUD, category-tag association |
| learningpath | Ordered course list CRUD |
| contenttype | Configurable content type labels |
| engagement | Reaction, Note, Favourite, Highlight (MongoDB) |
| notification | User notifications |
| analytics | Event tracking, dashboard stats |
| audit | Audit log list |
| comment | Nested review comments |
| settings | App settings key-value store |
| personalization | User profiles, multi-profile, recommendations |

---

## Content Workflow (Critical Flow)

```
DRAFT → SUBMIT → REVIEW → APPROVE → PUBLISH
                        ↘ SEND_BACK → (back to DRAFT)
                        ↘ REJECT
```

- Multi-reviewer: `content_reviews` table tracks per-reviewer approvals
- `required_approvals` per category (default 1)
- `category_reviewer_groups` routes review to designated groups
- `reviewer_id` on article/course = current assigned reviewer
- `has_pending_draft` = true while new draft is under review with published version live
- Snapshots saved on Publish and SendBack for diff comparison

---

## API Conventions

- Base: `GET|POST|PUT|DELETE /api/{resource}`
- Protected routes: Bearer JWT or HttpOnly `jwt` cookie
- Standard response: `{ success: bool, data: T, message?: string }`
- Paged response: `{ success, items, total, currentPage, pageSize }`
- Strapi-paged (legacy frontend): `{ data: [], meta: { pagination: { page, pageSize, pageCount, total } } }`
- Error codes: 400 BadRequest, 401 Unauthorized, 403 Forbidden, 404 NotFound, 409 Conflict, 500 Internal

---

## Frontend Conventions

- Service pattern: `src/api/services/*Service.ts` → axios calls → return typed data
- Hook pattern: `src/api/hooks/use*.ts` → React Query wrapping service → expose `{data, isLoading, error}`
- Query key convention: `['resource', 'action', ...params]`
- Invalidation: onSuccess → `qc.invalidateQueries({ queryKey: keys.all })`
- Auth: sessionStorage (`authToken`, `auth_user`, `user_groups_cache`) + in-memory token cache
- Visitor profile: localStorage (`cms_visitor_profile`) — auto-imported on login
- Route protection: `<ProtectedRoute>` HOC → redirects to /auth if !isAuthenticated

---

## RBAC

6 built-in roles: `admin`, `editor`, `viewer`, `moderator`, `reviewer`, + custom  
Permissions stored as JSONB on `groups` table.  
Admin check: `user.role === 'admin'` OR group name contains ADMIN_GROUP_NAME  
`GetUserID(c *gin.Context) uint` — extract from JWT in middleware

---

## Personalization Module

### Backend
- `user_profiles` table (migration 025): `name VARCHAR(100)`, `is_default BOOL`, JSONB tag/category arrays
- Partial unique index `idx_user_profiles_one_default` — one active profile per user
- Service methods: `GetProfile`, `UpsertProfile`, `ListProfiles`, `CreateProfile`, `SetActiveProfile`, `GetRecommendations`
- New routes: `GET /api/personalization/profiles`, `POST /api/personalization/profiles`, `PUT /api/personalization/profiles/:id/activate`
- Scoring: +4 preferred category, +3 matching tag, -10 already enrolled

### Frontend
- `src/lib/visitorProfile.ts` — sessionStorage-backed anonymous profile (not localStorage)
- `src/lib/rolePresets.ts` — 6 role preset definitions (learner/developer/architect/manager/researcher/executive)
- `src/lib/sanitize.ts` — native HTML sanitizer (XSS protection for dangerouslySetInnerHTML)
- `src/lib/errors.ts` — `toUserMessage()` maps HTTP status codes to safe user-facing strings
- Components: `FloatingPersonalizationButton` (fixed bottom-right, all layouts), `HomePersonalizationWidget` (3 render modes), `ProfileSwitcher` (multi-profile dropdown), `VisitorImportDialog`, `OnboardingWizard` (step 0 = presets)
- `Header.tsx` — Sparkles button near avatar opens wizard sheet; pulsing dot when incomplete
- `AuthContext.tsx` — `importVisitorProfile()` auto-imports sessionStorage profile on login; `visitorProfileImported` + `clearVisitorImportFlag` exposed on context
- Groups kept in memory only (not sessionStorage) to prevent XSS reads of permission data

---

## Known Gaps / Technical Debt

| Area | Issue |
|------|-------|
| Testing | No unit tests for services; minimal integration coverage |
| Redis | Declared in stack but not wired for caching |
| Rate limiting | In-memory counters — not pod-safe |
| CORS | `AllowAllOrigins: true` — must restrict before production |
| Pagination | OFFSET/LIMIT — needs cursor for 1M-user scale |
| Category tree | No pagination on FindTree |
| N+1 risk | Task → CMS lookups in list endpoints |
| IBAN validator | Code exists, not wired to regex pattern |
| Cloud storage | Config fields only, no SDK calls |
| Database scanner | GORM wired, no scan loop |
| Email IMAP/Graph | Stubs only |
| SSO/LDAP | Not implemented |
| File upload | No MIME validation (magic bytes) — extension only |
| DOMPurify | Native sanitizer in use; install `dompurify @types/dompurify` when network allows |
| OAuth callback | Token passed as `?token=` query param — move to hash fragment before prod |

## Security Fixes Applied (June 2026)

| Fix | File |
|-----|------|
| All `dangerouslySetInnerHTML` wrapped with `sanitizeHtml()` | 9 pages/components + `src/lib/sanitize.ts` |
| `htmlParser.ts` `innerHTML` → `textContent`; image URL validation | `src/lib/htmlParser.ts` |
| `lib/api.ts` deleted — stored tokens in `localStorage` | (deleted) |
| Raw server errors → `toUserMessage()` safe messages | `src/lib/errors.ts`, `AuthContext.tsx` |
| `oauthError` query param allowlisted (was rendered raw) | `Auth.tsx` |
| `withCredentials: false` — CSRF surface eliminated | `api/client.ts` |
| Groups memory-only — not serialised to sessionStorage | `AuthContext.tsx` |
| Visitor profile → `sessionStorage` (was `localStorage`) | `visitorProfile.ts` |
| `VITE_API_BASE_URL` throws at startup if missing in prod | `config/api.ts` |

---

## Critical Constraints (from CLAUDE.md)

- Always run `go build ./...` from `backend/go-cms/` after backend changes
- Always run `npx tsc --noEmit -p tsconfig.app.json` from `frontend/react-ui/` after frontend changes
- Virtual "geek" category: `GetTree(ctx, false)` strips it — pass `true` only for admin use
- Filter virtual categories on frontend: `.filter(c => !c.isVirtual)`
- Do NOT add comments, docstrings, or error handling beyond what is asked
- Do NOT refactor surrounding code when fixing a bug — minimal, targeted changes only
