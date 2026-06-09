# React UI ↔ Strapi Backend Integration - Gap Analysis

**Generated:** March 30, 2026  
**Frontend:** Role Realm React (Custom CMS UI)  
**Backend:** Strapi v5.35.0

---

## 🎯 Executive Summary

The React UI (`role-realm-react`) is designed for a **custom Spring Boot-style REST API** backend, while the Strapi backend provides a **different API structure and paradigm**. Significant integration work is required to bridge these differences.

### Key Findings:
- ❌ **API Endpoint Mismatch**: React expects `/api/users`, `/api/groups`, `/api/cms` but Strapi uses `/api/articles`, `/api/courses`, etc.
- ❌ **Response Format Mismatch**: React expects `ApiResponse<T>` wrapper; Strapi uses `{ data, meta }` structure
- ❌ **Authentication Mismatch**: React expects `/api/users/login`; Strapi uses `/api/auth/local`
- ⚠️ **Unified CMS Endpoint**: React expects single `/api/cms` for all content; Strapi separates articles/courses
- ⚠️ **Custom Workflow APIs**: React expects custom workflow endpoints not available in Strapi

---

## 📊 Detailed API Comparison

### 1. Authentication & User Management

| React UI Expects | Strapi Provides | Status |
|-----------------|-----------------|--------|
| `POST /api/users/login` | `POST /api/auth/local` | ❌ Missing |
| `POST /api/users/register` | `POST /api/auth/local/register` | ❌ Different path |
| `GET /api/users?page=0&size=10` | `GET /api/users-permissions/users` (admin only) | ⚠️ Needs custom controller |
| `GET /api/users/:id` | `GET /api/users/:id` | ⚠️ Needs permissions config |
| `GET /api/users/:id/groups` | No direct endpoint | ❌ Missing |
| `DELETE /api/admin/users/:id` | `DELETE /api/users/:id` | ⚠️ Different path |
| `POST /api/admin/users/:id/activate` | No direct endpoint | ❌ Missing |
| `POST /api/admin/users/:id/deactivate` | No direct endpoint | ❌ Missing |

**Response Format Expected:**
```json
{
  "success": boolean,
  "message": string,
  "data": {
    "userId": number,
    "email": string,
    "token": string
  }
}
```

**Strapi Provides:**
```json
{
  "jwt": string,
  "user": {
    "id": number,
    "email": string,
    "username": string
  }
}
```

---

### 2. Groups/User Groups Management

| React UI Expects | Strapi Provides | Status |
|-----------------|-----------------|--------|
| `GET /api/groups?page=0&size=10` | `GET /api/user-groups` | ⚠️ Needs pagination |
| `GET /api/groups/:id` | `GET /api/user-groups/:id` | ⚠️ Needs population |
| `POST /api/groups` | `POST /api/user-groups` | ⚠️ Needs controller |
| `PUT /api/groups/:id` | `PUT /api/user-groups/:id` | ⚠️ Needs controller |
| `DELETE /api/groups/:id` | `DELETE /api/user-groups/:id` | ⚠️ Needs controller |
| `GET /api/groups/:id/members` | No direct endpoint | ❌ Missing |
| `POST /api/groups/:id/members` | No direct endpoint | ❌ Missing |
| `DELETE /api/groups/:id/members/:userId` | No direct endpoint | ❌ Missing |

**Gap:** Group member management APIs need to be created.

---

### 3. Categories Management

| React UI Expects | Strapi Provides | Status |
|-----------------|-----------------|--------|
| `GET /api/categories` (flat list with nested children) | `GET /api/categories` | ✅ Available (needs custom controller for nesting) |
| `GET /api/categories?page=0&size=10` | `GET /api/categories` with Strapi pagination | ⚠️ Needs pagination wrapper |
| `GET /api/categories/:id` | `GET /api/categories/:id` | ✅ Available |
| `POST /api/categories` | `POST /api/categories` | ✅ Available |
| `PUT /api/categories/:id` | `PUT /api/categories/:id` | ✅ Available |
| `DELETE /api/categories/:id` | `DELETE /api/categories/:id` | ✅ Available |

**Gap:** Category response needs to build hierarchical tree structure.

---

### 4. Unified CMS Endpoints (Critical Gap!)

The React UI expects a **unified `/api/cms` endpoint** that handles all content types (ARTICLE, VIDEO, COURSE). Strapi separates these into different content types.

