# GG-CMS — Frontend Modules (Graph-Derived)

---

## API Layer (`src/api/`)

### Services (graph-measured, by size)

| Service File | Largest Function | Lines | Purpose |
|-------------|-----------------|-------|---------|
| `cmsService.ts` | `transformCmsItem` | 69 | CMS CRUD + workflow transitions |
| `publicCmsService.ts` | `transformPublicItem` | 45 | Public content browsing |
| `reviewCommentService.ts` | `transformComment` | 31 | Nested review comments |
| `userService.ts` | `getUsers` | 27 | User management |
| `authService.ts` | `register` / `login` | 27/23 | Auth + OAuth |
| `groupService.ts` | `getGroups` | 26 | Group/permission management |
| `enrollmentService.ts` | `transformEnrollment` | 26 | Course enrollment |
| `taskService.ts` | `getTasks` | 26 | Work queue |
| `categoryService.ts` | `getCategoriesPaged` | 23 | Category tree |
| `notificationService.ts` | `getNotifications` | 22 | User notifications |

### Hooks (graph-measured, by size)

| Hook File | Largest Function | Lines | Wraps |
|----------|-----------------|-------|-------|
| `useGroups.ts` | `useGroups` | 82 | groupService |
| `useUsers.ts` | `useUsers` | 57 | userService |
| `use-toast.ts` | `reducer` | 52 | Toast state |
| `useSettings.ts` | `useSettings` | 38 | settingsService |
| `useCms.ts` | `useSendCmsBack` | 24 | cmsService |
| `useAllowedCategories.ts` | `useAllowedCategories` | 30 | categoryService |

---

## Pages (32 total)

### Admin Pages
| Page | Complexity | Role Required |
|------|-----------|---------------|
| `CourseCreator.tsx` | **65** | Any authenticated |
| `ArticleCreator.tsx` | **62** | Any authenticated |
| `GroupsPage.tsx` | **39** | Admin |
| `CourseManagement.tsx` | **19** | Admin |
| `ArticleManagement.tsx` | **19** | Admin |
| `UserManagement.tsx` | **14** | Admin (`requireAdmin`) |
| `MyTasks.tsx` | **14** | Any authenticated |
| `Dashboard.tsx` | ~8 | Admin |
| `ConfigurationPage.tsx` | ~8 | Admin |
| `Settings.tsx` | ~8 (1,500 lines, OOM in Vitest) | Admin |
| `Analytics.tsx` | ~6 | Admin |
| `BulkImport.tsx` | ~6 | Any authenticated |

### Public / Learner Pages
| Page | Purpose |
|------|---------|
| `PublicHome.tsx` | Landing + content discovery |
| `Auth.tsx` | Login + signup + OAuth |
| `PublicArticleView.tsx` | Public article reader |
| `PublicCourseView.tsx` | Public course detail |
| `CourseViewPage.tsx` | Enrolled course player |
| `MyLearning.tsx` | Enrolled courses + progress |
| `NotesHighlightsPage.tsx` | User notes + highlights |
| `ProfilePage.tsx` | User profile viewer |
| `UserSettings.tsx` | Account settings |
| `SearchResults.tsx` | Global content search |
| `OAuthCallback.tsx` | OAuth redirect handler |
| `NotFound.tsx` | 404 page |

---

## Key Components

| Component | Complexity | Usage |
|-----------|-----------|-------|
| `CourseChapterViewer` | 23 (loop depth 5) | Course learning UI |
| `HighlightOverlay` | 23 | Text highlight rendering |
| `AuthProvider` | 33 | Auth context (useAuth hook) |
| `AppSidebar` | ~8 | Sidebar nav (role-gated) |
| `DiffViewer` | 4 (loop depth 4) | Review diff comparison |
| `ReviewActionsPanel` | ~6 | Workflow action buttons |
| `StatusBadge` | ~4 | Content status display |
| `WorkflowStatusBar` | ~4 | Progress indicator |
| `ProtectedRoute` | ~3 | Route auth guard |

---

## State Management

| State Type | Tool | Location |
|-----------|------|----------|
| Server state | TanStack React Query v5 | `src/api/hooks/` |
| Auth state | React Context | `src/contexts/AuthContext.tsx` |
| Feature flags | React Context | `src/contexts/FeatureFlagContext.tsx` |
| UI/client state | Redux Toolkit | `src/store/` |
| Toast | Custom reducer | `src/hooks/use-toast.ts` (52 lines) |

---

## Authentication State (`AuthContext.tsx`, complexity 33)

Key exports:
```typescript
{ user, isAuthenticated, isAdmin, isLoading,
  login(), logout(), signup(), socialLogin(), loginWithToken(),
  userGroups, groupNames, hasGroup(), hasNoGroups,
  visitorProfileImported, clearVisitorImportFlag() }
```

Fan-in: **34 callers** — most-used hook in frontend.

Token storage:
- `sessionStorage["authToken"]` + in-memory `tokenCache`  
- Groups: **memory only** (not sessionStorage — XSS-safe)
