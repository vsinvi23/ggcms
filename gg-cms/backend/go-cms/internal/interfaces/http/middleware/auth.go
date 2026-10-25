package middleware

import (
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/serenya/go-cms/internal/application/identity"
	jwtpkg "github.com/serenya/go-cms/pkg/jwt"
	"github.com/serenya/go-cms/pkg/response"
)

const (
	keyUserID        = "userID"
	keyEmail         = "email"
	keyRole          = "role"
	keyAuthTime      = "authTime"
	keyEmailVerified = "emailVerified"
)

func extractToken(c *gin.Context) string {
	if cookie, err := c.Cookie("jwt"); err == nil && cookie != "" {
		return cookie
	}
	if h := c.GetHeader("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	return ""
}

func authenticate(c *gin.Context, jwtManager *jwtpkg.Manager, guard *identity.SessionGuard) bool {
	tokenStr := extractToken(c)
	if tokenStr == "" {
		return false
	}
	claims, err := jwtManager.Validate(tokenStr)
	if err != nil {
		return false
	}
	info, err := guard.Check(c.Request.Context(), claims.UserID, claims.TokenVersion)
	if err != nil {
		return false
	}
	c.Set(keyUserID, claims.UserID)
	c.Set(keyEmail, claims.Email)
	c.Set(keyRole, info.Role)
	c.Set(keyAuthTime, time.Unix(claims.AuthTime, 0))
	c.Set(keyEmailVerified, info.EmailVerified)
	return true
}

// Auth validates the access JWT (HttpOnly "jwt" cookie, then Bearer header) and
// checks token_version, account status and the current role on every request.
func Auth(jwtManager *jwtpkg.Manager, guard *identity.SessionGuard) gin.HandlerFunc {
	return func(c *gin.Context) {
		if extractToken(c) == "" {
			response.Unauthorized(c, "missing authentication")
			c.Abort()
			return
		}
		if !authenticate(c, jwtManager, guard) {
			response.Unauthorized(c, "invalid or expired token")
			c.Abort()
			return
		}
		c.Next()
	}
}

// OptionalAuth populates the user context when a valid JWT is present but never
// rejects the request. Use on public routes that behave differently for
// authenticated callers (e.g. draft preview).
func OptionalAuth(jwtManager *jwtpkg.Manager, guard *identity.SessionGuard) gin.HandlerFunc {
	return func(c *gin.Context) {
		authenticate(c, jwtManager, guard)
		c.Next()
	}
}

// RequireVerifiedEmail rejects callers whose email address has not been verified.
func RequireVerifiedEmail() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !IsEmailVerified(c) {
			response.Forbidden(c, "email verification required")
			c.Abort()
			return
		}
		c.Next()
	}
}

// SetActor records the acting user on the context for audit logging on routes
// that run before authentication (login, OAuth callback).
func SetActor(c *gin.Context, userID uint, email string) {
	c.Set(keyUserID, userID)
	c.Set(keyEmail, email)
}

func GetAuthTime(c *gin.Context) time.Time {
	if t, ok := c.Get(keyAuthTime); ok {
		if at, ok := t.(time.Time); ok {
			return at
		}
	}
	return time.Time{}
}

func IsEmailVerified(c *gin.Context) bool {
	v, _ := c.Get(keyEmailVerified)
	b, _ := v.(bool)
	return b
}

func AdminOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get(keyRole)
		if role != "admin" {
			response.Forbidden(c, "admin access required")
			c.Abort()
			return
		}
		c.Next()
	}
}

func GetUserID(c *gin.Context) uint {
	id, _ := c.Get(keyUserID)
	if uid, ok := id.(uint); ok {
		return uid
	}
	return 0
}

func GetUserEmail(c *gin.Context) string {
	email, _ := c.Get(keyEmail)
	if e, ok := email.(string); ok {
		return e
	}
	return ""
}

func IsAdmin(c *gin.Context) bool {
	role, _ := c.Get(keyRole)
	return role == "admin"
}
