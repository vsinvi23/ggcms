package middleware

import (
	"github.com/gin-gonic/gin"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRedactBody(t *testing.T) {
	in := `{"email":"a@b.c","password":"hunter2","code":"123456","nested":{"token":"abc"}}`
	out := redactBody(in)
	for _, leak := range []string{"hunter2", "123456", `"abc"`} {
		if strings.Contains(out, leak) {
			t.Fatalf("leaked %s in %s", leak, out)
		}
	}
	if !strings.Contains(out, "a@b.c") {
		t.Fatal("non-sensitive fields should be preserved")
	}
}

func TestSensitiveHeadersAndPaths(t *testing.T) {
	for _, h := range []string{"Cookie", "Set-Cookie", "X-CSRF-Token", "X-Admin-Recovery-Secret", "X-Factory-Sync-Secret", "Authorization"} {
		if !isSensitiveHeader(h) {
			t.Errorf("%s should be sensitive", h)
		}
	}
	if isSensitiveHeader("Content-Type") {
		t.Error("Content-Type is not sensitive")
	}
	for _, p := range []string{"/api/auth/local", "/api/admin/recover-password", "/api/import/ingest"} {
		if !isSensitivePath(p) {
			t.Errorf("%s should be sensitive", p)
		}
	}
	if isSensitivePath("/api/cms") {
		t.Error("/api/cms is not sensitive")
	}
}

func TestSecurityHeaders(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(SecurityHeaders())
	r.GET("/api/x", func(c *gin.Context) { c.Status(200) })
	r.GET("/", func(c *gin.Context) { c.Status(200) })
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/api/x", nil))
	if w.Header().Get("X-Content-Type-Options") != "nosniff" || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("missing api headers: %v", w.Header())
	}
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	if !strings.Contains(w.Header().Get("Content-Security-Policy"), "frame-ancestors 'none'") {
		t.Fatal("SPA CSP missing")
	}
}
