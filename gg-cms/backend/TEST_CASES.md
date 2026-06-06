# Backend API Test Cases

**Date:** March 30, 2026  
**Backend:** Strapi CMS  
**Base URL:** `http://localhost:1337/api`

---

## 📋 Test Data Setup

### 1. Create Admin User (First Time Setup)
```bash
# Start Strapi
cd backend/cms-backend
npm run develop

# Then go to: http://localhost:1337/admin
# Fill in the admin registration form:
- First name: Admin
- Last name: User
- Email: admin@example.com
- Password: Admin123!
```

### 2. Create Test Users via Strapi Admin

**Navigate to:** `Content Manager > User (users-permissions)`

#### Test User 1 - Regular User
```
Username: testuser
Email: test@example.com
Password: Test123!
Confirmed: ✅ Yes
Blocked: ❌ No
Role: Authenticated
```

#### Test User 2 - Editor
```
Username: editor
Email: editor@example.com  
Password: Editor123!
Confirmed: ✅ Yes
Blocked: ❌ No
Role: Authenticated
```

#### Test User 3 - Reviewer
```
Username: reviewer
Email: reviewer@example.com
Password: Reviewer123!
Confirmed: ✅ Yes
Blocked: ❌ No
Role: Authenticated
```

---

## 🧪 API Test Cases

### Authentication APIs

#### TC-AUTH-001: Register New User
**Endpoint:** `POST /auth/local/register`

**Request:**
```json
{
  "username": "newuser",
  "email": "newuser@example.com",
  "password": "NewUser123!"
}
```

**Expected Response (200):**
```json
{
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "newuser",
    "email": "newuser@example.com",
    "confirmed": false,
    "blocked": false
  }
}
```

**Test Steps:**
1. Send POST request with valid credentials
2. Verify JWT token is returned
3. Verify user object contains correct data
4. Verify user is created in Strapi admin

**curl Command:**
```bash
curl -X POST http://localhost:1337/api/auth/local/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "email": "newuser@example.com",
    "password": "NewUser123!"
  }'
```

---

#### TC-AUTH-002: Login with Email
**Endpoint:** `POST /auth/local`

**Request:**
```json
{
  "identifier": "test@example.com",
  "password": "Test123!"
}
```

**Expected Response (200):**
```json
{
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "testuser",
    "email": "test@example.com"
  }
}
```

**curl Command:**
```bash
curl -X POST http://localhost:1337/api/auth/local \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "test@example.com",
    "password": "Test123!"
  }'
```

---

#### TC-AUTH-003: Login with Username
**Endpoint:** `POST /auth/local`

**Request:**
```json
{
  "identifier": "testuser",
  "password": "Test123!"
}
```

**Expected Response (200):** Same as TC-AUTH-002

---

#### TC-AUTH-004: Get Current User
**Endpoint:** `GET /users/me`

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
```

**Expected Response (200):**
```json
{
  "id": 1,
  "username": "testuser",
  "email": "test@example.com",
  "confirmed": true,
  "blocked": false,
  "role": {
    "id": 1,
    "name": "Authenticated"
  }
}
```

**curl Command:**
```bash
curl -X GET http://localhost:1337/api/users/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### User Management APIs

#### TC-USER-001: Get All Users (Paginated)
**Endpoint:** `GET /users?page=0&size=10`

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
```

**Expected Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "username": "testuser",
      "email": "test@example.com",
      "groups": []
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 1
    }
  }
}
```

**curl Command:**
```bash
curl -X GET "http://localhost:1337/api/users?page=0&size=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

#### TC-USER-002: Get Single User
**Endpoint:** `GET /users/:id`

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
```

**Expected Response (200):**
```json
{
  "id": 1,
  "username": "testuser",
  "email": "test@example.com",
  "confirmed": true,
  "blocked": false
}
```

**curl Command:**
```bash
curl -X GET http://localhost:1337/api/users/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

#### TC-USER-003: Get User's Groups
**Endpoint:** `GET /users/:id/groups`

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
```

**Expected Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "name": "Developers",
      "memberCount": 5
    }
  ]
}
```

**curl Command:**
```bash
curl -X GET http://localhost:1337/api/users/1/groups \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

#### TC-USER-004: Activate User
**Endpoint:** `POST /users/:id/activate`

**Headers:**
```
Authorization: Bearer {ADMIN_JWT_TOKEN}
```

