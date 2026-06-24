# GG-CMS — AI Memory: Architecture

> Graph-derived · 5,158 nodes · 12 clusters · Last updated: 2026-06-11

---

## System Topology

```
Browser (React 18 + Vite)
  │  HTTP/HTTPS on :80 (nginx) or :8080 (Vite dev)
  │  All API calls to /api/* 
  ▼
Nginx (Docker — nginx:1.27-alpine)
  │  Reverse proxy /api/* → host:1337 (native mode)
  │  Serves pre-built React dist as SPA
  ▼
Go API Server (:1337)   ←── server.exe (release) or go run (dev)
  │  Gin v1.9
  │  Middleware stack: CORS → Auth → Logger → Audit → Rate-limit → Handler
  ├── PostgreSQL (:5433 host / :5432 container)   ←── gg-cms-postgres (Docker)
  │     Primary relational store — users, groups, CMS content, workflow
  └── MongoDB (:27017)                             ←── gg-cms-mongodb (Docker)
        Document store — engagement, audit, comments, analytics
```

---

## Deployment Variants

| Mode | When | Compose file |
|------|------|-------------|
| **Native** | Windows dev/release — server.exe on host | `docker-compose.native.yml` |
| **Full Docker** | Linux/CI — all services in containers + mTLS | `docker-compose.yml` |
| **Backend-only Docker** | API container only (mTLS) | `docker-compose.backend.yml` |
| **Dev** | `go run ./cmd/server` + `npm run dev` | `backend/go-cms/docker-compose.yml` (DBs only) |

### Release Package (`release/`)
```
release/
  dist/native/    server.exe + .env + migrations/
  dist/frontend/  Pre-built React dist (index.html + assets/)
  config/frontend/nginx.native.conf   Nginx proxies /api → host:1337
  docker-compose.native.yml
  start.bat / stop.bat
```

---

## Request Lifecycle

```
1. Browser → Nginx :80
2. Nginx routes:
     /api/*   → proxy_pass http://host.docker.internal:1337/api/
     /*       → serve /usr/share/nginx/html (React SPA)
3. Go handler receives request
4. middleware.Auth() reads JWT from:
     a. Authorization: Bearer <token>   (primary)
     b. Cookie: jwt=<token>             (fallback)
5. Handler calls Application Service
6. Service calls Repository interface
7. Repository impl queries PG or Mongo
8. Response: { success: bool, data: T, message?: string }
```

---

## Content Workflow State Machine

```
                    ┌─────────┐
           create   │  DRAFT  │ ←── edit any time
               ┌───▶│         │
               │    └────┬────┘
               │     submit │
               │         ▼
               │    ┌─────────┐
               │    │ REVIEW  │  ←── claim / assign reviewer
               │    │         │
               │    └────┬────┘
               │    ┌────┴──────────────────┐
               │    │                       │
               │  approve               send_back → DRAFT (with comment)
               │    │                   reject  → REJECTED
               │    ▼
               │  ┌──────────┐
               │  │ APPROVED │
               │  └────┬─────┘
               │   publish │
               │         ▼
               │  ┌───────────┐
               └──│ PUBLISHED │ ←── re-edit creates has_pending_draft=true
                  └───────────┘
```

**Key fields:**
- `reviewer_id` — currently assigned reviewer (FK to users)
- `has_pending_draft` — true when published item has live draft in REVIEW
- `published_title/description/body` — snapshot at publish time (diff comparison)
- `review_baseline_title/description/body` — snapshot at send-back (diff vs current)
- `content_reviews` table — per-reviewer approvals; `required_approvals` from category

---

## RBAC Model

```
User ──M2M──▶ Group ──JSONB──▶ permissions: {
                                  articles:  { view, create, edit, review, approve, publish },
                                  courses:   { view, create, edit, review, approve, publish },
                                  users:     { view, manage },
                                  groups:    { view, manage },
                                  analytics: { view },
                                  settings:  { manage }
                               }
```

**Admin check (backend):** `middleware.AdminOnly()` — checks JWT role=admin OR group has admin permissions  
**Admin check (frontend):** `user.role === 'admin' || groupNames.includes(ADMIN_GROUP_NAME.toUpperCase())`  
**Route protection (frontend):** `<ProtectedRoute requireAdmin>` — redirects non-admins to `/`

