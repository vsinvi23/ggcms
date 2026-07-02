# GG-CMS — Data Flow (Graph-Derived)

---

## Content Lifecycle Flow

```
Creator writes article/course
  │
  ▼
POST /api/cms  →  CMSHandler.Create()
  │                └─▶ cms.Service.Create()
  │                     └─▶ postgres.CMSRepository.Save()
  │                          └─▶ PostgreSQL: articles/courses table
  │                               status = DRAFT
  ▼
POST /api/cms/:id/submit  →  status = REVIEW
  │  task created (ownership_type=REVIEWING) for assigned reviewer
  ▼
POST /api/cms/:id/assign-reviewer  (Admin only)
  │  reviewer_id set on article/course row
  ▼
POST /api/cms/:id/approve  (Reviewer)
  │  content_reviews row inserted
  │  if approvals >= required_approvals → status = APPROVED
  ▼
POST /api/cms/:id/publish  (Admin or assigned publisher)
  │  published_title/description/body snapshots saved
  │  status = PUBLISHED
  │  workflow_event logged (PostgreSQL + MongoDB mirror)
  ▼
GET /api/public/cms  →  Public readers see content
```

---

## Authentication Flow

```
Browser → POST /api/auth/local
  │         body: { identifier, password }
  ▼
authHandler.Login()
  │  └─▶ auth.Service.Login()
  │       └─▶ bcrypt.CompareHashAndPassword()
  │       └─▶ jwt.Manager.Sign(claims{userId, email, role, exp})
  ▼
Response: { jwt: "eyJ...", user: { id, email, name, role } }
  │
  ▼ Browser stores:
  ├─▶ sessionStorage["authToken"] = jwt
  ├─▶ sessionStorage["auth_user"] = JSON(user)
  └─▶ tokenCache (in-memory) = jwt   ← primary cache

Every API request:
  apiClient interceptor → reads tokenCache → sets Authorization: Bearer <jwt>
  401 response → isAuthenticated() checks exp → clearAllAuthData() → auth:logout event
```

---

## Feature Flags Flow

```
App startup → GET /api/features  (public, no auth)
  │
  ▼
settingsHandler.GetFeatures()
  └─▶ settings.Service.GetAll()
       └─▶ app_settings table
            key="feature.social_login"   → value="false"
            key="feature.learning_paths" → value="false"
            key="feature.interview_prep" → value="false"
  │
  ▼
FeatureFlagContext.tsx
  useState({ social_login: false, learning_paths: false, interview_prep: false })
  useEffect → fetch /api/features → update state
  │
  ▼
Components read via useFeatureFlags():
  { social_login } → show/hide OAuth buttons in Auth.tsx
  { learning_paths } → show/hide Learning Paths nav
```

---

## Engagement Data Flow (MongoDB)

```
User reads article/course
  ├─▶ POST /api/engagement/reactions  → MongoDB reactions collection
  ├─▶ POST /api/engagement/notes      → MongoDB notes collection
  ├─▶ POST /api/engagement/highlights → MongoDB highlights collection
  └─▶ POST /api/engagement/favourites → MongoDB favourites collection

All engagement:
  - Keyed by { contentType, contentId, userId }
  - No cross-user reads enforced in handlers via GetUserID(c)
```

---

## Personalization Flow

```
Anonymous visitor:
  ├─▶ sessionStorage["cms_visitor_profile"] = { experienceLevel, roleType, interestedTagIds }
  └─▶ Stored by src/lib/visitorProfile.ts

On login (AuthContext.importVisitorProfile):
  └─▶ POST /api/personalization/profiles/upsert
       └─▶ user_profiles table (PostgreSQL, migration 025)
            ├─▶ experience_level, role_type, learning_goals
            ├─▶ interested_tag_ids  (JSONB)
            └─▶ preferred_category_ids (JSONB)

Recommendations:
  └─▶ GET /api/personalization/recommendations
       └─▶ scoring: +4 preferred category, +3 matching tag, -10 already enrolled
```
