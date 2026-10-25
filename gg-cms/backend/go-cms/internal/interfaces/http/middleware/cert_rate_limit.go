package middleware

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

var certVerifyLimiter = newIPRateLimiter(30, time.Minute)

// CertVerifyRateLimit limits public certificate verification lookups per IP to deter code enumeration.
func CertVerifyRateLimit() gin.HandlerFunc {
	bypass := rateLimitBypassEnabled()
	return func(c *gin.Context) {
		if !bypass && !certVerifyLimiter.allow(c.ClientIP()) {
			c.Header("Retry-After", "60")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"success": false, "message": "too many requests, please try again later"})
			return
		}
		c.Next()
	}
}
