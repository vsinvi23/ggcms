# React UI - Complete API Requirements

**Generated:** March 30, 2026  
**Source:** `role-realm-react` API Services

---

## 📋 Complete API Endpoint List

### 🔐 Authentication APIs

#### 1. Login
- **Endpoint:** `POST /api/users/login`
- **Payload:**
  ```json
  {
    "email": "string",
    "password": "string"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "message": "Login successful",
    "data": {
      "userId": 1,
      "email": "user@example.com",
      "token": "jwt-token-here"
    }
  }
  ```

#### 2. Register
- **Endpoint:** `POST /api/users/register`
- **Payload:**
  ```json
  {
    "email": "string",
    "password": "string",
    "name": "string",
    "mobileNo": "string (optional)"
  }
  ```
- **Response:** Same as login

---

### 👥 User Management APIs

#### 3. Get Users (Paginated)
- **Endpoint:** `GET /api/users?page=0&size=10`
- **Response:**
  ```json
  {
    "success": true,
    "message": "Users retrieved",
    "data": {
      "items": [
        {
          "id": 1,
          "email": "string",
          "name": "string",
          "mobileNo": "string",
          "status": "ACTIVE",
          "lastLogin": "2026-03-30T12:00:00Z",
          "createdAt": "2026-01-01T00:00:00Z",
          "groups": ["Group Name 1", "Group Name 2"]
        }
      ],
      "totalElements": 100,
      "currentPage": 0,
      "pageSize": 10
    }
  }
  ```

#### 4. Get User by ID
- **Endpoint:** `GET /api/users/:id`
- **Response:**
  ```json
  {
    "success": true,
    "message": "User retrieved",
    "data": {
      "id": 1,
      "email": "string",
      "name": "string",
      "mobileNo": "string",
      "status": "ACTIVE",
      "lastLogin": "2026-03-30T12:00:00Z",
      "createdAt": "2026-01-01T00:00:00Z",
      "groups": ["Group Name"]
    }
  }
  ```

#### 5. Get User Groups
- **Endpoint:** `GET /api/users/:id/groups`
- **Response:**
  ```json
  {
    "success": true,
    "message": "Groups retrieved",
    "data": [
      {
        "id": 1,
        "name": "string",
        "users": [...]
      }
    ]
  }
  ```

#### 6. Delete User (Admin)
- **Endpoint:** `DELETE /api/admin/users/:id`
- **Response:**
  ```json
  {
    "success": true,
    "message": "User deleted",
    "data": null
  }
  ```

#### 7. Deactivate User (Admin)
- **Endpoint:** `POST /api/admin/users/:id/deactivate`
- **Response:**
  ```json
  {
    "success": true,
    "message": "User deactivated",
    "data": null
  }
  ```

#### 8. Activate User (Admin)
- **Endpoint:** `POST /api/admin/users/:id/activate`
- **Response:**
  ```json
  {
    "success": true,
    "message": "User activated",
    "data": null
  }
  ```

---

### 👨‍👩‍👧‍👦 Group Management APIs

#### 9. Get Groups (Paginated)
- **Endpoint:** `GET /api/groups?page=0&size=10`
- **Response:**
  ```json
  {
    "success": true,
    "message": "Groups retrieved",
    "data": {
      "items": [
        {
          "id": 1,
          "name": "string",
          "users": [
            {
              "id": 1,
              "name": "string",
              "email": "string"
            }
          ]
        }
      ],
      "totalElements": 50,
      "currentPage": 0,
      "pageSize": 10
    }
  }
  ```

#### 10. Get Group by ID
- **Endpoint:** `GET /api/groups/:id`
- **Response:**
  ```json
  {
    "success": true,
    "message": "Group retrieved",
    "data": {
      "id": 1,
      "name": "string",
      "users": [...]
    }
  }
  ```

#### 11. Create Group
- **Endpoint:** `POST /api/groups`
- **Payload:**
  ```json
  {
    "name": "string"
  }
  ```
