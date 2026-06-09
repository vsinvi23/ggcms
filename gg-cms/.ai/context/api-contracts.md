# API Contracts

## Base URL
```
Development: http://localhost:8080/api
Frontend env: VITE_API_URL
```

## Response Envelopes

### Standard success
```json
{ "success": true, "data": <T> }
```

### Paged success
```json
{
  "success": true,
  "items": [],
  "total": 100,
  "currentPage": 0,
  "pageSize": 20
}
```

### Strapi-paged (legacy, for category/article list pages)
```json
{
  "data": [],
  "meta": { "pagination": { "page": 1, "pageSize": 20, "pageCount": 5, "total": 100 } }
}
```

### Error
```json
{ "success": false, "message": "descriptive error" }
```

## Pagination Query Params
```
?page=0&size=20    (0-indexed page)
```

## Auth Routes (Public)
```
POST /api/auth/local            { email, password } → { token }
POST /api/auth/local/register   { email, password, name, mobileNo? } → { token }
GET  /api/auth/google           → redirect
GET  /api/auth/github           → redirect
```

## User Routes (Protected)
```
GET    /api/users/me
GET    /api/users               ?page=0&size=20
POST   /api/users               { email, name, ... }
GET    /api/users/:id
PUT    /api/users/:id
DELETE /api/users/:id
POST   /api/users/:id/activate
POST   /api/users/:id/deactivate
GET    /api/users/:id/groups
```

## Category Routes
```
GET    /api/categories           (public — returns tree, virtual stripped)
GET    /api/categories/:id
POST   /api/categories           (protected)
PUT    /api/categories/:id
DELETE /api/categories/:id
GET    /api/categories/:id/tags
PUT    /api/categories/:id/tags
GET    /api/categories/:id/reviewer-groups
POST   /api/categories/:id/reviewer-groups
DELETE /api/categories/:id/reviewer-groups/:gid
```

## CMS Routes (Protected)
```
GET    /api/cms                  ?type=ARTICLE|COURSE&status=DRAFT&page=0&size=20
GET    /api/cms/:id
POST   /api/cms                  { type, categoryId, title, ... }
PUT    /api/cms/:id
DELETE /api/cms/:id
POST   /api/cms/:id/submit
POST   /api/cms/:id/approve
POST   /api/cms/:id/publish
POST   /api/cms/:id/send-back    { comment }
POST   /api/cms/:id/reject       { comment }
GET    /api/cms/:id/activity
POST   /api/cms/:id/claim-review
POST   /api/cms/:id/reassign-review
POST   /api/cms/:id/review-note
POST   /api/cms/:id/assign-reviewer
```

## Public Content Routes (No Auth)
```
GET /api/public/articles               ?page=0&size=20
GET /api/public/articles/category/:slug
GET /api/public/articles/:id
GET /api/public/courses                ?page=0&size=20
GET /api/public/courses/category/:slug
GET /api/public/courses/:id
GET /api/public/cms                    ?type=ARTICLE|COURSE&page=0&size=20
GET /api/public/cms/:id
```

## Engagement Routes (Protected)
```
POST   /api/engagement/:contentType/:contentId/react
DELETE /api/engagement/:contentType/:contentId/react
GET    /api/engagement/:contentType/:contentId/reactions

PUT    /api/engagement/:contentType/:contentId/note
GET    /api/engagement/:contentType/:contentId/note
GET    /api/engagement/notes
DELETE /api/engagement/notes/:id

POST   /api/engagement/:contentType/:contentId/favourite
GET    /api/engagement/:contentType/:contentId/favourite
GET    /api/engagement/favourites

POST   /api/engagement/:contentType/:contentId/highlights
GET    /api/engagement/:contentType/:contentId/highlights
GET    /api/engagement/highlights
PUT    /api/engagement/highlights/:id
DELETE /api/engagement/highlights/:id

# contentType: "article" | "course"
```

## Personalization Routes (Protected)
```
GET  /api/personalization/profile                    -- active/default profile
PUT  /api/personalization/profile                    -- upsert active profile (name field now supported)
GET  /api/personalization/profiles                   -- all named profiles for user
POST /api/personalization/profiles                   -- create new named profile
PUT  /api/personalization/profiles/:id/activate      -- switch active profile
GET  /api/personalization/recommendations ?limit=10  -- scored content list
```

### UserProfileResponse shape (includes name + isDefault since migration 025)
```json
{
  "id": 1, "userId": 42,
  "name": "Default", "isDefault": true,
  "experienceLevel": "intermediate", "roleType": "developer",
  "learningGoals": "...", "onboardingCompleted": true,
  "interestedTagIds": [1, 2], "preferredCategoryIds": [3]
}
```

### CreateProfileRequest (POST /profiles)
```json
{
  "name": "Developer Mode",
  "experienceLevel": "intermediate",
  "roleType": "developer",
  "learningGoals": "...",
  "interestedTagIds": [1, 2],
  "preferredCategoryIds": [3]
}
```

## Enrollment Routes (Protected)
```
GET  /api/enrollments
POST /api/enrollments  { courseId }
PUT  /api/enrollments/:id  { completedLessonId?, progress?, status? }
```

## Task Routes (Protected)
```
GET    /api/tasks   ?type=ARTICLE|COURSE&ownershipType=OWNED|REVIEWING|CONTRIBUTED
GET    /api/tasks/:id
POST   /api/tasks
PUT    /api/tasks/:id
DELETE /api/tasks/:id
```

## Tag Routes
```
GET    /api/tags            (public)
POST   /api/tags            (protected)
DELETE /api/tags/:id        (protected)
```

## Learning Path Routes
```
GET    /api/learning-paths      (public)
GET    /api/learning-paths/:id  (public)
POST   /api/learning-paths      (protected)
PUT    /api/learning-paths/:id
DELETE /api/learning-paths/:id
PUT    /api/learning-paths/:id/courses  { courses: [{ courseId, sortOrder }] }
```

## Notification Routes (Protected)
```
GET    /api/notifications
PATCH  /api/notifications/:id/read
PATCH  /api/notifications/read-all
```

## Analytics Routes (Protected, Admin)
```
GET /api/analytics/dashboard
```

## Settings Routes (Protected, Admin)
```
GET  /api/settings
PUT  /api/settings
POST /api/settings/test-storage
GET  /api/features    (public)
```

## GraphQL (Public)
```
POST /graphql   { query: "{ articles { id title } }" }
# Content browsing only — no mutations
```

## DTO Shapes (Key Examples)

### CMS Create
```json
{
  "type": "ARTICLE",
  "categoryId": 1,
  "title": "My Article",
  "description": "...",
  "body": "...",
  "articleType": "STANDARD",
  "thumbnailUrl": "..."
}
```

### User Profile Upsert
```json
{
  "name": "Developer Profile",
  "experienceLevel": "intermediate",
  "roleType": "developer",
  "learningGoals": "...",
  "onboardingCompleted": true,
  "interestedTagIds": [1, 2, 3],
  "preferredCategoryIds": [4, 5]
}
```
