package handler_test

// cms_handler_security_test.go — unit tests for ownership and reviewer
// enforcement in CMSHandler.
//
// Tested methods:   Update, Delete, Publish, SendBack, SaveReviewNote
// Security rules:
//   Update  — non-admin can only edit content they created
//   Delete  — non-admin can only delete content they created
//   Publish — non-admin must be the assigned reviewer_id
//   SendBack — non-admin must be the assigned reviewer_id
//   SaveReviewNote — non-admin must be the assigned reviewer_id

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	cmssvc "github.com/serenya/go-cms/internal/application/cms"
	tasksvc "github.com/serenya/go-cms/internal/application/task"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/internal/interfaces/http/handler"
)

// ─── stub CMS service ─────────────────────────────────────────────────────────

// stubCMSService lets each test configure GetByID to return a specific article.
// All other methods are no-ops so handler code after the security check doesn't
// fail with nil-pointer panics.
type stubCMSService struct {
	getByIDResult interface{} // *entity.Article or *entity.Course
	getByIDErr    error
	updateErr     error
	deleteErr     error
	publishErr    error
	sendBackErr   error
	reviewNoteErr error
	approveErr    error
}

func (s *stubCMSService) GetByID(_ context.Context, _ uint, _ entity.CMSType) (interface{}, error) {
	if s.getByIDErr != nil {
		return nil, s.getByIDErr
	}
	if s.getByIDResult != nil {
		return s.getByIDResult, nil
	}
	return &entity.Article{}, nil
}
func (s *stubCMSService) GetAll(_ context.Context, _ entity.CMSType, _ repository.ArticleFilter, _, _ int) (interface{}, int64, error) {
	return []*entity.Article{}, 0, nil
}
func (s *stubCMSService) GetByPublicID(_ context.Context, _ string, _ entity.CMSType) (interface{}, error) {
	return nil, nil
}
func (s *stubCMSService) GetBySlug(_ context.Context, _ string, _ entity.CMSType) (interface{}, error) {
	return nil, nil
}
func (s *stubCMSService) Create(_ context.Context, _ cmssvc.CreateRequest) (interface{}, error) {
	return &entity.Article{}, nil
}
func (s *stubCMSService) Update(_ context.Context, _ uint, _ entity.CMSType, _ cmssvc.UpdateRequest) (interface{}, error) {
	return &entity.Article{}, s.updateErr
}
func (s *stubCMSService) Delete(_ context.Context, _ uint, _ entity.CMSType) error {
	return s.deleteErr
}
func (s *stubCMSService) Submit(_ context.Context, _ uint, _ entity.CMSType, _ *uint) error {
	return nil
}
func (s *stubCMSService) Approve(_ context.Context, _ uint, _ entity.CMSType, _ *uint, _ bool) error {
	return s.approveErr
}
func (s *stubCMSService) Publish(_ context.Context, _ uint, _ entity.CMSType, _ *uint) error {
	return s.publishErr
}
func (s *stubCMSService) SendBack(_ context.Context, _ uint, _ entity.CMSType, _ string) error {
	return s.sendBackErr
}
func (s *stubCMSService) Reject(_ context.Context, _ uint, _ entity.CMSType, _ uint, _ string, _ bool) error {
	return nil
}
func (s *stubCMSService) GetActivity(_ context.Context, _ uint, _ entity.CMSType) ([]*entity.WorkflowEvent, error) {
	return nil, nil
}
func (s *stubCMSService) ClaimReview(_ context.Context, _ uint, _ entity.CMSType, _ uint) error {
	return nil
}
func (s *stubCMSService) AssignReviewer(_ context.Context, _ uint, _ entity.CMSType, _, _ uint) error {
	return nil
}
func (s *stubCMSService) ReassignReview(_ context.Context, _ uint, _ entity.CMSType, _ string, _ uint) error {
	return nil
}
func (s *stubCMSService) SaveReviewNote(_ context.Context, _ uint, _ entity.CMSType, _ string) error {
	return s.reviewNoteErr
}
func (s *stubCMSService) GetReviewProgress(_ context.Context, _ uint, _ entity.CMSType) (int, int, error) {
	return 0, 1, nil
}

