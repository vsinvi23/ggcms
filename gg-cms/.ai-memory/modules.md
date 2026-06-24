# GG-CMS — AI Memory: Modules

> Graph clusters: 12 detected · 5,158 nodes · Backend (Go) + Frontend (React)

---

## Backend Modules (Go — Clean Architecture)

### Entry Point
| Path | Role |
|------|------|
| `cmd/server/main.go` | Startup: load config → init DBs → run migrations → seed admin → wire router → listen |

---

### `internal/domain/`
Pure interfaces and structs — no business logic, no DB calls.

| Sub-package | Contents |
|-------------|----------|
| `entity/` | GORM structs (User, Group, Category, Article, Course, Section, Lesson, Enrollment, Task, Tag, LearningPath, ContentReview, WorkflowEvent, AppSetting, UserProfile) + MongoDB bson structs |
| `repository/` | Interface contracts only (e.g. `UserRepository`, `CMSRepository`) |

---

### `internal/application/` — Business Logic Services

Each service owns one domain slice. Services depend on repository interfaces (injected).

| Service | Key Responsibilities | Critical Functions |
|---------|---------------------|--------------------|
| `auth` | Login, register, JWT issue | `Login()`, `Register()`, `GetCurrentUser()` |
| `oauth` | Google + GitHub OAuth | `GetAuthURL()`, `HandleCallback()` |
| `user` | User CRUD, group membership | `Create()`, `UpdateStatus()`, `GetGroups()` |
| `group` | Group CRUD, permission JSONB | `Create()`, `AddMember()`, `RemoveMember()` |
| `category` | Hierarchical tree, virtual root, reviewer routing | `GetTree()`, `Create()`, `AddReviewerGroup()` |
| `cms` | Article + Course CRUD, full review workflow, versioning snapshots | `Create()`, `Submit()`, `Approve()`, `Reject()`, `SendBack()`, `Publish()`, `AssignReviewer()` |
| `section` / `lesson` | Course hierarchy CRUD | `Create()`, `Reorder()` |
| `enrollment` | Course enrolment + lesson completion | `Enroll()`, `UpdateProgress()` |
| `task` | Per-user work queue (OWNED/REVIEWING/CONTRIBUTED) | `ListByUser()`, `UpsertReviewerTask()` |
| `tag` | Tag CRUD + category-tag M2M | `Create()`, `AssociateWithCategory()` |
| `learningpath` | Ordered course lists | `Create()`, `AddCourse()` |
| `contenttype` | Configurable type labels | `GetAll()`, `Upsert()` |
| `engagement` | Reaction, Note, Favourite, Highlight (MongoDB) | `ToggleReaction()`, `UpsertNote()`, `SaveHighlight()` |
| `notification` | User notifications | `Create()`, `MarkRead()`, `ListByUser()` |
| `analytics` | Event tracking, dashboard stats | `RecordEvent()`, `GetDashboard()` |
| `audit` | System-wide audit log | `ListAuditLogs()` |
| `comment` | Nested review comments (MongoDB) | `Create()`, `ListByContent()` |
| `settings` | App settings key-value store + feature flags | `GetAll()`, `Update()`, `GetFeatures()` |
| `personalization` | Multi-profile, recommendations | `UpsertProfile()`, `GetRecommendations()` |
| `importer` | Bulk content import from CSV/Markdown | `Parse()`, `Import()` |

---

### `internal/infrastructure/`

| Package | Role |
|---------|------|
| `persistence/postgres/` | GORM implementations of all repository interfaces |
| `persistence/mongodb/` | Mongo implementations (engagement, audit, comments, analytics) |
| `storage/` | Local file storage for uploads (`local_storage.go`) |
| `media/` | Media processing helpers |

---

### `internal/interfaces/http/`

| File/Package | Role |
|-------------|------|
| `router.go` | Gin route wiring; `Services` struct injects all services into handlers |
| `handler/` | One handler per domain (auth, user, group, category, cms, section, lesson, enrollment, task, tag, learningpath, contenttype, engagement, notification, analytics, audit, comment, settings, personalization, media, public, import) |
| `dto/` | Request/response DTO structs (bound + validated by Gin) |
| `middleware/` | `Auth`, `CORS`, `AuthRateLimit`, `Logger`, `AuditMiddleware` |

---

### `pkg/`

| Package | Role |
|---------|------|
| `config/` | Viper config loader — reads `.env`, maps to `Config` struct |
| `database/` | PG (`pgx/v5`) + MongoDB connection factories; `DB_WRITE_URL`/`DB_READ_URL` split |
| `jwt/` | `Manager` — `Sign(claims)`, `Verify(token)` |
| `logger/` | zap-based structured logger |
| `pagination/` | `ParsePage()` helper |
| `response/` | `OK()`, `BadRequest()`, `Unauthorized()`, `InternalError()` — standard JSON envelope |

---

## Frontend Modules (React 18)

### Graph Clusters (by cohesion)

