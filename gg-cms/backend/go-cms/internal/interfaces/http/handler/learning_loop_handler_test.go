package handler_test

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	certsvc "github.com/serenya/go-cms/internal/application/certificate"
	enrollmentsvc "github.com/serenya/go-cms/internal/application/enrollment"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/handler"
)

type stubCertService struct {
	certsvc.Service
	cert *entity.Certificate
}

func (s *stubCertService) Verify(_ context.Context, code string) (*entity.Certificate, error) {
	if s.cert != nil && s.cert.Code == code && !s.cert.Revoked {
		return s.cert, nil
	}
	return nil, certsvc.ErrNotFound
}

type stubEnrollmentService struct {
	enrollmentsvc.Service
	syncCalled bool
}

func (s *stubEnrollmentService) SyncLocal(context.Context, uint, []enrollmentsvc.SyncItem) ([]enrollmentsvc.SyncResult, error) {
	s.syncCalled = true
	return nil, nil
}

func TestCertificateVerifyNoPIILeak(t *testing.T) {
	gin.SetMode(gin.TestMode)
	code := "5f0f7a58-2c1b-4c0d-9d57-0e1f0a3c9b11"
	cert := &entity.Certificate{Code: code, UserID: 4242, RecipientName: "Ada Lovelace", CourseTitle: "Go Basics", IssuedAt: time.Now()}
	r := gin.New()
	h := handler.NewCertificateHandler(&stubCertService{cert: cert})
	r.GET("/api/public/certificates/:code", h.Verify)

	w := doRequest(r, http.MethodGet, "/api/public/certificates/"+code, nil)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"valid":true`) || !strings.Contains(w.Body.String(), "Ada Lovelace") {
		t.Fatalf("valid cert: %d %s", w.Code, w.Body)
	}
	for _, leak := range []string{"4242", "userId", "email", "enrollment", "score"} {
		if strings.Contains(w.Body.String(), leak) {
			t.Fatalf("public verify leaks %q: %s", leak, w.Body)
		}
	}

	unknown := doRequest(r, http.MethodGet, "/api/public/certificates/00000000-0000-0000-0000-000000000000", nil)
	cert.Revoked = true
	revoked := doRequest(r, http.MethodGet, "/api/public/certificates/"+code, nil)
	if unknown.Code != revoked.Code || unknown.Body.String() != revoked.Body.String() {
		t.Fatalf("unknown and revoked must be indistinguishable: %s vs %s", unknown.Body, revoked.Body)
	}
	if !strings.Contains(unknown.Body.String(), `"valid":false`) || strings.Contains(unknown.Body.String(), "Ada") {
		t.Fatalf("invalid cert must not expose details: %s", unknown.Body)
	}
}

func TestSyncLocalBoundsEnforcedAtHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	stub := &stubEnrollmentService{}
	r := gin.New()
	h := handler.NewEnrollmentHandler(stub)
	r.POST("/api/enrollments/sync-local", authMiddleware(1, "user"), h.SyncLocal)

	items := make([]map[string]interface{}, enrollmentsvc.MaxSyncCourses+1)
	for i := range items {
		items[i] = map[string]interface{}{"courseId": i + 1, "completedLessonIds": []int{1}}
	}
	w := doRequest(r, http.MethodPost, "/api/enrollments/sync-local", map[string]interface{}{"items": items})
	if w.Code != http.StatusBadRequest || stub.syncCalled {
		t.Fatalf("oversized batch must be rejected before service: %d %s", w.Code, w.Body)
	}

	ok := doRequest(r, http.MethodPost, "/api/enrollments/sync-local", map[string]interface{}{"items": items[:2]})
	if ok.Code != http.StatusOK || !stub.syncCalled {
		t.Fatalf("valid batch should reach service: %d %s", ok.Code, ok.Body)
	}
}