- **Response:** Same structure as Get Group

#### 12. Update Group
- **Endpoint:** `PUT /api/groups/:id`
- **Payload:**
  ```json
  {
    "name": "string"
  }
  ```
- **Response:** Same structure as Get Group

#### 13. Delete Group
- **Endpoint:** `DELETE /api/groups/:id`
- **Response:**
  ```json
  {
    "success": true,
    "message": "Group deleted",
    "data": null
  }
  ```

#### 14. Get Group Members
- **Endpoint:** `GET /api/groups/:id/members`
- **Response:**
  ```json
  {
    "success": true,
    "message": "Members retrieved",
    "data": [
      {
        "id": 1,
        "name": "string",
        "email": "string"
      }
    ]
  }
  ```

#### 15. Add Group Member
- **Endpoint:** `POST /api/groups/:id/members`
- **Payload:**
  ```json
  {
    "userId": 1
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "message": "Member added",
    "data": null
  }
  ```

#### 16. Remove Group Member
- **Endpoint:** `DELETE /api/groups/:id/members/:userId`
- **Response:**
  ```json
  {
    "success": true,
    "message": "Member removed",
    "data": null
  }
  ```

---

### 📂 Category Management APIs

#### 17. Get All Categories (Tree Structure)
- **Endpoint:** `GET /api/categories`
- **Response:**
  ```json
  {
    "success": true,
    "message": "Categories retrieved",
    "data": [
      {
        "id": 1,
        "name": "string",
        "parentId": null,
        "children": [
          {
            "id": 2,
            "name": "string",
            "parentId": 1,
            "children": []
          }
        ]
      }
    ]
  }
  ```

#### 18. Get Categories (Paginated)
- **Endpoint:** `GET /api/categories?page=0&size=10`
- **Response:**
  ```json
  {
    "success": true,
    "message": "Categories retrieved",
    "data": {
      "items": [...],
      "totalElements": 25,
      "page": 0,
      "size": 10
    }
  }
  ```

#### 19. Get Category by ID
- **Endpoint:** `GET /api/categories/:id`
- **Response:**
  ```json
  {
    "success": true,
    "message": "Category retrieved",
    "data": {
      "id": 1,
      "name": "string",
      "parentId": null,
      "children": [...]
    }
  }
  ```

#### 20. Create Category
- **Endpoint:** `POST /api/categories`
- **Payload:**
  ```json
  {
    "name": "string",
    "parentId": 1 // or null
  }
  ```
- **Response:** Same as Get Category

#### 21. Update Category
- **Endpoint:** `PUT /api/categories/:id`
- **Payload:**
  ```json
  {
    "name": "string",
    "parentId": 1 // or null
  }
  ```
- **Response:** Same as Get Category

#### 22. Delete Category
- **Endpoint:** `DELETE /api/categories/:id`
- **Response:**
  ```json
  {
    "success": true,
    "message": "Category deleted",
    "data": null
  }
  ```

---

### 📝 Unified CMS APIs (CRITICAL)

#### 23. Get All CMS Items (Paginated)
- **Endpoint:** `GET /api/cms?page=0&size=10`
- **Response:**
  ```json
  {
    "success": true,
    "message": "CMS items retrieved",
    "data": {
      "items": [
        {
          "id": 1,
          "type": "ARTICLE",
          "categoryId": 1,
          "createdBy": 1,
          "reviewerId": 2,
          "reviewerName": "Reviewer Name",
          "reviewerComment": "Looks good",
          "status": "PUBLISHED",
          "title": "Article Title",
          "description": "Description",
          "bodyLocation": "/storage/body/1.html",
          "bodyUrl": "http://localhost:8080/api/cms/1/body",
          "contentLocation": "/storage/content/1.pdf",
          "contentUrl": "http://localhost:8080/api/cms/1/content",
          "thumbnailLocation": "/storage/thumbnails/1.jpg",
          "thumbnailUrl": "http://localhost:8080/api/cms/1/thumbnail",
          "attachments": [
            {
              "name": "attachment.pdf",
              "url": "http://localhost:8080/api/cms/1/attachments/attachment.pdf",
              "mimeType": "application/pdf",
              "size": 1024
            }
          ],
          "createdAt": "2026-01-01T00:00:00Z",
          "updatedAt": "2026-03-30T12:00:00Z",
          "publishedAt": "2026-03-25T10:00:00Z",
          "version": 3,
          "updatedBy": 1
        }
      ],
      "totalElements": 150,
      "currentPage": 0,
      "pageSize": 10
    }
  }
  ```

