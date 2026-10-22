package middleware

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

func TestMaskEmail(t *testing.T) {
	cases := map[string]string{
		"alice@example.com": "a***@example.com",
		"not-an-email":      "not-an-email",
		"":                  "",
	}
	for in, want := range cases {
		if got := MaskEmail(in); got != want {
			t.Errorf("MaskEmail(%q) = %q, want %q", in, got, want)
		}
	}
	if got := maskEmailsIn("/api/users?email=bob%40example.com&x=1"); got != "/api/users?email=b***%40example.com&x=1" {
		t.Errorf("encoded email not masked: %s", got)
	}
	if got := maskEmailsIn("/api/lookup/carol@example.com/profile"); got != "/api/lookup/c***@example.com/profile" {
		t.Errorf("path email not masked: %s", got)
	}
}

func TestRecoveryIPAllowList(t *testing.T) {
	gin.SetMode(gin.TestMode)
	nets, err := ParseCIDRs("10.0.0.0/8, 192.168.1.5")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ParseCIDRs("not-a-cidr"); err == nil {
		t.Fatal("invalid CIDR must be rejected")
	}
	cases := []struct {
		name    string
		allowed []*net.IPNet
		remote  string
		want    int
	}{
		{"inside CIDR", nets, "10.2.3.4:1000", http.StatusOK},
		{"exact IP", nets, "192.168.1.5:1000", http.StatusOK},
		{"outside", nets, "203.0.113.9:1000", http.StatusForbidden},
		{"empty list allows all", nil, "203.0.113.9:1000", http.StatusOK},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := gin.New()
			_ = r.SetTrustedProxies(nil)
			r.POST("/recover", RecoveryIPAllowList(tc.allowed), func(c *gin.Context) { c.Status(http.StatusOK) })
			rq := httptest.NewRequest(http.MethodPost, "/recover", nil)
			rq.RemoteAddr = tc.remote
			w := httptest.NewRecorder()
			r.ServeHTTP(w, rq)
			if w.Code != tc.want {
				t.Fatalf("got %d want %d", w.Code, tc.want)
			}
		})
	}
}

type recordingAudit struct {
	mu      sync.Mutex
	actions []string
	metas   []map[string]interface{}
}

func (a *recordingAudit) Log(_ context.Context, _ uint, _ string, action, _, targetID, _ string, meta map[string]interface{}, _ string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.actions = append(a.actions, action+":"+targetID)
	a.metas = append(a.metas, meta)
	return nil
}
func (a *recordingAudit) List(context.Context, repository.AuditLogFilter, int, int) ([]*entity.AuditLog, int64, error) {
	return nil, 0, nil
}

func TestDenialAuditSummarisesRepeated403s(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rec := &recordingAudit{}
	d := &denialAuditor{svc: rec, hit: map[denialKey]*denialStat{}}
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Next()
		if c.Writer.Status() == http.StatusForbidden {
			d.record(denialKey{GetUserID(c), c.Request.Method, c.FullPath()}, c.ClientIP())
		}
	})
	r.GET("/admin-thing", func(c *gin.Context) { c.Status(http.StatusForbidden) })
	r.GET("/ok", func(c *gin.Context) { c.Status(http.StatusOK) })

	for i := 0; i < 3; i++ {
		r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/admin-thing", nil))
	}
	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/ok", nil))
	d.flush()

	if len(rec.actions) != 1 || rec.actions[0] != "authz.denied:/admin-thing" {
		t.Fatalf("want one summary event, got %v", rec.actions)
	}
	if rec.metas[0]["count"] != 3 {
		t.Fatalf("count = %v, want 3", rec.metas[0]["count"])
	}
	d.flush()
	if len(rec.actions) != 1 {
		t.Fatal("flush must reset the counters")
	}
}
