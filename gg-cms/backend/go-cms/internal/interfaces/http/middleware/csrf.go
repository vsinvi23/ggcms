package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/serenya/go-cms/pkg/response"
)

// CSRF validates that the X-CSRF-Token header matches the csrf_token cookie
// on state-changing requests (POST/PUT/PATCH/DELETE).
func CSRF() gin.HandlerFunc {
	return func(c *gin.Context) {
		switch c.Request.Method {
		case "POST", "PUT", "PATCH", "DELETE":
			cookie, err := c.Cookie("csrf_token")
			header := c.GetHeader("X-CSRF-Token")
			if err != nil || cookie == "" || header == "" || header != cookie {
				response.Forbidden(c, "invalid csrf token")
				c.Abort()
				return
			}
		}
		c.Next()
	}
}
