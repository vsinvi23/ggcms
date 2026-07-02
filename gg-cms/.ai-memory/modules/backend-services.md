# GG-CMS — Backend Services (Graph-Derived)

**Source:** codebase-memory-mcp · 5,158 nodes

---

## Service Registry

| Service | Package Path | Key Methods | DB |
|---------|-------------|-------------|-----|
| `auth` | `internal/application/auth/` | `Login`, `Register`, `GetCurrentUser` | PG |
| `oauth` | `internal/application/oauth/` | `GetAuthURL`, `HandleCallback` | PG |
| `user` | `internal/application/user/` | `Create`, `Update`, `GetGroups`, `UpdateStatus` | PG |
| `group` | `internal/application/group/` | `Create`, `AddMember`, `RemoveMember` | PG |
| `category` | `internal/application/category/` | `GetTree`, `Create`, `AddReviewerGroup` | PG |
| `cms` | `internal/application/cms/` | `Create`, `Submit`, `Approve`, `Reject`, `SendBack`, `Publish`, `AssignReviewer`, `ClaimReview` | PG |
| `section` | `internal/application/section/` | `Create`, `Update`, `Reorder` | PG |
| `lesson` | `internal/application/lesson/` | `Create`, `Update`, `MarkPublished` | PG |
| `enrollment` | `internal/application/enrollment/` | `Enroll`, `UpdateProgress`, `CompleteLesson` | PG |
| `task` | `internal/application/task/` | `ListByUser`, `UpsertReviewerTask` | PG |
| `tag` | `internal/application/tag/` | `Create`, `GetAll`, `AssociateWithCategory` | PG |
| `learningpath` | `internal/application/learningpath/` | `Create`, `AddCourse`, `GetAll` | PG |
| `contenttype` | `internal/application/contenttype/` | `GetAll`, `Upsert` | PG |
| `engagement` | `internal/application/engagement/` | `ToggleReaction`, `UpsertNote`, `SaveHighlight`, `ToggleFavourite` | Mongo |
| `notification` | `internal/application/notification/` | `Create`, `MarkRead`, `ListByUser` | PG |
| `analytics` | `internal/application/analytics/` | `RecordEvent`, `GetDashboard` | Mongo |
| `audit` | `internal/application/audit/` | `ListAuditLogs` | Mongo |
| `comment` | `internal/application/comment/` | `Create`, `ListByContent` | Mongo |
| `settings` | `internal/application/settings/` | `GetAll`, `Update`, `GetFeatures` | PG |
| `personalization` | `internal/application/personalization/` | `UpsertProfile`, `GetRecommendations`, `SetActiveProfile` | PG |
| `importer` | `internal/application/importer/` | `Parse`, `Import` | PG |

---

## Handler → Service Mapping

| Handler File | Service Called | Route Prefix |
|-------------|---------------|-------------|
| `auth_handler.go` | `auth.Service` | `/api/auth/` |
| `oauth_handler.go` | `oauth.Service` | `/api/auth/google`, `/api/auth/github` |
| `user_handler.go` | `user.Service` | `/api/users/` |
| `group_handler.go` | `group.Service` | `/api/user-groups/` |
| `category_handler.go` | `category.Service` | `/api/categories/` |
| `cms_handler.go` | `cms.Service`, `task.Service` | `/api/cms/` |
| `section_handler.go` | `section.Service` | `/api/sections/` |
| `lesson_handler.go` | `lesson.Service` | `/api/lessons/` |
| `enrollment_handler.go` | `enrollment.Service` | `/api/enrollments/` |
| `task_handler.go` | `task.Service` | `/api/tasks/` |
| `tag_handler.go` | `tag.Service` | `/api/tags/` |
| `notification_handler.go` | `notification.Service` | `/api/notifications/` |
| `settings_handler.go` | `settings.Service` | `/api/settings/`, `/api/features` |
| `analytics_handler.go` | `analytics.Service` | `/api/analytics/` |
| `personalization_handler.go` | `personalization.Service` | `/api/personalization/` |
| `public_handler.go` | `cms.Service`, `category.Service`, `analytics.Service` | `/api/public/` |
| `media_handler.go` | `settings.Service` | `/api/media/` |
| `import_handler.go` | `cms.Service`, `task.Service` | `/api/import/` |

---

## Shared Infrastructure (`pkg/`)

| Package | Fan-In | Purpose |
|---------|--------|---------|
| `pkg/response/` | **260+** | `OK()`, `BadRequest()`, `InternalError()`, `NotFound()`, `Created()` |
| `pkg/logger/` | **142** | zap-based structured logger — `Error()`, `Info()`, `Fatal()` |
| `pkg/jwt/` | ~20 | JWT sign + verify |
| `pkg/config/` | ~15 | Viper config loader |
| `pkg/database/` | ~10 | PG + Mongo connection factories |
| `pkg/pagination/` | ~8 | `ParsePage()` helper |

---

## Bootstrap Sequence (`cmd/server/main.go`)

```
1. Load config (Viper from .env)
2. Init logger (zap)
3. Connect PostgreSQL (pgx/v5 pool)
4. Connect MongoDB
5. Run all SQL migrations (27 files, idempotent)
6. Seed admin user + virtual "geek" category (bootstrap/admin.go)
7. Wire Services struct (inject repos into services)
8. Build Gin router (middleware stack + all handlers)
9. Listen on SERVER_PORT (default :1337)
```

**SeedAdmin complexity:** 11 (graph-measured) — creates admin user + Admin group + links Geek virtual category to Admin group.
