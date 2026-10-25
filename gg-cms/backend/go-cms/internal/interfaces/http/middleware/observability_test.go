package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/serenya/go-cms/pkg/metrics"
)

func TestRequestIDPropagation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestID())
	var seen string
	r.GET("/x", func(c *gin.Context) { seen = GetRequestID(c); c.Status(200) })

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/x", nil))
	if seen == "" || w.Header().Get("X-Request-ID") != seen {
		t.Fatalf("generated id not propagated: %q %q", seen, w.Header().Get("X-Request-ID"))
	}

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("X-Request-ID", "client-req-12345")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if seen != "client-req-12345" {
		t.Fatalf("valid inbound id should be kept, got %q", seen)
	}

	req = httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("X-Request-ID", "bad id\nwith newline")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if strings.Contains(seen, "\n") || seen == "bad id\nwith newline" {
		t.Fatal("malformed inbound id must be replaced")
	}
}

func TestMetricsEndpointGuarded(t *testing.T) {
	gin.SetMode(gin.TestMode)
	reg := metrics.New()
	reg.GaugeFunc("analytics_queue_depth", "depth", func() float64 { return 3 })
	r := gin.New()
	r.Use(Metrics(reg))
	r.GET("/ping", func(c *gin.Context) { c.Status(200) })
	r.GET("/metrics", MetricsGuard("s3cret"), gin.WrapH(reg.Handler()))

	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/ping", nil))

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("no token should be rejected, got %d", w.Code)
	}

	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	req.Header.Set("Authorization", "Bearer wrong")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("wrong token should be rejected, got %d", w.Code)
	}

	req = httptest.NewRequest(http.MethodGet, "/metrics", nil)
	req.Header.Set("Authorization", "Bearer s3cret")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	body := w.Body.String()
	if w.Code != 200 || !strings.Contains(body, `http_requests_total{method="GET",route="/ping",status="200"} 1`) || !strings.Contains(body, "analytics_queue_depth 3") {
		t.Fatalf("metrics body: %d %s", w.Code, body)
	}
}
