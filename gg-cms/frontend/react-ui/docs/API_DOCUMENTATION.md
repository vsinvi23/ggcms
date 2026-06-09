User Management Service - API Documentation

Base URL
- https://api.yourdomain.com/v1  (replace with your actual base URL)

Authentication
- Type: JWT (RS256)
- How to get a token: POST /api/auth/login with email/password (see Auth section). The server signs JWTs with an RSA private key (RS256). Clients must send Authorization: Bearer <token> on protected endpoints.
- Public Key: the server exposes/uses a public RSA key to verify tokens. (In this repo keys are under src/main/resources/keys/; do not distribute private key.)

Overview / Important notes
- All endpoints (except /api/auth/**) are protected by JWT Bearer authorization.
- Swagger/OpenAPI UI available when running the app: /swagger-ui/index.html and raw OpenAPI JSON at /v3/api-docs.
- Use the Authorize button in Swagger UI and paste: Bearer <token> to call protected endpoints.

Quick examples
- Sign up (create user)
  POST /api/auth/signup
  Request JSON:
  {
    "name":"Alice",
    "email":"alice@example.com",
    "password":"secret123",
    "status":"ACTIVE"
  }
  Responses:
  - 201 Created: no body (user created)
  - 409 Conflict: email already exists

- Login (get token)
  POST /api/auth/login
  Request JSON:
  {
    "email":"alice@example.com",
    "password":"secret123"
  }
  Response 200:
  {
    "token":"eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  }

- Using the token
  - Add header: Authorization: Bearer <token>
  - Example: GET /api/users (requires token)

Full endpoint list (paths, methods, request/response examples)

1) Authentication
- POST /api/auth/signup
  - Description: Create a new user account.
  - Request: AuthDto.Signup
    {
      "name": "Alice",
      "email": "alice@example.com",
      "password": "secret123",
      "status": "ACTIVE"
    }
  - Responses:
    - 201 Created
    - 409 Conflict

- POST /api/auth/login
  - Description: Login and obtain JWT.
  - Request: AuthDto.Login
    {
      "email": "alice@example.com",
      "password": "secret123"
    }
  - Responses:
    - 200 OK: { "token": "<jwt>" }
    - 401 Unauthorized

2) Users
- POST /api/users
  - Create a user (protected)
  - Request: UserDto.Request
    {
      "name": "Alice",
      "email": "alice@example.com",
      "password": "secret123",
      "status": "ACTIVE"
    }
  - Response 201: UserDto.Response
    {
      "id": "uuid",
      "name": "Alice",
      "email": "alice@example.com",
      "status": "ACTIVE",
      "lastLogin": null,
      "createdAt": "2025-12-16T..."
    }

- PUT /api/users/{userId}
  - Update a user (protected)
  - Request: same as UserDto.Request
  - Response: 200 UserDto.Response

- GET /api/users/{userId}
  - Get user by id (protected)
  - Response: 200 UserDto.Response

- GET /api/users
  - List users with paging and optional filters (protected)
  - Query params: page (int, default 0), size (int, default 10), status (optional), search (optional)
  - Response: 200 PageResponse<UserDto.Response>

- DELETE /api/users/{userId}
  - Delete user (protected)
  - Response: 204 No Content

3) Roles
- POST /api/roles
  - Create role (protected)
  - Request RoleDto.Request { "name": "admin", "system": false }
  - Response 201 RoleDto.Response

- PUT /api/roles/{roleId}
  - Update a role (protected)
  - Response 200 RoleDto.Response

- GET /api/roles/{roleId}
  - Response 200 RoleDto.Response

- GET /api/roles
  - Response 200 List<RoleDto.Response>

- DELETE /api/roles/{roleId}
  - Response 204

4) Permissions
- POST /api/permissions
  - Create permission (protected)
  - Request PermissionDto.Request
    {
      "module": "users",
      "view": true,
      "create": true,
      "edit": false,
      "delete": false,
      "publish": false,
      "manage": false
    }
  - Response 201 PermissionDto.Response

- PUT /api/permissions/{permissionId}
  - Update permission (protected)
  - Response 200 PermissionDto.Response

- GET /api/permissions/{permissionId}
  - Response 200 PermissionDto.Response

- GET /api/permissions
  - Response 200 List<PermissionDto.Response>

- DELETE /api/permissions/{permissionId}
  - Response 204

5) Role-Permission mappings
- POST /api/role-permissions/roles/{roleId}/permissions/{permissionId}
  - Assign permission to role (protected), 204 No Content

- DELETE /api/role-permissions/roles/{roleId}/permissions/{permissionId}
  - Remove permission from role, 204 No Content

- GET /api/role-permissions/roles/{roleId}/permissions
  - Response: 200 ["permission-uuid", ...]

- GET /api/role-permissions/permissions/{permissionId}/roles
  - Response: 200 ["role-uuid", ...]

6) Groups
- POST /api/groups
  - Create group (protected)
  - Request GroupDto.Request { "name": "engineering", "description": "..." }
  - Response 201 GroupDto.Response

- PUT /api/groups/{groupId}
  - Update group (protected)
  - Response 200 GroupDto.Response

- GET /api/groups/{groupId}
  - Response 200 GroupDto.Response

- GET /api/groups
  - Response 200 List<GroupDto.Response>

- DELETE /api/groups/{groupId}
  - Response 204

7) Group-Role mappings
- POST /api/group-roles/groups/{groupId}/roles/{roleId}
  - Assign role to group, 204

- DELETE /api/group-roles/groups/{groupId}/roles/{roleId}
  - Remove role from group, 204

- GET /api/group-roles/groups/{groupId}/roles
  - Response: 200 ["role-uuid", ...]

- GET /api/group-roles/roles/{roleId}/groups
  - Response: 200 ["group-uuid", ...]

8) User-Group membership
- POST /api/user-groups/users/{userId}/groups/{groupId}
  - Add user to group, 204

- DELETE /api/user-groups/users/{userId}/groups/{groupId}
  - Remove user from group, 204

- GET /api/user-groups/users/{userId}/groups
  - Response: 200 ["group-uuid", ...]

- GET /api/user-groups/groups/{groupId}/users
  - Response: 200 ["user-uuid", ...]

Swagger / OpenAPI
- A complete OpenAPI v3 spec is available in this repo: docs/openapi.yaml
- Import that YAML into Swagger UI / Postman / other tools.

Postman
- A Postman collection is available: docs/postman_collection.json
- Import the collection into Postman, set environment variable baseUrl to your API base URL, use the Login request to get a token and set it in the collection variable `jwt`.

Notes for the integrator (Lovable)
1. Base URL: replace {{baseUrl}} with the production/staging URL.
2. Authentication: obtain a JWT via /api/auth/login. The JWT is RS256-signed; verify signature if necessary using the public key.
3. Rate limiting, pagination: endpoints that return lists use pagination parameters `page` and `size` (0-based page index). `getAllUsers` returns `PageResponse` describing `content`, `page`, `size`, `totalElements`, `totalPages`, `last`.
4. Error handling: standard HTTP codes are used (400 for validation, 401 unauthorized, 403 forbidden (if implemented), 404 not found, 409 conflict, 500 server error).

If you'd like I can also:
- Generate a downloadable Postman environment file that stores baseUrl and jwt.
- Add @Operation summary/description annotations to controllers for richer OpenAPI output.
- Provide a one-page integration checklist with sample curl commands and expected responses.

---
Generated on: 2025-12-16

