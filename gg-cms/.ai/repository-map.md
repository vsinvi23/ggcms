# Repository Map — Quick Navigation

> Use this to find where things live. Load only when navigating unfamiliar areas.

---

## Backend — `backend/go-cms/`

### Entry Points
| File | Purpose |
|------|---------|
| `cmd/server/main.go` | Server startup: config → migrations → seed admin → repos → services → router → HTTP server |
| `internal/interfaces/http/router.go` | All Gin routes + Services struct definition |
| `internal/bootstrap/admin.go` | Seeds admin user + Geek virtual category on startup |

### Domain Layer
| Path | Contents |
|------|---------|
| `internal/domain/entity/` | All GORM entities + MongoDB bson structs |
| `internal/domain/repository/interfaces.go` | ALL repository interface contracts (single file) |

### Entity Files
```
user.go, group.go, category.go, tag.go
cms.go (Article + Course + Attachment), section.go, lesson.go
enrollment.go, task.go, learning_path.go
user_profile.go, content_type.go, content_review.go
notification.go, workflow_event.go, app_setting.go
analytics.go, reaction.go, note.go, favourite.go, highlight.go
```

### Application Services
```
internal/application/
  auth/service.go          learningpath/service.go
  oauth/service.go         contenttype/service.go
  user/service.go          engagement/service.go (4 services)
  group/service.go         notification/service.go
  category/service.go      analytics/service.go
  cms/service.go           audit/service.go
  section/service.go       comment/service.go
  lesson/service.go        settings/service.go
  enrollment/service.go    personalization/service.go
  task/service.go
  tag/service.go
```

### Infrastructure
```
internal/infrastructure/persistence/
  postgres/         GORM implementations (one file per repository)
  mongodb/          Mongo implementations (one file per repository)
```

### HTTP Layer
```
internal/interfaces/http/
  router.go                 Route definitions
  handler/                  One handler file per domain
  dto/                      Request/response DTOs
  middleware/
    auth.go                 JWT validation + GetUserID/GetUserEmail/IsAdmin
    cors.go                 CORS config
    rate_limit.go           Auth rate limiting
    audit.go                Audit middleware
    admin_only.go           Admin-only route guard
```

### Package Utilities
```
pkg/
  config/    config.go — Viper loader; all env vars with defaults
  database/  postgres.go, mongodb.go — connection factories
  jwt/       manager.go — Sign/Validate
  logger/    zap structured logger
  pagination/ helpers.go
  response/  response.go — all response helpers
```

### Migrations
```
migrations/postgres/
  001_initial.sql through 025_user_profile_multiprofile.sql
```

---

## Frontend — `frontend/react-ui/src/`

### Routing (`App.tsx`)
```
Public routes:  /  /auth  /auth/callback  /search  /technology/:slug
                /explore/:category  /article/*  /course/*  /learn/:path
Protected routes: /dashboard  /my-learning  /my-tasks  /profile
                  /content  /courses  /articles  /analytics
                  /user-management  /users  /roles  /configuration
                  /admin  /account-settings
```

### Pages (32 total)
```
pages/
  Auth.tsx                 OAuthCallback.tsx
  Dashboard.tsx            AdminContentOverview.tsx
  ArticleCreator.tsx       ArticleManagement.tsx
  CourseCreator.tsx        CourseManagement.tsx
  ArticleViewPage.tsx      CourseViewPage.tsx       CourseCategoryPage.tsx
  PublicHome.tsx           PublicArticleView.tsx    PublicCourseView.tsx
  MyLearning.tsx           MyTasks.tsx              ProfilePage.tsx
  UserSettings.tsx         UserManagement.tsx       UserManagementDashboard.tsx
  GroupsPage.tsx           Roles.tsx                CategoriesPage.tsx
  ConfigurationPage.tsx    LearningPathPage.tsx     SearchResults.tsx
  TechnologyPage.tsx       Analytics.tsx            Settings.tsx
  NotFound.tsx
```

