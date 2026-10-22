package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestIPRateLimiter_Allow(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rl := newIPRateLimiter(3, time.Minute)

	for i := 0; i < 3; i++ {
		if !rl.allow("192.168.1.1") {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}
	if rl.allow("192.168.1.1") {
		t.Fatal("4th request should be denied")
	}
	// Different IP should still be allowed
	if !rl.allow("192.168.1.2") {
		t.Fatal("different IP should be allowed")
	}
}

func TestAuthRateLimit_Middleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Reset global limiter for test isolation
	origLimiter := authLimiter
	authLimiter = newIPRateLimiter(2, time.Minute)
	defer func() {
		authLimiter.close()
		authLimiter = origLimiter
	}()

	r := gin.New()
	r.POST("/auth/local", AuthRateLimit(), func(c *gin.Context) {
		c.JSON(200, gin.H{"ok": true})
	})

	makeRequest := func() int {
		req := httptest.NewRequest(http.MethodPost, "/auth/local", nil)
		req.RemoteAddr = "10.0.0.1:12345"
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}

	if code := makeRequest(); code != 200 {
		t.Fatalf("first request: expected 200, got %d", code)
	}
	if code := makeRequest(); code != 200 {
		t.Fatalf("second request: expected 200, got %d", code)
	}
	if code := makeRequest(); code != 429 {
		t.Fatalf("third request: expected 429, got %d", code)
	}
}

func TestIPRateLimiter_WindowReset(t *testing.T) {
	rl := newIPRateLimiter(1, 50*time.Millisecond)
	defer rl.close()
	if !rl.allow("10.0.0.1") {
		t.Fatal("first request should be allowed")
	}
	if rl.allow("10.0.0.1") {
		t.Fatal("second request in same window should be denied")
	}
	time.Sleep(100 * time.Millisecond)
	if !rl.allow("10.0.0.1") {
		t.Fatal("request after window reset should be allowed")
	}
}

func TestAuthRateLimit_IgnoresBypassHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)
	origLimiter := authLimiter
	authLimiter = newIPRateLimiter(1, time.Minute)
	defer func() {
		authLimiter.close()
		authLimiter = origLimiter
	}()

	r := gin.New()
	r.POST("/x", AuthRateLimit(), func(c *gin.Context) { c.Status(200) })
	do := func() int {
		req := httptest.NewRequest(http.MethodPost, "/x", nil)
		req.RemoteAddr = "10.0.0.9:1"
		req.Header.Set("X-E2E-Bypass-Rate-Limit", "1")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}
	if c := do(); c != 200 {
		t.Fatalf("first: %d", c)
	}
	if c := do(); c != 429 {
		t.Fatalf("header must not bypass limiter, got %d", c)
	}
}

func TestRateLimitBypassRefusedInProduction(t *testing.T) {
	t.Setenv("BYPASS_RATE_LIMIT", "1")
	t.Setenv("APP_ENV", "production")
	if rateLimitBypassEnabled() {
		t.Fatal("bypass must be refused in production")
	}
	t.Setenv("APP_ENV", "development")
	if !rateLimitBypassEnabled() {
		t.Fatal("bypass should work outside production")
	}
}
