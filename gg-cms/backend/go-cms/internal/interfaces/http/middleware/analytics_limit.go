package middleware

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

var analyticsLimiter = newIPRateLimiter(120, time.Minute)

// AnalyticsIngestRateLimit allows 120 ingest requests per IP per minute (each carries up to 20 events).
func AnalyticsIngestRateLimit() gin.HandlerFunc {
	bypass := rateLimitBypassEnabled()
	return func(c *gin.Context) {
		if !bypass && !analyticsLimiter.allow(c.ClientIP()) {
			c.Header("Retry-After", "60")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"success": false, "message": "too many requests"})
			return
		}
		c.Next()
	}
}