| React UI Expects | Strapi Equivalent | Status |
|-----------------|-------------------|--------|
| `GET /api/cms?page=0&size=10` | N/A - need to aggregate `/api/articles` + `/api/courses` | ❌ Missing |
| `GET /api/cms/:id` | N/A - need to determine type first | ❌ Missing |
| `POST /api/cms` (with type: ARTICLE\|COURSE\|VIDEO) | `/api/articles` OR `/api/courses` | ❌ Missing unified endpoint |
| `PUT /api/cms/:id` | N/A | ❌ Missing |
| `DELETE /api/cms/:id` | N/A | ❌ Missing |
| `POST /api/cms/:id/body` | No direct equivalent | ❌ Missing |
| `GET /api/cms/:id/body` | Use richtext field | ⚠️ Different approach |
| `POST /api/cms/:id/upload` | Upload via media library | ⚠️ Different approach |
| `POST /api/cms/:id/thumbnail` | Part of create/update | ⚠️ Different approach |
| `GET /api/cms/:id/thumbnail` | Media URL in response | ⚠️ Different approach |
| `POST /api/cms/:id/submit` | No direct endpoint | ❌ Missing |
| `POST /api/cms/:id/publish` | Built-in publish action | ⚠️ Different approach |
| `POST /api/cms/:id/send-back` | No direct endpoint | ❌ Missing |

**Expected CMS Type Schema:**
```typescript
{
  type: 'ARTICLE' | 'VIDEO' | 'COURSE',
  categoryId: number,
  title: string,
  description: string,
  status: 'DRAFT' | 'REVIEW' | 'PUBLISHED',
  bodyLocation: string,  // File storage location
  contentLocation: string,  // Media file location
  thumbnailLocation: string,
  attachments: AttachmentDto[]
}
```

**Strapi Has:**
- Separate `article` and `course` content types
- Built-in `publishedAt` instead of custom status
- Media handled via Strapi's upload plugin
- Rich text stored directly in database

---

### 5. Media/Upload Management

| React UI Expects | Strapi Provides | Status |
|-----------------|-----------------|--------|
| `POST /api/media/upload` | `POST /api/upload` | ⚠️ Different path |
| `GET /api/media/:filename` | `GET /uploads/:filename` | ⚠️ Different path |

**Gap:** Media service expects specific response format with `{ url, filename, size, mimeType }`.

---

### 6. Public CMS Endpoints

| React UI Expects | Strapi Provides | Status |
|-----------------|-----------------|--------|
| `GET /public/cms?page=0&size=10&type=ARTICLE` | N/A | ❌ Missing |
| `GET /public/cms/:id` | N/A | ❌ Missing |
| `GET /public/cms/:id/body` | N/A | ❌ Missing |
| `GET /public/cms/:id/thumbnail` | N/A | ❌ Missing |

**Gap:** Public endpoints need to be created (unauthenticated access to published content).

---

## 📋 Content Type Mapping

### React UI Data Models → Strapi Content Types

| React UI Type | Strapi Content Type | Mapping Status |
|--------------|---------------------|----------------|
| `CmsResponseDto` (ARTICLE) | `article` | ⚠️ Partial - needs adapter |
| `CmsResponseDto` (COURSE) | `course` | ⚠️ Partial - needs adapter |
| `CmsResponseDto` (VIDEO) | Could use `article` with type field | ❌ Not implemented |
| `CategoryResponseDto` | `category` | ✅ Good match |
| `UserDto` | `user` (users-permissions) | ⚠️ Partial - different fields |
| `GroupResponseDto` | `user-group` | ✅ Good match |
| `AttachmentDto` | `attachment` | ✅ Good match |

---

## 🔍 Schema Differences

### User Schema Comparison

**React UI Expects:**
```typescript
{
  id: number,
  email: string,
  name: string,
  mobileNo?: string,
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'DEACTIVATED',
  lastLogin: string | null,
  createdAt: string,
  groups: string[]  // Group names
}
```

**Strapi Has:**
```json
{
  "id": number,
  "email": string,
  "username": string,
  "name": string,
  "status": "active" | "deactivated" | "invited",
  "lastLogin": datetime,
  "blocked": boolean,
  "confirmed": boolean,
  "groups": [{ id, name, ... }]  // Full objects
}
```

**Gaps:**
- ❌ No `mobileNo` field in Strapi
- ⚠️ Status enum values differ
- ⚠️ Groups returned as objects, not string array