#### 24. Get CMS Item by ID
- **Endpoint:** `GET /api/cms/:id`
- **Response:** Same structure as above (single item)

#### 25. Create CMS Item
- **Endpoint:** `POST /api/cms`
- **Payload:**
  ```json
  {
    "type": "ARTICLE",
    "categoryId": 1,
    "createdBy": 1,
    "title": "string",
    "description": "string"
  }
  ```
- **Response:** Same as Get CMS Item

#### 26. Update CMS Item
- **Endpoint:** `PUT /api/cms/:id`
- **Payload:**
  ```json
  {
    "type": "ARTICLE",
    "categoryId": 1,
    "title": "string",
    "description": "string"
  }
  ```
- **Response:** Same as Get CMS Item

#### 27. Delete CMS Item
- **Endpoint:** `DELETE /api/cms/:id`
- **Response:**
  ```json
  {
    "success": true,
    "message": "CMS item deleted",
    "data": null
  }
  ```

#### 28. Upload Body Content (HTML)
- **Endpoint:** `POST /api/cms/:id/body`
- **Payload:** 
  - JSON: `{ "content": "<html>...</html>" }`
  - OR Multipart: `file: HTMLFile`
- **Response:** Same as Get CMS Item (updated)

#### 29. Download Body Content
- **Endpoint:** `GET /api/cms/:id/body`
- **Response:** HTML string (Content-Type: text/html)

#### 30. Upload Content File
- **Endpoint:** `POST /api/cms/:id/upload`
- **Payload:** Multipart form-data with `file` field
- **Response:** Same as Get CMS Item (updated)

#### 31. Download Content File
- **Endpoint:** `GET /api/cms/:id/content`
- **Response:** Binary file download

#### 32. Upload Thumbnail
- **Endpoint:** `POST /api/cms/:id/thumbnail`
- **Payload:** Multipart form-data with `file` field
- **Response:** Same as Get CMS Item (updated)

#### 33. Get Thumbnail
- **Endpoint:** `GET /api/cms/:id/thumbnail`
- **Response:** Image file

#### 34. Download Attachment
- **Endpoint:** `GET /api/cms/:id/attachments/:name`
- **Response:** Binary file download

#### 35. Submit for Review
- **Endpoint:** `POST /api/cms/:id/submit`
- **Payload:**
  ```json
  {
    "userId": 1
  }
  ```
- **Response:** Same as Get CMS Item (status changed to REVIEW)

#### 36. Publish CMS Item
- **Endpoint:** `POST /api/cms/:id/publish`
- **Payload:**
  ```json
  {
    "userId": 1
  }
  ```
- **Response:** Same as Get CMS Item (status changed to PUBLISHED)

#### 37. Send Back to Draft
- **Endpoint:** `POST /api/cms/:id/send-back`
- **Payload:**
  ```json
  {
    "reviewerId": 2,
    "comment": "Please fix the typos"
  }
  ```
- **Response:** Same as Get CMS Item (status changed to DRAFT)

---

### 🖼️ Media/Upload APIs

