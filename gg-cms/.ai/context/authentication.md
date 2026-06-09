# Authentication and Authorization Context

## JWT Flow

```
Login → validate credentials → sign JWT (HS256) → return token
  Token payload: { sub: userID, email, role, exp }

Subsequent requests:
  1. Check HttpOnly cookie "jwt"
  2. Fallback: Authorization: Bearer <token>
  3. Validate signature + expiry
  4. Set userID, email, role in Gin context
```

## Backend Auth Middleware

```go
// middleware/auth.go

// Apply to protected route group:
authMW := middleware.Auth(jwtManager)
p := api.Group("/")
p.Use(authMW)

// Get user info inside handlers:
userID := middleware.GetUserID(c)   // uint
email  := middleware.GetUserEmail(c) // string
isAdmin := middleware.IsAdmin(c)    // bool

// Admin-only routes:
p.GET("admin/resource", middleware.AdminOnly(), handler.Method)
```

## JWT Manager (pkg/jwt)

```go
type Manager struct { secret string; expiry time.Duration }

func (m *Manager) Sign(claims Claims) (string, error)
func (m *Manager) Validate(tokenStr string) (*Claims, error)

type Claims struct {
    UserID uint   `json:"sub"`
    Email  string `json:"email"`
    Role   string `json:"role"`
    jwt.RegisteredClaims
}
```

## Roles and Permissions

```go
// Group entity permissions (JSONB)
type GroupPermissions struct {
    Articles   *ResourcePerms `json:"articles"`
    Courses    *ResourcePerms `json:"courses"`
    Users      *ResourcePerms `json:"users"`
    Groups     *ManagePerms   `json:"groups"`
    Categories *ResourcePerms `json:"categories"`
    Analytics  *ViewPerms     `json:"analytics"`
    Settings   *ManagePerms   `json:"settings"`
}

type ResourcePerms struct {
    View    *bool `json:"view"`
    Create  *bool `json:"create"`
    Edit    *bool `json:"edit"`
    Delete  *bool `json:"delete"`
    Review  *bool `json:"review"`
    Approve *bool `json:"approve"`
    Publish *bool `json:"publish"`
}
```

Built-in role presets: `admin`, `moderator`, `editor`, `viewer`  
Admin group name: controlled by `ADMIN_GROUP_NAME` constant in config

## Frontend Auth State

```typescript
// AuthContext provides:
interface AuthContextType {
  user: AuthUser | null;          // { id, email, name, avatar, status, role }
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;               // role==='admin' OR admin group member
  userGroups: GroupResponseDto[];
  groupNames: string[];           // uppercased group names
  hasGroup: (groupName: string) => boolean;
  login: (email, password) => Promise<{ error?: string }>;
  signup: (email, password, name, mobileNo?) => Promise<{ error?: string }>;
  socialLogin: (provider) => Promise<{ error?: string }>;
  loginWithToken: (token) => Promise<{ error?: string }>;  // used by OAuthCallback
  logout: () => void;
  visitorProfileImported: boolean;      // true after visitor profile auto-imported
  clearVisitorImportFlag: () => void;
}
```

## Token Storage (sessionStorage)

```typescript
// Keys (from src/config/api.ts)
const AUTH_TOKEN_KEY = 'authToken';
const USER_STORAGE_KEY = 'auth_user';
const GROUPS_STORAGE_KEY = 'user_groups_cache';

// sessionStorage = cleared on tab close (more secure than localStorage)
// In-memory token cache = faster reads, avoids repeated sessionStorage access
```

## OAuth Flow

```
User clicks "Sign in with Google/GitHub"
  → GET /api/auth/google  (or /api/auth/github)
  → Backend redirects to provider
  → Provider redirects to /api/auth/google/callback
  → Backend validates + issues JWT
  → Backend redirects to FRONTEND_URL + /auth/callback?token=XXX
  → OAuthCallback page calls loginWithToken(token)
  → AuthContext stores token + fetches user profile
```

## Visitor Profile Import (on login)

```typescript
// AuthContext.importVisitorProfile() is called after every successful login
// 1. Reads cms_visitor_profile from localStorage
// 2. If exists: POSTs to PUT /api/personalization/profile
// 3. Sets visitorProfileImported = true
// 4. Clears localStorage key
// VisitorImportDialog shown when visitorProfileImported === true
```

## Auth Endpoints

```
POST /api/auth/local          Login (email + password)
POST /api/auth/local/register Register
GET  /api/auth/google         OAuth redirect
GET  /api/auth/google/callback OAuth callback
GET  /api/auth/github         OAuth redirect
GET  /api/auth/github/callback OAuth callback
GET  /api/users/me            Current user profile (protected)
```

## Security Notes

- JWT secret: `JWT_SECRET` env var — must be a long random string in production
- No key rotation mechanism currently — manual server restart required to rotate
- CORS: currently `AllowAllOrigins: true` — **must be restricted in production**
- Rate limiting on auth endpoints: in-memory (not pod-safe) — upgrade to Redis counter for multi-pod
- File uploads: no MIME validation — only extension + stored type