### Component Organization
```
components/
  articles/         ArticleEditor, PublishScheduler, RichContentEditor, SeoSettingsPanel
  auth/             AuthModal
  configuration/    CategoriesTab, ContentTypesTab, InterviewPathsTab, LearningPathsTab,
                    ReviewerGroupsTab, TagsTab
  content/          CategoryDetailsPanel, CategoryFormModal, CategoryTree, UserGroupAssignmentPanel
  courses/          CourseCard, CourseChapterManager, CourseChapterViewer, CourseHierarchyEditor, LessonEditor
  engagement/       HighlightOverlay, HighlightsPanel, InteractionBar, NotePanel
  home/             UserLearningSection
  layout/           AppSidebar, DashboardLayout, Header, ProtectedRoute, PublicLayout
  personalization/  FloatingPersonalizationButton, HomePersonalizationWidget, OnboardingWizard,
                    ProfileSwitcher, RecommendedContent, VisitorImportDialog
  public/           ArticleExploreCard, ContentCard, ExploreContentCard, FeaturedContentCard, FilterBar
  roles/            UserGroupFormModal, UserGroupList
  shared/           AttachmentUploader, CommentsSection
  ui/               Shadcn primitives
```

### API Layer
```
api/
  client.ts         Axios instance; token management; sessionStorage helpers
  types.ts          ALL shared TypeScript interfaces (single source of truth)
  index.ts          Barrel re-exports
  strapiHelpers.ts  Legacy response shape adapters
  services/         18 service files (*Service.ts)
  hooks/            19+ hook files (use*.ts)
```

### State & Utilities
```
contexts/
  AuthContext.tsx   isAuthenticated, user, login/logout, visitorProfileImported,
                   clearVisitorImportFlag, importVisitorProfile (auto on login),
                   groups in memory ONLY (not sessionStorage)
  FeatureFlagContext.tsx

lib/
  sanitize.ts        sanitizeHtml() — native DOM sanitizer, wraps all dangerouslySetInnerHTML
  errors.ts          toUserMessage() — maps HTTP status to safe user-facing strings
  visitorProfile.ts  sessionStorage R/W for anonymous profiles (not localStorage)
  rolePresets.ts     6 role preset definitions (ROLE_PRESETS array)
  slug.ts            URL slug builders for articles/courses
  utils.ts           cn() + other utilities

store/               Redux slices (minimal — mostly React Query)
config/api.ts        ADMIN_GROUP_NAME, storage keys, VITE_API_URL
```

---

## Configuration Files

| File | Purpose |
|------|---------|
| `backend/go-cms/.env` | Local dev env vars (gitignored) |
| `backend/go-cms/.env.example` | Template for env vars |
| `frontend/react-ui/.env.development` | `VITE_API_URL=http://localhost:8080/api` |
| `CLAUDE.md` | AI assistant project conventions (authoritative) |
| `backend/go-cms/go.mod` | Go 1.25 + all dependencies |
| `frontend/react-ui/package.json` | React 19, Vite, Shadcn, React Query |

---

## Finding Things Fast

| I need to... | Look in... |
|-------------|-----------|
| Add a new API endpoint | `router.go` → `handler/` → `dto/` → `application/*/service.go` → `interfaces.go` |
| Add a new DB table | `migrations/postgres/` → `entity/` → `interfaces.go` → `persistence/postgres/` |
| Add a new frontend page | `App.tsx` → `pages/` → `api/services/` → `api/hooks/` → `api/types.ts` |
| Change auth logic | `middleware/auth.go` → `application/auth/service.go` |
| Change permissions | `entity/group.go` (GroupPermissions struct) → `middleware/` |
| Add new entity field | Migration → entity struct → affected repos → service → DTO → frontend types |
| Debug a 401 | `middleware/auth.go` → JWT claims → `pkg/jwt/manager.go` |
| Debug a missing route | `router.go` Services struct → handler init → route registration |