---

## Database Schema — Key Tables

### PostgreSQL (27 migrations)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | Auth + OAuth | `email`, `role`, `status`, `google_id`, `github_id` |
| `groups` | Permission groups | `name`, `permissions` (JSONB) |
| `user_groups` | M2M junction | `user_id`, `group_id` |
| `categories` | Hierarchical CMS taxonomy | `parent_id`, `is_virtual`, `required_approvals` |
| `category_reviewer_groups` | Review routing | `category_id`, `group_id` |
| `articles` | CMS content | `status`, `reviewer_id`, `body_url`, `published_*`, `review_baseline_*`, `has_pending_draft` |
| `courses` | CMS content | same as articles + `published_chapters_snapshot` |
| `sections` | Course hierarchy | `course_id`, `parent_section_id`, `order` |
| `lessons` | Section children | `section_id`, `type`, `is_published` |
| `enrollments` | User ↔ Course | `status`, `progress`, `completed_at` |
| `tasks` | Work queue | `user_id`, `content_id`, `type`, `ownership_type` |
| `content_reviews` | Multi-reviewer approvals | `content_id`, `reviewer_id`, `approved_at` |
| `workflow_events` | Audit trail | `entity_type`, `from_status`, `to_status`, `action` |
| `app_settings` | Config store | `key`, `value` |
| `user_profiles` | Learner personas | `user_id`, `is_default`, `experience_level`, `role_type` |

### MongoDB Collections

| Collection | Store |
|-----------|-------|
| `analytics_events` | Page views, content events, personalisation signals |
| `audit_logs` | System audit trail |
| `review_comments` | Nested comments (embedded replies) |
| `reactions` | Like/dislike per user per content |
| `notes` | User private notes |
| `favourites` | Bookmarked content |
| `highlights` | Text selections + color + note |

---

## Frontend Data Flow

```
User action
  → React component
  → Custom hook (src/api/hooks/use*.ts)
      → React Query (cache + background refetch)
      → *Service.ts (axios call)
      → Go API
      → DB
  ← Typed response
  ← React Query cache update
  ← Component re-render
```

**Auth flow:**
```
login() → POST /api/auth/local
  → setAuthToken(jwt) → sessionStorage + in-memory tokenCache
  → setUserData(user) → sessionStorage
  → fetchUserGroups(userId) → GET /api/users/:id/groups (memory only)
  → navigate('/dashboard')

JWT expiry → setTimeout → handleLogout()
401 response → auth:logout event → onForcedLogout() → clearAllAuthData()
```

---

## Feature Flags

Stored in `app_settings` table. Served via `GET /api/features` (public, no auth).

| Key | Default | Description |
|-----|---------|-------------|
| `feature.social_login` | `false` | Show Google/GitHub sign-in buttons |
| `feature.learning_paths` | `false` | Show Learning Paths nav + home section |
| `feature.interview_prep` | `false` | Show Interview Prep section |

**Migration 026:** Sets `social_login = false` (was `true` in seed — security fix).

---

## Service-to-Service Relationships (HTTP_CALLS detected)

The graph detected 25 HTTP_CALLS edges — primarily from E2E test helpers making direct API calls:
- `apiLogin()` → `POST /api/auth/local`
- `apiCall()` / `apiPost()` → CMS CRUD endpoints
- `injectFakeSession()` → sessionStorage injection (no network)

Frontend-to-backend calls go through Axios `apiClient` instance with auth interceptors.

---

## Security Controls

| Control | Implementation |
|---------|---------------|
| XSS | `sanitizeHtml()` wraps all `dangerouslySetInnerHTML` |
| CSRF | `withCredentials: false` on Axios; no session cookies on cross-origin |
| JWT storage | `sessionStorage` + in-memory cache — never `localStorage` |
| Group data | Memory only — not serialised to sessionStorage (XSS-safe) |
| Rate limiting | `AuthRateLimit` middleware on auth endpoints (in-memory, 10/min/IP) |
| SQL injection | GORM `?` placeholders only — no `fmt.Sprintf` in queries |
| Path traversal | `filepath.Base()` on all upload paths |
| CORS | Explicit allowlist (`CORS_ALLOWED_ORIGINS`) — never `*` |
| Secrets | `.env` file (UTF-8 NoBOM required) — never committed |
