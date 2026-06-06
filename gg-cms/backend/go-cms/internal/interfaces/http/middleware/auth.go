package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
	jwtpkg "github.com/serenya/go-cms/pkg/jwt"
	"github.com/serenya/go-cms/pkg/response"
)

const (
	keyUserID = "userID"
	keyEmail  = "email"
	keyRole   = "role"
)

// Auth validates JWT from the "jwt" HttpOnly cookie first, then falls back to Bearer header.
func Auth(jwtManager *jwtpkg.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tokenStr string

		// Prefer HttpOnly cookie (more secure — not accessible by JS)
		if cookie, err := c.Cookie("jwt"); err == nil && cookie != "" {
			tokenStr = cookie
		}

		// Fall back to Authorization: Bearer <token>
		if tokenStr == "" {
			authHeader := c.GetHeader("Authorization")
			if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
				tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}

		if tokenStr == "" {
			response.Unauthorized(c, "missing authentication")
			c.Abort()
			return
		}

		claims, err := jwtManager.Validate(tokenStr)
		if err != nil {
			response.Unauthorized(c, "invalid or expired token")
			c.Abort()
			return
		}
		c.Set(keyUserID, claims.UserID)
		c.Set(keyEmail, claims.Email)
		c.Set(keyRole, claims.Role)
		c.Next()
	}
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
