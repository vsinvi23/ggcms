package middleware

import (
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type ipWindow struct {
	count     int
	windowEnd time.Time
}

type ipRateLimiter struct {
	mu      sync.Mutex
	windows map[string]*ipWindow
	limit   int
	window  time.Duration
	stop    chan struct{}
}

func newIPRateLimiter(limit int, window time.Duration) *ipRateLimiter {
	rl := &ipRateLimiter{
		windows: make(map[string]*ipWindow),
		limit:   limit,
		window:  window,
		stop:    make(chan struct{}),
	}
	go rl.evict()
	return rl
}

// close stops the background eviction goroutine.
func (rl *ipRateLimiter) close() {
	close(rl.stop)
}

func (rl *ipRateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	w, ok := rl.windows[ip]
	if !ok || time.Now().After(w.windowEnd) {
		rl.windows[ip] = &ipWindow{count: 1, windowEnd: time.Now().Add(rl.window)}
		return true
	}
	if w.count >= rl.limit {
		return false
	}
	w.count++
	return true
}

func (rl *ipRateLimiter) evict() {
	ticker := time.NewTicker(rl.window)
	defer ticker.Stop()
	for {
		select {
		case <-rl.stop:
			return
		case now := <-ticker.C:
			rl.mu.Lock()
			for ip, w := range rl.windows {
				if now.After(w.windowEnd) {
					delete(rl.windows, ip)
				}
			}
			rl.mu.Unlock()
		}
	}
}

// authLimiter allows 10 auth requests per IP per minute.
var authLimiter = newIPRateLimiter(10, time.Minute)

// AuthRateLimit is a Gin middleware that enforces per-IP rate limiting on auth endpoints.
// Set BYPASS_RATE_LIMIT=1 to disable for integration test runs.
func AuthRateLimit() gin.HandlerFunc {
	bypass := os.Getenv("BYPASS_RATE_LIMIT") == "1"
	return func(c *gin.Context) {
		if bypass {
			c.Next()
			return
		}
		ip := c.ClientIP()
		if !authLimiter.allow(ip) {
			c.Header("Retry-After", "60")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"success": false,
				"message": "too many requests, please try again later",
			})
			return
		}
		c.Next()
	}
}