**Expected Response (200):**
```json
{
  "data": {
    "id": 1,
    "blocked": false,
    "message": "User activated successfully"
  }
}
```

**curl Command:**
```bash
curl -X POST http://localhost:1337/api/users/1/activate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

#### TC-USER-005: Deactivate User
**Endpoint:** `POST /users/:id/deactivate`

**Headers:**
```
Authorization: Bearer {ADMIN_JWT_TOKEN}
```

**Expected Response (200):**
```json
{
  "data": {
    "id": 1,
    "blocked": true,
    "message": "User deactivated successfully"
  }
}
```

---

### User Group APIs

#### TC-GROUP-001: Get All Groups
**Endpoint:** `GET /user-groups?pagination[page]=1&pagination[pageSize]=10`

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
```

**Expected Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "attributes": {
        "name": "Developers",
        "description": "Development team",
        "createdAt": "2026-03-30T10:00:00.000Z",
        "members": {
          "data": []
        }
      }
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 1
    }
  }
}
```

**curl Command:**
```bash
curl -X GET "http://localhost:1337/api/user-groups?pagination[page]=1&pagination[pageSize]=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

#### TC-GROUP-002: Create Group
**Endpoint:** `POST /user-groups`

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**Request:**
```json
{
  "data": {
    "name": "Frontend Developers",
    "description": "React and Vue.js developers"
  }
}
```

**Expected Response (200):**
```json
{
  "data": {
    "id": 2,
    "attributes": {
      "name": "Frontend Developers",
      "description": "React and Vue.js developers",
      "createdAt": "2026-03-30T10:00:00.000Z"
    }
  }
}
```

**curl Command:**
```bash
curl -X POST http://localhost:1337/api/user-groups \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "name": "Frontend Developers",
      "description": "React and Vue.js developers"
    }
  }'
```

---

#### TC-GROUP-003: Get Group Members
**Endpoint:** `GET /user-groups/:id/members`

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
```

**Expected Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "username": "testuser",
      "email": "test@example.com"
    }
  ]
}
```

**curl Command:**
```bash
curl -X GET http://localhost:1337/api/user-groups/1/members \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

#### TC-GROUP-004: Add Member to Group
**Endpoint:** `POST /user-groups/:id/members`

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**Request:**
```json
{
  "userId": 1
}
```

**Expected Response (200):**
```json
{
  "data": {
    "message": "User added to group successfully"
  }
}
```

**curl Command:**
```bash
curl -X POST http://localhost:1337/api/user-groups/1/members \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": 1}'
```

---

#### TC-GROUP-005: Remove Member from Group
**Endpoint:** `DELETE /user-groups/:groupId/members/:userId`

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
```

**Expected Response (200):**
```json
{
  "data": {
    "message": "User removed from group successfully"
  }
}
```

**curl Command:**
```bash
curl -X DELETE http://localhost:1337/api/user-groups/1/members/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### Category APIs

#### TC-CAT-001: Get All Categories (Tree)
**Endpoint:** `GET /categories?tree=true`

**Expected Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "attributes": {
        "name": "Programming",
        "slug": "programming",
        "parent": null,
        "children": {
          "data": [
            {
              "id": 2,
              "attributes": {
                "name": "JavaScript",
                "slug": "javascript",
                "parent": {
                  "data": {
                    "id": 1
                  }
                }
              }
            }
          ]
        }
      }
    }
  ]
}
```

**curl Command:**
```bash
curl -X GET "http://localhost:1337/api/categories?tree=true"
```

---

#### TC-CAT-002: Create Category
**Endpoint:** `POST /categories`

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**Request:**
```json
{
  "data": {
    "name": "DevOps",
    "slug": "devops",
    "description": "DevOps and Cloud topics"
  }
}
```

**Expected Response (200):**
```json
{
  "data": {
    "id": 3,
    "attributes": {
      "name": "DevOps",
      "slug": "devops",
      "description": "DevOps and Cloud topics"
    }
  }
}
```

**curl Command:**
```bash
curl -X POST http://localhost:1337/api/categories \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "name": "DevOps",
      "slug": "devops",
      "description": "DevOps and Cloud topics"
    }
  }'
```

---

#### TC-CAT-003: Create Subcategory
**Endpoint:** `POST /categories`

**Request:**
```json
{
  "data": {
    "name": "Docker",
    "slug": "docker",
    "parent": 3
  }
}
```

---

### Article APIs

