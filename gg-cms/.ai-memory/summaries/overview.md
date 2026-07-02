# GG-CMS — Codebase Overview (Graph-Derived)

**Project:** `C-Vivek-Pesonal-Serenya-Project-CMS-gocms-gg-cms`  
**Graph:** 5,158 nodes · 15,366 edges · Indexed: 2026-06-11  
**Branch:** `InitialSetup` · 11 commits

---

## Product Identity

| Attribute | Value |
|-----------|-------|
| Product | GeekGully CMS — multi-role CMS/LMS platform |
| Users | Admin, Editor/Creator, Reviewer, Learner, Viewer |
| Stage | Active development · pre-production |
| Backend | Go 1.25 · Gin · GORM · PostgreSQL + MongoDB |
| Frontend | React 18 · TypeScript · Vite · shadcn/ui |
| Auth | JWT (HS256) · sessionStorage + in-memory cache |
| Container | Docker Compose (native + mTLS variants) |

---

## Graph Node Distribution

| Label | Count | What It Represents |
|-------|-------|--------------------|
| Function | 1,442 | Go functions + React components/hooks |
| Method | 835 | Go struct methods |
| Variable | 616 | Module-level vars, consts |
| Section | 574 | Code regions |
| Module | 424 | Files treated as modules |
| File | 423 | Source files |
| Interface | 252 | Go interfaces + TS interfaces |
| Class | 250 | TypeScript classes |
| Route | 117 | API routes (HTTP) |
| Folder | 89 | Directory nodes |

---

## Hottest Symbols (Fan-In — most called)

| Symbol | File | Callers | Role |
|--------|------|---------|------|
| `Error` | `pkg/logger/logger.go` | **125** | Structured error logging |
| `cn` | `src/lib/utils.ts` | **116** | Tailwind class merge utility |
| `InternalError` | `pkg/response/response.go` | **97** | 500 response helper |
| `OK` | `pkg/response/response.go` | **83** | 200 response helper |
| `BadRequest` | `pkg/response/response.go` | **80** | 400 response helper |
| `GetUserID` | `middleware/auth.go` | **47** | JWT user extraction |
| `LogAudit` | `middleware/audit_ctx.go` | **42** | Audit trail |
| `Create` | `domain/repository/interfaces.go` | **42** | Generic repository create |
| `delete` | `api/services/cmsService.ts` | **39** | Frontend CMS delete |
| `useAuth` | `contexts/AuthContext.tsx` | **34** | Auth state hook |
| `FindByID` | `domain/repository/interfaces.go` | **33** | Generic repository find |
| `Update` | `domain/repository/interfaces.go` | **30** | Generic repository update |
| `Button` | `components/ui/button.tsx` | **20** | shadcn Button primitive |

**Implication:** `pkg/response/` and `pkg/logger/` are the highest-leverage backend packages — changes ripple everywhere.

---

## Highest Complexity Functions (Graph-Computed)

| Function | File | Cyclomatic Complexity |
|----------|------|-----------------------|
| `CourseCreator` | `pages/CourseCreator.tsx` | **65** |
| `ArticleCreator` | `pages/ArticleCreator.tsx` | **62** |
| `GroupsPage` | `pages/GroupsPage.tsx` | **39** |
| `AuthProvider` | `contexts/AuthContext.tsx` | **33** |
| `HighlightOverlay` | `components/engagement/HighlightOverlay.tsx` | **23** |
| `CourseChapterViewer` | `components/courses/CourseChapterViewer.tsx` | **23** |
| `CourseManagement` | `pages/CourseManagement.tsx` | **19** |
| `ArticleManagement` | `pages/ArticleManagement.tsx` | **19** |
| `parseElement` | `lib/htmlParser.ts` | **18** |
| `Logger` (middleware) | `middleware/logger.go` | **15** |

**Risk:** `CourseCreator` (65) and `ArticleCreator` (62) are most likely to have bugs — high branching. Both have `transitive_loop_depth=3`.

---

## Performance Hotspots (Nested Loop Depth)

| Component | Transitive Loop Depth | Risk |
|-----------|----------------------|------|
| `CourseChapterViewer` | **5** | Nested course section rendering |
| `wordDiff`, `DiffText`, `DiffField`, `ContentBlockDiff` | **4** | Diff computation (review-only path) |
| `CourseCreator`, `ArticleCreator` | **3** | Editor page complexity |
| `Parse`, `parseMarkdown` (importer) | **3** | Bulk import path only |

---

## Test Coverage (Graph-Detected)

| Layer | Files | Key Tests |
|-------|-------|-----------|
| Go unit | 5 packages | `cms`, `settings`, `storage`, `handler`, `middleware` |
| Frontend Vitest | 9 files | `AppSidebar`, `Auth`, `Dashboard`, `ReviewActionsPanel`, `StatusBadge`, `WorkflowStatusBar`, `ProtectedRoute`, `NotFound`, `Settings` |
| Playwright E2E | 20+ specs | Auth, RBAC, workflow, dashboard, articles, courses, settings, users, profile |

**Security test coverage via HTTP_CALLS graph (25 edges):**
- CMS ownership: `UPDATE`, `DELETE`, `PUBLISH`, `SEND-BACK`, `REVIEW-NOTE`
- User ownership: own profile update, cross-user forbidden
- Reviewer authorization: assigned vs non-assigned