// Verify the stub satisfies the interface at compile time.
var _ cmssvc.Service = (*stubCMSService)(nil)

// ─── stub task service ────────────────────────────────────────────────────────

type stubTaskService struct{}

func (s *stubTaskService) GetAll(_ context.Context, _ repository.TaskFilter, _, _ int) ([]*entity.Task, int64, error) {
	return nil, 0, nil
}
func (s *stubTaskService) GetByID(_ context.Context, _ uint) (*entity.Task, error) { return nil, nil }
func (s *stubTaskService) Create(_ context.Context, _ tasksvc.CreateRequest) (*entity.Task, error) {
	return nil, nil
}
func (s *stubTaskService) Update(_ context.Context, _ uint, _, _ *string) (*entity.Task, error) {
	return nil, nil
}
func (s *stubTaskService) Delete(_ context.Context, _ uint) error { return nil }
func (s *stubTaskService) UpsertOwnerTask(_ context.Context, _ uint, _ entity.TaskType, _ string, _ uint, _ string) error {
	return nil
}
func (s *stubTaskService) UpsertReviewerTask(_ context.Context, _ uint, _ entity.TaskType, _ string, _ uint) error {
	return nil
}
func (s *stubTaskService) UpdateStatusByContentID(_ context.Context, _ uint, _ entity.TaskType, _ string) (int64, error) {
	return 0, nil
}
func (s *stubTaskService) UpsertPublishedTask(_ context.Context, _ uint, _ entity.TaskType, _ string, _ uint) error {
	return nil
}

// Verify the stub satisfies the interface at compile time.
var _ tasksvc.Service = (*stubTaskService)(nil)

// ─── router helpers ───────────────────────────────────────────────────────────

func newCMSRouter(svc cmssvc.Service, authUserID uint, role string) *gin.Engine {
	r := gin.New()
	h := handler.NewCMSHandler(svc, &stubTaskService{})

	auth := authMiddleware(authUserID, role) // defined in user_handler_security_test.go

	r.PUT("/api/cms/:id", auth, h.Update)
	r.DELETE("/api/cms/:id", auth, h.Delete)
	r.POST("/api/cms/:id/publish", auth, h.Publish)
	r.POST("/api/cms/:id/send-back", auth, h.SendBack)
	r.POST("/api/cms/:id/review-note", auth, h.SaveReviewNote)
	return r
}

