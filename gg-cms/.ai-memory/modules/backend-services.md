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
| `import_handler.go` | `cms.Service`, `task.Service` | `/api/import/preview`, `/api/import/confirm` (JWT-auth, human-driven bulk import) |
| `factory_import_handler.go` | `cms.Service`, `section.Service`, `lesson.Service`, `user.Service` | `POST /api/import/ingest` (secret-header auth, machine-to-machine) |

---

## Factory Sync Ingest (added 2026-09-02)

Separate, unauthenticated-by-JWT ingest path for the standalone `content-factory/` Python app (repo root `content-factory/`, not part of this Go module) to push generated articles/courses into the CMS without a user session:

- Route: `api.POST("/import/ingest", factorySecretMW, factoryImportH.Ingest)` — registered in `router.go` directly on the `api` group, outside the JWT-protected `p := api.Group("/")` block.
- Middleware: `internal/interfaces/http/middleware/factory_secret.go` — `FactorySecret(configuredSecret string) gin.HandlerFunc`, compares the `X-Factory-Sync-Secret` header via `crypto/subtle.ConstantTimeCompare` against `cfg.Import.FactorySyncSecret`.
- Config: `pkg/config/config.go` → `ImportConfig.FactorySyncSecret`, loaded from env var `FACTORY_SYNC_SECRET` (viper). Empty value → middleware rejects all requests (non-fatal startup warning logged).
- Handler: `internal/interfaces/http/handler/factory_import_handler.go` — maps the factory's `SyncPayload` DTO (`internal/interfaces/http/dto/factory_sync_dto.go`) onto `cmssvc.CreateRequest`; articles become a single CMS item, courses fan out into `Section`/`Lesson` rows via `section.Service`/`lesson.Service`. Uses `user.Service.GetByEmail` (added to the `Service` interface) to resolve `cfg.Admin.Email` into an attributed user ID. All ingested items land as `DRAFT` — same review pipeline as human-created content.
- Response: `SyncResult{success, imported_id, slug, version, message}`.
- Verified end-to-end (2026-09-02) via curl for both `article` and `course` payload shapes against the dockerized backend — see `runbooks/troubleshooting.md`.

---

## Password Reset & Admin Recovery (added 2026-09-07)

Two distinct paths, both in `internal/application/auth/service.go`:

- **Self-service reset (all users)**: `POST /auth/forgot-password` → `Service.RequestReset(email)` — anti-enumeration (always returns nil), generates a 32-byte random hex token, stores only its SHA-256 hash in `password_reset_tokens` (1-hour TTL via `resetTokenTTL`), emails a `{FRONTEND_URL}/reset-password?code=...` link via `pkg/mailer`. `POST /auth/reset-password` → `Service.ConfirmReset(code, newPassword)` — hashes the incoming code, looks up via `PasswordResetTokenRepository.FindValidByHash` (unused + unexpired), re-hashes the password, updates the user, marks the token used. Both routes are public + `middleware.AuthRateLimit()`, registered in `router.go` right after `/auth/local/register`.
- **Break-glass master-admin recovery**: `POST /admin/recover-password`, gated by `middleware.AdminRecoverySecret` (`internal/interfaces/http/middleware/admin_recovery_secret.go`) — exact mirror of `factory_secret.go`: compares `X-Admin-Recovery-Secret` header via `crypto/subtle.ConstantTimeCompare` against `cfg.Recovery.AdminRecoverySecret` (env `ADMIN_RECOVERY_SECRET`, empty → all requests rejected, non-fatal startup warning). Calls `Service.RecoverPassword(email, newPassword)` — looks up by email, hashes, updates directly; no token/email round-trip. Registered outside the JWT-protected block, same pattern as `/import/ingest`. Audited via `middleware.LogAudit(c, "admin.password_recovered", ...)`.
- Mailer: `pkg/mailer/mailer.go` — minimal stdlib `net/smtp` sender (`Send(to, subject, body)`), config via `MailerConfig` (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USERNAME`/`SMTP_PASSWORD`/`SMTP_FROM_ADDRESS`), non-fatal if `SMTP_HOST` unset.
- Migration: `migrations/postgres/027_password_reset_tokens.sql` (+ mirrored copy in `release/dist/native/migrations/postgres/`).
- Frontend: `pages/ForgotPassword.tsx`, `pages/ResetPassword.tsx`, routes in `App.tsx`, "Forgot password?" link in `pages/Auth.tsx`'s login tab — wired to the pre-existing `authService.forgotPassword`/`resetPassword`.
- Operational doc: `release/CONFIGURATION.md` §11 "Rotate the master admin password (break-glass)" has the exact curl command and the GCP Secret Manager path (`gg-cms-admin-recovery-secret`, auto-created by `release/gcp/deploy.sh`).

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