### Category Schema Comparison

**React UI Expects:**
```typescript
{
  id: number,
  name: string,
  parentId: number | null,
  children?: CategoryResponseDto[]
}
```

**Strapi Has:**
```json
{
  "id": number,
  "name": string,
  "slug": string,
  "description": string,
  "order": number,
  "parent": { id, name, ... },
  "children": [{ id, name, ... }],
  "userGroups": [...],
  "publishedAt": datetime
}
```

**Gaps:**
- ✅ Good match - just needs response transformation
- ⚠️ Need to convert `parent` object to `parentId`
- ⚠️ Need to recursively build children tree

### CMS/Article Schema Comparison

**React UI Expects (CmsResponseDto):**
```typescript
{
  id: number,
  type: 'ARTICLE' | 'VIDEO' | 'COURSE',
  categoryId: number,
  createdBy: number,
  reviewerId: number | null,
  reviewerName: string | null,
  reviewerComment: string | null,
  status: 'DRAFT' | 'REVIEW' | 'PUBLISHED',
  title: string | null,
  description: string | null,
  bodyLocation: string | null,  // File path
  bodyUrl?: string | null,
  contentLocation: string | null,
  contentUrl?: string | null,
  thumbnailLocation: string | null,
  thumbnailUrl?: string | null,
  attachments: AttachmentDto[] | null,
  createdAt: string,
  updatedAt: string | null,
  publishedAt: string | null
}
```

**Strapi Has (Article):**
```json
{
  "id": number,
  "title": string,
  "slug": string,
  "excerpt": string,
  "content": "richtext",  // Stored in DB
  "thumbnail": { id, url, ... },  // Media object
  "status": "draft" | "submitted" | "in_review" | "approved" | "published" | "rejected",
  "author": { id, email, ... },
  "category": { id, name, ... },
  "tags": [...],
  "attachments": [...],
  "createdAt": datetime,
  "updatedAt": datetime,
  "publishedAt": datetime
}
```

**Critical Gaps:**
- ❌ No `type` field (ARTICLE/VIDEO/COURSE distinction)
- ❌ No file storage locations (`bodyLocation`, `contentLocation`, `thumbnailLocation`)
- ⚠️ Content stored as richtext in DB, not as file
- ❌ No `reviewerId`, `reviewerName`, `reviewerComment` fields
- ⚠️ Different status workflow

---

## 🛠️ Required Implementation Work

### Phase 1: Critical Adapters (Must Have)

#### 1.1 Authentication Adapter
- [ ] Create custom route: `POST /api/users/login` → calls Strapi auth + returns ApiResponse format
- [ ] Create custom route: `POST /api/users/register` → calls Strapi register + returns ApiResponse format
- [ ] Transform JWT response to match expected format

#### 1.2 Unified CMS Controller
- [ ] Create `/api/cms` custom endpoint
- [ ] Implement type-based routing (ARTICLE → articles, COURSE → courses)
- [ ] Create adapter methods for CRUD operations
- [ ] Implement file upload/download for body, content, thumbnail
- [ ] Create workflow methods (submit, publish, send-back)

#### 1.3 Response Format Wrapper
- [ ] Create middleware to wrap all responses in ApiResponse format
- [ ] Transform Strapi pagination to PagedResponse format

### Phase 2: User & Group Management

#### 2.1 User Management APIs
- [ ] `GET /api/users` with pagination
- [ ] `GET /api/users/:id/groups` 
- [ ] `POST /api/admin/users/:id/activate`
- [ ] `POST /api/admin/users/:id/deactivate`
- [ ] Add `mobileNo` field to user schema

#### 2.2 Group Management APIs
- [ ] `GET /api/groups/:id/members`
- [ ] `POST /api/groups/:id/members`
- [ ] `DELETE /api/groups/:id/members/:userId`
- [ ] Custom controllers for all group endpoints with proper response format

### Phase 3: Category Management

#### 3.1 Category Tree Builder
- [ ] Create controller to return hierarchical category tree
- [ ] Transform parent object to parentId
- [ ] Recursive children population

### Phase 4: Public Endpoints

#### 4.1 Public CMS Access
- [ ] Create `/public/cms` routes (no auth required)
- [ ] Filter to only published content
- [ ] Public body/thumbnail/attachment endpoints

### Phase 5: Content Type Extensions