| Cluster | Top Nodes | Description |
|---------|-----------|-------------|
| `backend` (cluster 1, cohesion 0.94) | `Error`, `InternalError`, `OK`, `BadRequest`, `parseID` | Response helpers + ID parsing |
| `frontend` (cluster 46, cohesion 0.80) | `CourseCreator`, `ArticleCreator`, `useCategories`, `detail` | Content creation pages |
| `backend` (cluster 25, cohesion 0.91) | `Create`, `FindByID`, `Update`, `Approve`, `recordEvent` | Core CRUD + workflow services |
| `frontend` (cluster 22, cohesion 0.75) | `useAuth`, `PublicHome`, `UserLearningSection`, `MyLearning` | Auth-aware public + learner pages |
| `frontend` (cluster 16, cohesion 0.79) | `cn`, `SearchResults`, `renderBlockEditor`, `onChange` | UI utilities + search + rich editor |
| `backend` (cluster 40, cohesion 0.89) | `assertStatus`, `newClient`, `setupTestUser` | Integration test helpers |
| `backend` (cluster 15, cohesion 0.81) | `main`, `NewRouter`, `SeedAdmin`, `Info` | App bootstrap |
| `frontend` (cluster 45, cohesion 0.86) | `GroupsPage`, `CategoriesTab`, `useGroupsQuery` | Admin config UI |
| `frontend` (cluster 47, cohesion 0.80) | `AuthProvider`, `toast`, `HighlightOverlay` | Auth context + engagement |

---

### `src/api/`

| File/Folder | Role |
|-------------|------|
| `client.ts` | Axios instance · token cache (`tokenCache`) · 401 interceptor → `auth:logout` event · `isAuthenticated()` checks JWT `exp` |
| `types.ts` | All shared TypeScript interfaces (source of truth) |
| `services/*Service.ts` | Axios call wrappers — return typed data; never expose Axios shapes to UI |
| `hooks/use*.ts` | React Query wrappers — expose `{data, isLoading, error, mutate}` |

**Naming convention:** `services/cmsService.ts` → `hooks/useCms.ts`

---

### `src/pages/` (32 pages)

| Category | Pages |
|----------|-------|
| Public | `PublicHome`, `Auth`, `SearchResults`, `TechnologyPage`, `CourseCategoryPage`, `PublicArticleView`, `PublicCourseView`, `LearningPathPage` |
| Admin | `Dashboard`, `UserManagement`, `UserManagementDashboard`, `GroupsPage`, `AdminContentOverview`, `ConfigurationPage`, `Settings`, `Analytics`, `BulkImport` |
| Content | `ContentManagement`, `ArticleManagement`, `ArticleCreator`, `CourseManagement`, `CourseCreator` |
| Learner | `MyLearning`, `MyTasks`, `NotesHighlightsPage`, `ProfilePage`, `UserSettings`, `OAuthCallback` |
| Other | `NotFound` |

---

### `src/contexts/`

| Context | Key Exports |
|---------|-------------|
| `AuthContext` | `user`, `isAuthenticated`, `isAdmin`, `login()`, `logout()`, `userGroups`, `hasGroup()`, `visitorProfileImported` |
| `FeatureFlagContext` | `social_login`, `learning_paths`, `interview_prep` — fetched from `/api/features` |

---

### `src/components/` (domain-organised)

| Domain | Key Components |
|--------|---------------|
| `layout/` | `AppSidebar`, `DashboardLayout`, `PublicLayout`, `ProtectedRoute`, `NavLink` |
| `articles/` | `RichContentEditor`, `ArticleCard`, `ArticleViewer` |
| `courses/` | `CourseChapterManager`, `CourseChapterViewer`, `CourseLearningPage` |
| `shared/` | `StatusBadge`, `WorkflowStatusBar`, `ReviewActionsPanel`, `DiffViewer` |
| `auth/` | `AuthModal` |
| `personalization/` | `FloatingPersonalizationButton`, `OnboardingWizard`, `VisitorImportDialog` |
| `ui/` | shadcn/ui primitives (button, card, dialog, tabs, etc.) |

---

### `src/lib/`

| File | Purpose |
|------|---------|
| `sanitize.ts` | Native HTML sanitizer (XSS protection) — used before `dangerouslySetInnerHTML` |
| `errors.ts` | `toUserMessage()` — maps HTTP status → safe user strings |
| `visitorProfile.ts` | Anonymous visitor profile (sessionStorage) — auto-imported on login |
| `rolePresets.ts` | 6 persona presets for onboarding wizard |
| `htmlParser.ts` | `parseBodyToBlocks()` / `parseBodyToHtml()` — rich content ↔ block format |

---

## E2E Test Infrastructure (`frontend/react-ui/e2e/`)

| File | Role |
|------|------|
| `global-setup.ts` | Seeds 3 test users (creator/reviewer/learner), 1 review group, 1 category. Short-circuits if `.e2e-state.json` exists (users reused across runs). |
| `global-teardown.ts` | Deletes CMS items titled `E2E *` — preserves state file and test users. Errors are non-fatal (try/catch). |
| `helpers/auth.ts` | `injectFakeSession(page, role, opts)` — injects JWT + user data into sessionStorage. `loginViaUI(page, email, password)` — real browser login. |
| `playwright.local.config.ts` | Chrome-only, `retries:1`, `timeout:45s`, global setup/teardown wired. |

### Spec file inventory

| Spec | Category | Tests |
|------|----------|-------|
| `auth.spec.ts` | Auth | 12 (1 skip) |
| `dashboard.spec.ts` | Admin | 7 |
| `article-publish-cycle.spec.ts` | HIGH — full workflow | 4 |
| `course-publish-cycle.spec.ts` | HIGH — full workflow | 2 |
| `search-filter.spec.ts` | MEDIUM | 5 |
| `profile.spec.ts` | MEDIUM | 6 |
| `bulk-import.spec.ts` | MEDIUM | 4 |
| `my-learning.spec.ts` | MEDIUM | 7 |
| `notifications.spec.ts` | MEDIUM | 2 |
| `full-workflow.spec.ts` | Workflow | 12 |
| `role-visibility.spec.ts` | RBAC | 12 |
| `security-authz.spec.ts` | Security | 18 |
| + 8 more spec files | Various | ~120 |