func doRequest(r *gin.Engine, method, path string, body interface{}) *httptest.ResponseRecorder {
	var b []byte
	if body != nil {
		b, _ = json.Marshal(body)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// ─── article factories ────────────────────────────────────────────────────────

// articleOwnedBy returns an article owned by the given userID with no assigned reviewer.
func articleOwnedBy(ownerID uint) *entity.Article {
	return &entity.Article{ID: 1, CreatedByID: ownerID, Status: entity.CMSStatusDraft}
}

// articleOwnedByWithReviewer returns an article with the given reviewer assigned.
func articleWithReviewer(ownerID, reviewerID uint) *entity.Article {
	a := articleOwnedBy(ownerID)
	a.ReviewerID = &reviewerID
	a.Status = entity.CMSStatusApproved
	return a
}

// ─── Update tests ─────────────────────────────────────────────────────────────

// TestCMSUpdate_Owner_Allowed verifies the article owner can edit their content.
func TestCMSUpdate_Owner_Allowed(t *testing.T) {
	const ownerID = uint(42)
	svc := &stubCMSService{getByIDResult: articleOwnedBy(ownerID)}
	r := newCMSRouter(svc, ownerID, "user")

	w := doRequest(r, http.MethodPut, "/api/cms/1?type=ARTICLE", map[string]interface{}{
		"title": "My Updated Title",
	})
	if w.Code != http.StatusOK {
		t.Errorf("owner updating own article: expected 200, got %d — body: %s", w.Code, w.Body)
	}
}

// TestCMSUpdate_NonOwner_Forbidden verifies that a user cannot edit someone else's article.
func TestCMSUpdate_NonOwner_Forbidden(t *testing.T) {
	const ownerID = uint(42)
	const intruderID = uint(99)
	svc := &stubCMSService{getByIDResult: articleOwnedBy(ownerID)}
	r := newCMSRouter(svc, intruderID, "user")

	w := doRequest(r, http.MethodPut, "/api/cms/1?type=ARTICLE", map[string]interface{}{
		"title": "Hijacked Title",
	})
	if w.Code != http.StatusForbidden {
		t.Errorf("non-owner editing article: expected 403, got %d — body: %s", w.Code, w.Body)
	}
}

// TestCMSUpdate_Admin_AnyContent_Allowed verifies an admin can edit any article.
func TestCMSUpdate_Admin_AnyContent_Allowed(t *testing.T) {
	const ownerID = uint(42)
	const adminID = uint(1)
	svc := &stubCMSService{getByIDResult: articleOwnedBy(ownerID)}
	r := newCMSRouter(svc, adminID, "admin")

	w := doRequest(r, http.MethodPut, "/api/cms/1?type=ARTICLE", map[string]interface{}{
		"title": "Admin Edit",
	})
	if w.Code != http.StatusOK {
		t.Errorf("admin editing any article: expected 200, got %d — body: %s", w.Code, w.Body)
	}
}

// ─── Delete tests ─────────────────────────────────────────────────────────────

// TestCMSDelete_Owner_Allowed verifies the content owner can delete their article.
func TestCMSDelete_Owner_Allowed(t *testing.T) {
	const ownerID = uint(42)
	svc := &stubCMSService{getByIDResult: articleOwnedBy(ownerID)}
	r := newCMSRouter(svc, ownerID, "user")

	w := doRequest(r, http.MethodDelete, "/api/cms/1?type=ARTICLE", nil)
	if w.Code != http.StatusOK {
		t.Errorf("owner deleting own article: expected 200, got %d — body: %s", w.Code, w.Body)
	}
}

// TestCMSDelete_NonOwner_Forbidden verifies a user cannot delete another user's article.
func TestCMSDelete_NonOwner_Forbidden(t *testing.T) {
	const ownerID = uint(42)
	const intruderID = uint(99)
	svc := &stubCMSService{getByIDResult: articleOwnedBy(ownerID)}
	r := newCMSRouter(svc, intruderID, "user")

	w := doRequest(r, http.MethodDelete, "/api/cms/1?type=ARTICLE", nil)
	if w.Code != http.StatusForbidden {
		t.Errorf("non-owner deleting article: expected 403, got %d — body: %s", w.Code, w.Body)
	}
}

// ─── Publish tests ────────────────────────────────────────────────────────────

// TestCMSPublish_Admin_Allowed verifies an admin can always publish.
func TestCMSPublish_Admin_Allowed(t *testing.T) {
	const adminID = uint(1)
	svc := &stubCMSService{getByIDResult: articleWithReviewer(42, 99)}
	r := newCMSRouter(svc, adminID, "admin")

	w := doRequest(r, http.MethodPost, "/api/cms/1/publish?type=ARTICLE", nil)
	if w.Code != http.StatusOK {
		t.Errorf("admin publishing: expected 200, got %d — body: %s", w.Code, w.Body)
	}
}

// TestCMSPublish_AssignedReviewer_Allowed verifies the assigned reviewer can publish.
func TestCMSPublish_AssignedReviewer_Allowed(t *testing.T) {
	const reviewerID = uint(55)
	svc := &stubCMSService{getByIDResult: articleWithReviewer(42, reviewerID)}
	r := newCMSRouter(svc, reviewerID, "user")

	w := doRequest(r, http.MethodPost, "/api/cms/1/publish?type=ARTICLE", nil)
	if w.Code != http.StatusOK {
		t.Errorf("assigned reviewer publishing: expected 200, got %d — body: %s", w.Code, w.Body)
	}
}

// TestCMSPublish_NonReviewer_Forbidden verifies a non-admin without reviewer assignment
// cannot publish.
func TestCMSPublish_NonReviewer_Forbidden(t *testing.T) {
	const reviewerID = uint(55)
	const unassignedUserID = uint(99)
	svc := &stubCMSService{getByIDResult: articleWithReviewer(42, reviewerID)}
	r := newCMSRouter(svc, unassignedUserID, "user")

	w := doRequest(r, http.MethodPost, "/api/cms/1/publish?type=ARTICLE", nil)
	if w.Code != http.StatusForbidden {
		t.Errorf("non-reviewer publishing: expected 403, got %d — body: %s", w.Code, w.Body)
	}
}

// TestCMSPublish_NoReviewerAssigned_NonAdminForbidden verifies that publishing is
// blocked when reviewer_id is nil and the caller is not admin.
func TestCMSPublish_NoReviewerAssigned_NonAdminForbidden(t *testing.T) {
	// Article has no reviewer (nil reviewer_id — cleared after approve step)
	svc := &stubCMSService{getByIDResult: articleOwnedBy(42)}
	r := newCMSRouter(svc, 42, "user")

	w := doRequest(r, http.MethodPost, "/api/cms/1/publish?type=ARTICLE", nil)
	if w.Code != http.StatusForbidden {
		t.Errorf("publish with no reviewer assigned: expected 403, got %d — body: %s", w.Code, w.Body)
	}
}

// ─── SendBack tests ───────────────────────────────────────────────────────────

// TestCMSSendBack_AssignedReviewer_Allowed verifies the assigned reviewer can send back.
func TestCMSSendBack_AssignedReviewer_Allowed(t *testing.T) {
	const reviewerID = uint(55)
	svc := &stubCMSService{getByIDResult: articleWithReviewer(42, reviewerID)}
	r := newCMSRouter(svc, reviewerID, "user")

	w := doRequest(r, http.MethodPost, "/api/cms/1/send-back?type=ARTICLE", map[string]interface{}{
		"comment": "Please improve the intro",
	})
	if w.Code != http.StatusOK {
		t.Errorf("assigned reviewer send-back: expected 200, got %d — body: %s", w.Code, w.Body)
	}
}

// TestCMSSendBack_NonReviewer_Forbidden verifies an unassigned user cannot send back.
func TestCMSSendBack_NonReviewer_Forbidden(t *testing.T) {
	const reviewerID = uint(55)
	const unauthorizedID = uint(99)
	svc := &stubCMSService{getByIDResult: articleWithReviewer(42, reviewerID)}
	r := newCMSRouter(svc, unauthorizedID, "user")

	w := doRequest(r, http.MethodPost, "/api/cms/1/send-back?type=ARTICLE", map[string]interface{}{
		"comment": "Unauthorized send back",
	})
	if w.Code != http.StatusForbidden {
		t.Errorf("non-reviewer send-back: expected 403, got %d — body: %s", w.Code, w.Body)
	}
}

// ─── SaveReviewNote tests ─────────────────────────────────────────────────────

// TestCMSSaveReviewNote_AssignedReviewer_Allowed verifies the assigned reviewer can save notes.
func TestCMSSaveReviewNote_AssignedReviewer_Allowed(t *testing.T) {
	const reviewerID = uint(55)
	svc := &stubCMSService{getByIDResult: articleWithReviewer(42, reviewerID)}
	r := newCMSRouter(svc, reviewerID, "user")

	w := doRequest(r, http.MethodPost, "/api/cms/1/review-note?type=ARTICLE", map[string]interface{}{
		"note": "Looking good so far",
	})
	if w.Code != http.StatusOK {
		t.Errorf("assigned reviewer saving note: expected 200, got %d — body: %s", w.Code, w.Body)
	}
}

// TestCMSSaveReviewNote_NonReviewer_Forbidden verifies an unassigned user cannot
// inject review notes (audit-trail poisoning prevention).
func TestCMSSaveReviewNote_NonReviewer_Forbidden(t *testing.T) {
	const reviewerID = uint(55)
	const unauthorizedID = uint(99)
	svc := &stubCMSService{getByIDResult: articleWithReviewer(42, reviewerID)}
	r := newCMSRouter(svc, unauthorizedID, "user")

	w := doRequest(r, http.MethodPost, "/api/cms/1/review-note?type=ARTICLE", map[string]interface{}{
		"note": "Malicious note injection",
	})
	if w.Code != http.StatusForbidden {
		t.Errorf("non-reviewer saving note: expected 403, got %d — body: %s", w.Code, w.Body)
	}
}
