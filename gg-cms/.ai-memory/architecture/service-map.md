# GG-CMS — Service Map (Graph-Derived)

**Source:** codebase-memory-mcp · 15,366 edges analysed

---

## System Topology

```
                    ┌──────────────────────────────────┐
                    │  Browser (React 18 + Vite)       │
                    │  http://localhost:8080 (dev)      │
                    │  http://localhost:80  (release)   │
                    └──────────────┬───────────────────┘
                                   │ HTTP /api/*
                                   ▼
                    ┌──────────────────────────────────┐
                    │  Nginx (Docker nginx:1.27-alpine) │
                    │  :80 → serves React SPA           │
                    │  /api/* → proxy_pass :1337        │
                    └──────────────┬───────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────┐
                    │  Go API Server  :1337             │
                    │  Gin · GORM · JWT                 │
                    │                                   │
                    │  CORS → Auth → Logger →           │
                    │  Audit → RateLimit → Handler      │
                    └────────┬──────────────┬──────────┘
                             │              │
              ┌──────────────▼──┐     ┌─────▼──────────────────┐
              │  PostgreSQL :5433│     │  MongoDB :27017         │
              │  (gg-cms-postgres│     │  (gg-cms-mongodb)       │
              │  Docker)         │     │  Docker)                │
              │                  │     │                          │
              │  Users, Groups   │     │  Engagement (reactions,  │
              │  CMS, Workflow   │     │  notes, highlights)      │
              │  Enrollments     │     │  Audit logs              │
              │  Settings        │     │  Review comments         │
              └──────────────────┘     │  Analytics events        │
                                       └─────────────────────────┘
```

---

## Architectural Clusters (Graph-Detected, 12 clusters)

| Cluster | Type | Members | Cohesion | Top Nodes |
|---------|------|---------|----------|-----------|
| 1 | Backend | 283 | 0.943 | `Error`, `InternalError`, `OK`, `BadRequest`, `parseID` |
| 25 | Backend | 143 | 0.915 | `Create`, `FindByID`, `Update`, `Approve`, `recordEvent` |
| 15 | Backend | 103 | 0.805 | `main`, `NewRouter`, `Get`, `SeedAdmin`, `Info` |
| 73 | Backend | 48 | 0.925 | `newCMSRouter`, `doRequest`, `articleWithReviewer` |
| 31 | Backend | 34 | 0.870 | `Count`, `Offset`, `Save`, `Create`, `Slug` |
| 40 | Backend/Test | 111 | 0.893 | `assertStatus`, `newClient`, `setupTestUser` |
| 46 | Frontend | 176 | 0.795 | `CourseCreator`, `ArticleCreator`, `useCategories` |
| 22 | Frontend | 132 | 0.755 | `useAuth`, `PublicHome`, `MyLearning` |
| 16 | Frontend | 120 | 0.794 | `cn`, `SearchResults`, `renderBlockEditor` |
| 23 | Frontend | 92 | 0.675 | `MyTasks`, `CourseViewPage`, `Badge` |
| 45 | Frontend | 83 | 0.860 | `GroupsPage`, `CategoriesTab`, `useGroupsQuery` |
| 47 | Frontend | 80 | 0.796 | `AuthProvider`, `toast`, `HighlightOverlay` |

**High cohesion (>0.90):** Backend response/logging helpers + test infrastructure  
**Lower cohesion (<0.80):** Public-facing frontend pages (expected — cross-domain UI)

---

## Backend Layer Boundaries

```
interfaces/http/handler/   ──CALLS──▶  application/*/service.go
application/*/service.go   ──CALLS──▶  domain/repository/ (interface)
infrastructure/postgres/   ──IMPLEMENTS──▶  domain/repository/
infrastructure/mongodb/    ──IMPLEMENTS──▶  domain/repository/
```

**Verified via graph:** Handler→Service CALLS edges exist for auth, cms, user, group, category, enrollment, section, lesson, task, tag, notification, settings, personalization, analytics, comment, media, public, import handlers.

---

## Frontend Data Flow

```
React Component
  └─▶ Custom hook (src/api/hooks/use*.ts)          [React Query]
       └─▶ *Service.ts  (src/api/services/)         [axios]
            └─▶ apiClient (src/api/client.ts)        [interceptors]
                 └─▶ Go API :1337
```

**Largest service functions (by lines):**

| Service Function | Lines | Purpose |
|-----------------|-------|---------|
| `transformCmsItem` | 69 | Raw API → typed CmsResponseDto |
| `transformPublicItem` | 45 | Public content transform |
| `useGroups` hook | 82 | Groups CRUD + cache |
| `useUsers` hook | 57 | Users list + mutations |
| `useSettings` hook | 38 | Settings + feature flags |

---

## HTTP_CALLS Security Coverage (Graph Edge Count: 25)

Endpoints verified by handler security tests:

| Endpoint Pattern | Test Coverage | Scenarios |
|-----------------|---------------|-----------|
| `PUT /api/cms/:id` | ✅ | owner-allowed, non-owner-forbidden, admin-allowed |
| `DELETE /api/cms/:id` | ✅ | owner-allowed, non-owner-forbidden |
| `POST /api/cms/:id/publish` | ✅ | admin-allowed, assigned-reviewer-allowed, non-reviewer-forbidden |
| `POST /api/cms/:id/send-back` | ✅ | assigned-reviewer-allowed, non-reviewer-forbidden |
| `POST /api/cms/:id/review-note` | ✅ | assigned-reviewer-allowed, non-reviewer-forbidden |
| `PUT /api/users/:id` | ✅ | own-profile-allowed, cross-user-forbidden, status-change-forbidden |
| `/categories/:categoryId/tags` | ✅ | tag management endpoints |

---

## Deployment Variants

| Mode | Compose File | Backend | Frontend |
|------|-------------|---------|----------|
| Dev | `backend/go-cms/docker-compose.yml` | `go run` (:1337) | `npm run dev` (:8080) |
| Native release | `release/docker-compose.native.yml` | `server.exe` (:1337) | nginx (:80) |
| Full Docker + mTLS | `release/docker-compose.yml` | Docker container (:8443) | nginx (:80) |
| Backend-only Docker | `release/docker-compose.backend.yml` | Docker + mTLS | — |