#### 38. Upload Media (for Rich Editor)
- **Endpoint:** `POST /api/media/upload`
- **Payload:** Multipart form-data with `file` field
- **Response:**
  ```json
  {
    "success": true,
    "message": "File uploaded",
    "data": {
      "url": "http://localhost:8080/api/media/filename.jpg",
      "filename": "filename.jpg",
      "size": 102400,
      "mimeType": "image/jpeg"
    }
  }
  ```

#### 39. Get Media File
- **Endpoint:** `GET /api/media/:filename`
- **Response:** Binary file

---

### 🌐 Public CMS APIs (Unauthenticated)

#### 40. Get Published CMS Items
- **Endpoint:** `GET /public/cms?page=0&size=10&type=ARTICLE`
- **Query Params:**
  - `page`: number (optional)
  - `size`: number (optional)
  - `type`: ARTICLE | COURSE | VIDEO (optional)
- **Response:**
  ```json
  {
    "success": true,
    "message": "Public CMS items retrieved",
    "data": {
      "items": [...],  // Only PUBLISHED items
      "total": 100,
      "currentPage": 0,
      "pageSize": 10
    }
  }
  ```

#### 41. Get Published CMS Item by ID
- **Endpoint:** `GET /public/cms/:id`
- **Response:** Same as authenticated Get CMS Item (only if PUBLISHED)

#### 42. Get Public Body Content
- **Endpoint:** `GET /public/cms/:id/body`
- **Response:** HTML string

#### 43. Get Public Thumbnail
- **Endpoint:** `GET /public/cms/:id/thumbnail`
- **Response:** Image file

#### 44. Get Public Attachment
- **Endpoint:** `GET /public/cms/:id/attachments/:name`
- **Response:** Binary file

---

## 📊 API Summary by Feature

| Feature | Endpoint Count | Critical |
|---------|---------------|----------|
| Authentication | 2 | ✅ Yes |
| User Management | 6 | ⚠️ Medium |
| Group Management | 8 | ⚠️ Medium |
| Category Management | 6 | ⚠️ Medium |
| **Unified CMS** | **15** | **✅ Yes** |
| Media Upload | 2 | ✅ Yes |
| Public CMS | 5 | ⚠️ Medium |
| **TOTAL** | **44** | - |

---

## 🔑 Key Characteristics

### Response Format Standard
All endpoints return:
```json
{
  "success": boolean,
  "message": string,
  "data": T | null
}
```

### Pagination Format
Paginated endpoints use:
```json
{
  "items": T[],
  "totalElements": number,
  "currentPage": number,
  "pageSize": number
}
```

### Query Parameters
- Pagination: `?page=0&size=10`
- Page is 0-indexed
- Default size is 10

### Authentication
- JWT token in Authorization header: `Bearer <token>`
- Token obtained from login/register
- Stored in sessionStorage

---

## 🎯 Critical Missing Features in Strapi

1. **Unified CMS Endpoint** - Most critical gap
2. **Custom Workflow APIs** - submit, publish, send-back
3. **Group Member Management** - add/remove members
4. **User Activation/Deactivation** - admin user management
5. **Custom Response Format** - ApiResponse wrapper
6. **Public CMS Endpoints** - unauthenticated access
7. **File Storage Management** - body/content/thumbnail as files
8. **Custom Pagination** - page/size format

---

## 💡 Implementation Priority

### P0 - Must Have (Week 1)
1. Auth adapter (login/register)
2. Response format middleware
3. Basic CMS read operations
4. Category listing

### P1 - High Priority (Week 2)
5. Unified CMS CRUD
6. Workflow APIs (submit/publish)
7. User/Group basic APIs
8. Media upload adapter

### P2 - Medium Priority (Week 3-4)
9. Group member management
10. User activation/deactivation
11. Public CMS endpoints
12. File storage for body/content

### P3 - Nice to Have (Future)
13. Advanced filtering
14. Search functionality
15. Analytics
16. Versioning

---

**This is the complete API contract that the React UI expects from the backend!**