#### 5.1 Article Schema Extensions
- [ ] Add `reviewerId`, `reviewerName`, `reviewerComment` fields
- [ ] Consider adding `type` field if videos should be articles
- [ ] Add relations to reviewer users

#### 5.2 Course Schema Extensions
- [ ] Ensure course has same workflow fields as articles

---

## 🎨 Integration Approaches

### Option 1: Custom Strapi Controllers (Recommended)
**Pros:**
- Keep Strapi as backend
- Leverage Strapi's admin panel
- Maintain existing content types

**Cons:**
- Significant custom controller development
- Ongoing maintenance of custom code
- May complicate Strapi upgrades

**Effort:** High (2-3 weeks)

### Option 2: Modify React UI to Use Strapi APIs
**Pros:**
- Use Strapi's standard APIs
- Less backend customization
- Easier to maintain

**Cons:**
- Major React UI refactoring required
- Need to update all service layer
- Lose some custom workflow features

**Effort:** High (3-4 weeks)

### Option 3: API Gateway/Proxy Layer
**Pros:**
- Clean separation of concerns
- Can transform requests/responses
- Easy to swap backends later

**Cons:**
- Additional infrastructure complexity
- Extra deployment/maintenance
- Performance overhead

**Effort:** Medium (1-2 weeks setup + custom logic)

### Option 4: Hybrid Approach (Recommended for MVP)
**Pros:**
- Quick wins with minimal changes
- Incremental migration
- Can test both approaches

**Implementation:**
1. Create custom controllers for critical missing endpoints
2. Use response transformers/serializers
3. Gradually migrate UI components to Strapi structure

**Effort:** Medium (2 weeks for MVP)

---

## 🚨 Breaking Changes Required

### Must Change in Backend:
1. ✅ Add custom authentication routes with ApiResponse wrapper
2. ✅ Create unified `/api/cms` endpoint with type-based routing
3. ✅ Implement workflow APIs (submit, publish, send-back)
4. ✅ Add group member management APIs
5. ✅ Create public CMS endpoints
6. ⚠️ Consider adding schema fields (reviewerId, mobileNo, etc.)

### OR Must Change in Frontend:
1. ✅ Update auth service to use `/api/auth/local`
2. ✅ Split CMS service into separate article/course services
3. ✅ Update response handling (remove ApiResponse wrapper)
4. ✅ Update pagination structure
5. ✅ Handle Strapi's media upload differently
6. ✅ Rewrite workflow management

---

## 📈 Recommended Next Steps

1. **Decision Point:** Choose integration approach (I recommend Option 4 - Hybrid)

2. **Quick Win Priority:**
   - [ ] Auth adapter (critical for login)
   - [ ] Response format middleware
   - [ ] Basic CMS CRUD (read articles/courses)
   - [ ] Category listing

3. **Detailed Planning:**
   - Map each React component to required APIs
   - Identify which can work with Strapi as-is
   - Identify which need custom controllers

4. **Create Implementation Plan:**
   - Backend: Custom controllers/routes to create
   - Frontend: Services to modify
   - Schema migrations needed
   - Testing strategy

---

## 📋 Summary Statistics

| Metric | Count |
|--------|-------|
| Total API Endpoints Expected | ~45 |
| Strapi Provides (out of box) | ~15 |
| Need Custom Controllers | ~20 |
| Need Schema Changes | ~5 |
| Critical Blockers | 3 (Auth, CMS unified endpoint, Workflow) |

**Compatibility Score: 40% ⚠️**

The React UI and Strapi backend have **significant architectural differences**. Integration will require either substantial backend customization or frontend refactoring.

---

## ❓ Questions for Decision

Before proceeding with implementation, please confirm:

1. **Integration Approach:** Which option do you prefer (1-4 above)?

2. **Content Type Strategy:**
   - Should we create a unified "CMS" content type in Strapi?
   - Or keep articles/courses separate and create adapter layer?

3. **Workflow System:**
   - Use Strapi's draft/publish or implement custom workflow?
   - Do you need the review workflow (draft → review → published)?

4. **Schema Modifications:**
   - Can we add fields to Strapi schemas (reviewerId, mobileNo, etc.)?
   - Or should we keep Strapi schemas minimal?

5. **Priority Features:**
   - Which features must work in v1?
   - Which can be added later?

6. **Authentication:**
   - Use Strapi's built-in auth with adapters?
   - Or implement completely custom auth?

---

**Ready to proceed after your decision on approach!** 🚀
