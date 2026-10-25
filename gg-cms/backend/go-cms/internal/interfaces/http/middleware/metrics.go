package middleware

import (
	"crypto/subtle"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/serenya/go-cms/pkg/metrics"
	"github.com/serenya/go-cms/pkg/response"
)

// Metrics records request count and latency by route template.
func Metrics(reg *metrics.Registry) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		route := c.FullPath()
		if route == "" {
			route = "unmatched"
		}
		reg.Requests.WithLabelValues(c.Request.Method, route, strconv.Itoa(c.Writer.Status())).Inc()
		reg.Latency.WithLabelValues(c.Request.Method, route).Observe(time.Since(start).Seconds())
	}
}

// MetricsGuard allows a request carrying the configured bearer token; otherwise it falls
// back to the supplied admin chain (JWT auth + admin role).
func MetricsGuard(token string, admin ...gin.HandlerFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		if token != "" {
			if h := c.GetHeader("Authorization"); strings.HasPrefix(h, "Bearer ") &&
				subtle.ConstantTimeCompare([]byte(strings.TrimPrefix(h, "Bearer ")), []byte(token)) == 1 {
				c.Next()
				return
			}
		}
		for _, h := range admin {
			h(c)
			if c.IsAborted() {
				return
			}
		}
		if len(admin) == 0 {
			response.Unauthorized(c, "metrics access denied")
			c.Abort()
			return
		}
		c.Next()
	}
}