#### TC-ART-001: Get All Articles
**Endpoint:** `GET /articles?pagination[page]=1&pagination[pageSize]=10`

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
```

**Expected Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "attributes": {
        "title": "Introduction to React",
        "slug": "intro-to-react",
        "content": "React is a JavaScript library...",
        "status": "published",
        "publishedAt": "2026-03-30T10:00:00.000Z"
      }
    }
  ]
}
```

**curl Command:**
```bash
curl -X GET "http://localhost:1337/api/articles?pagination[page]=1&pagination[pageSize]=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

#### TC-ART-002: Create Article
**Endpoint:** `POST /articles`

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**Request:**
```json
{
  "data": {
    "title": "Getting Started with TypeScript",
    "slug": "getting-started-typescript",
    "content": "TypeScript is a typed superset of JavaScript...",
    "excerpt": "Learn TypeScript basics",
    "status": "draft",
    "category": 2
  }
}
```

**curl Command:**
```bash
curl -X POST http://localhost:1337/api/articles \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "title": "Getting Started with TypeScript",
      "slug": "getting-started-typescript",
      "content": "TypeScript is a typed superset of JavaScript...",
      "status": "draft"
    }
  }'
```

---

### Course APIs

#### TC-COURSE-001: Get All Courses
**Endpoint:** `GET /courses?pagination[page]=1&pagination[pageSize]=10`

**Expected Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "attributes": {
        "title": "Full Stack Development",
        "slug": "full-stack-development",
        "description": "Complete full stack course",
        "status": "published"
      }
    }
  ]
}
```

---

#### TC-COURSE-002: Create Course
**Endpoint:** `POST /courses`

**Request:**
```json
{
  "data": {
    "title": "React Advanced Patterns",
    "slug": "react-advanced-patterns",
    "description": "Learn advanced React patterns",
    "level": "advanced",
    "duration": 40,
    "status": "draft"
  }
}
```

---

## 🔐 Authentication Flow

### Get JWT Token for Testing

1. **Register or Login:**
```bash
# Login
curl -X POST http://localhost:1337/api/auth/local \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "test@example.com",
    "password": "Test123!"
  }'
```

2. **Copy the JWT token from response**

3. **Use token in subsequent requests:**
```bash
curl -X GET http://localhost:1337/api/users/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

---

## 📊 Test Execution Checklist

### Setup Phase
- [ ] Strapi server running on port 1337
- [ ] Admin user created
- [ ] Test users created (testuser, editor, reviewer)
- [ ] Test groups created
- [ ] Test categories created

### Authentication Tests
- [ ] TC-AUTH-001: Register new user
- [ ] TC-AUTH-002: Login with email
- [ ] TC-AUTH-003: Login with username
- [ ] TC-AUTH-004: Get current user

### User Management Tests
- [ ] TC-USER-001: Get all users
- [ ] TC-USER-002: Get single user
- [ ] TC-USER-003: Get user's groups
- [ ] TC-USER-004: Activate user
- [ ] TC-USER-005: Deactivate user

### Group Management Tests
- [ ] TC-GROUP-001: Get all groups
- [ ] TC-GROUP-002: Create group
- [ ] TC-GROUP-003: Get group members
- [ ] TC-GROUP-004: Add member to group
- [ ] TC-GROUP-005: Remove member from group

### Category Tests
- [ ] TC-CAT-001: Get categories (tree)
- [ ] TC-CAT-002: Create category
- [ ] TC-CAT-003: Create subcategory

### Content Tests
- [ ] TC-ART-001: Get all articles
- [ ] TC-ART-002: Create article
- [ ] TC-COURSE-001: Get all courses
- [ ] TC-COURSE-002: Create course

---

## 🐛 Common Test Issues

### Issue: 401 Unauthorized
- **Cause:** Missing or invalid JWT token
- **Fix:** Re-login to get a fresh token

### Issue: 403 Forbidden
- **Cause:** User doesn't have permission
- **Fix:** Check role permissions in Strapi admin

### Issue: 400 Bad Request
- **Cause:** Invalid request payload
- **Fix:** Check request format matches schema

### Issue: 404 Not Found
- **Cause:** Resource doesn't exist
- **Fix:** Verify ID exists in database

---

## 📝 Notes

- Replace `YOUR_JWT_TOKEN` with actual JWT from login
- Replace `:id`, `:groupId`, `:userId` with actual IDs
- All timestamps are in ISO 8601 format
- Pagination is 1-based for Strapi (page starts at 1)

---

**Last Updated:** March 30, 2026
