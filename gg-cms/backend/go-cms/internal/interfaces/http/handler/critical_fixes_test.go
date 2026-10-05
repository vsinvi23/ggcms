package handler_test

// critical_fixes_test.go — regression tests for:
//   - ?preview=true must not expose unpublished content to anonymous callers
//   - section/lesson create must enforce course ownership
//   - interactiveMetadata is accepted, forwarded and validated on create/update

import (
	"context"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	analyticssvc "github.com/serenya/go-cms/internal/application/analytics"
	cmssvc "github.com/serenya/go-cms/internal/application/cms"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/handler"
)

// ─── stubs ────────────────────────────────────────────────────────────────────

type stubAnalyticsService struct{}

func (stubAnalyticsService) TrackPageView(context.Context, *uint, *string, *string, string, string) error {
	return nil
}
func (stubAnalyticsService) TrackEvent(context.Context, string, *uint, *string, *string, map[string]interface{}, string, string) error {
	return nil
}
func (stubAnalyticsService) GetDashboardStats(context.Context) (map[string]interface{}, error) {
	return nil, nil
}
func (stubAnalyticsService) GetContentViews(context.Context, string, string) (int64, error) {
	return 0, nil
}

var _ analyticssvc.Service = stubAnalyticsService{}

// optionalAuth mimics middleware.OptionalAuth: identity is set only when userID != 0.
func optionalAuth(userID uint, role string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if userID != 0 {
			c.Set("userID", userID)
			c.Set("role", role)
		}
		c.Next()
	}
}

func newPublicRouter(svc cmssvc.Service, userID uint, role string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := handler.NewPublicHandler(svc, nil, stubAnalyticsService{})
	r.GET("/api/public/articles/:id", optionalAuth(userID, role), h.GetPublicArticle)
	r.GET("/api/public/courses/:id", optionalAuth(userID, role), h.GetPublicCourse)
	r.GET("/api/public/cms/:id", optionalAuth(userID, role), h.GetPublicCMSByID)
	return r
}

func draftArticle(ownerID uint, reviewerID *uint) *entity.Article {
	return &entity.Article{ID: 7, Title: "Secret draft", CreatedByID: ownerID, ReviewerID: reviewerID, Status: entity.CMSStatusDraft}
}

func draftCourse(ownerID uint) *entity.Course {
	return &entity.Course{ID: 7, Title: "Secret course", CreatedByID: ownerID, Status: entity.CMSStatusDraft}
}

// ─── preview gate ─────────────────────────────────────────────────────────────

func TestPublicPreview_Anonymous_Denied(t *testing.T) {
	for _, path := range []string{
		"/api/public/articles/7?preview=true",
		"/api/public/cms/7?type=ARTICLE&preview=true",
	} {
		r := newPublicRouter(&stubCMSService{getByIDResult: draftArticle(1, nil)}, 0, "")
		if w := doRequest(r, http.MethodGet, path, nil); w.Code != http.StatusNotFound {
			t.Errorf("%s anonymous: expected 404, got %d", path, w.Code)
		}
	}
	for _, path := range []string{
		"/api/public/courses/7?preview=true",
		"/api/public/cms/7?type=COURSE&preview=true",
	} {
		r := newPublicRouter(&stubCMSService{getByIDResult: draftCourse(1)}, 0, "")
		if w := doRequest(r, http.MethodGet, path, nil); w.Code != http.StatusNotFound {
			t.Errorf("%s anonymous: expected 404, got %d", path, w.Code)
		}
	}
}

func TestPublicPreview_UnrelatedUser_Denied(t *testing.T) {
	r := newPublicRouter(&stubCMSService{getByIDResult: draftArticle(1, nil)}, 99, "user")
	if w := doRequest(r, http.MethodGet, "/api/public/articles/7?preview=true", nil); w.Code != http.StatusNotFound {
		t.Errorf("unrelated user: expected 404, got %d", w.Code)
	}
}

func TestPublicPreview_Owner_Allowed(t *testing.T) {
	r := newPublicRouter(&stubCMSService{getByIDResult: draftArticle(5, nil)}, 5, "user")
	if w := doRequest(r, http.MethodGet, "/api/public/articles/7?preview=true", nil); w.Code != http.StatusOK {
		t.Errorf("owner: expected 200, got %d", w.Code)
	}
}

func TestPublicPreview_AssignedReviewer_Allowed(t *testing.T) {
	rev := uint(8)
	r := newPublicRouter(&stubCMSService{getByIDResult: draftArticle(5, &rev)}, 8, "user")
	if w := doRequest(r, http.MethodGet, "/api/public/articles/7?preview=true", nil); w.Code != http.StatusOK {
		t.Errorf("assigned reviewer: expected 200, got %d", w.Code)
	}
}

func TestPublicPreview_Admin_Allowed(t *testing.T) {
	r := newPublicRouter(&stubCMSService{getByIDResult: draftCourse(5)}, 1, "admin")
	if w := doRequest(r, http.MethodGet, "/api/public/courses/7?preview=true", nil); w.Code != http.StatusOK {
		t.Errorf("admin: expected 200, got %d", w.Code)
	}
}

func TestPublicPreview_OwnerWithoutFlag_Denied(t *testing.T) {
	// A draft stays hidden from the public view unless preview was requested.
	r := newPublicRouter(&stubCMSService{getByIDResult: draftArticle(5, nil)}, 5, "user")
	if w := doRequest(r, http.MethodGet, "/api/public/articles/7", nil); w.Code != http.StatusNotFound {
		t.Errorf("owner without preview flag: expected 404, got %d", w.Code)
	}
}

func TestPublic_PublishedArticle_Anonymous_OK(t *testing.T) {
	a := draftArticle(1, nil)
	a.Status = entity.CMSStatusPublished
	r := newPublicRouter(&stubCMSService{getByIDResult: a}, 0, "")
	if w := doRequest(r, http.MethodGet, "/api/public/articles/7", nil); w.Code != http.StatusOK {
		t.Errorf("published article: expected 200, got %d", w.Code)
	}
}

// ─── section / lesson create ownership ───────────────────────────────────────

func newSectionLessonRouter(cmsSvc cmssvc.Service, userID uint, role string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := authMiddleware(userID, role)
	sh := handler.NewSectionHandler(&stubSectionService{}, cmsSvc)
	lh := handler.NewLessonHandler(&stubLessonService{}, &sectionOwnedByCourse{courseID: 7}, cmsSvc)
	r.POST("/api/sections", auth, sh.Create)
	r.POST("/api/lessons", auth, lh.Create)
	return r
}

func TestSectionCreate_NonOwner_Forbidden(t *testing.T) {
	r := newSectionLessonRouter(&stubCMSService{getByIDResult: draftCourse(1)}, 99, "user")
	w := doRequest(r, http.MethodPost, "/api/sections", map[string]interface{}{
		"data": map[string]interface{}{"title": "x", "course": map[string]interface{}{"id": 7}},
	})
	if w.Code != http.StatusForbidden {
		t.Errorf("non-owner creating section: expected 403, got %d — %s", w.Code, w.Body)
	}
}

func TestSectionCreate_Owner_Allowed(t *testing.T) {
	r := newSectionLessonRouter(&stubCMSService{getByIDResult: draftCourse(42)}, 42, "user")
	w := doRequest(r, http.MethodPost, "/api/sections", map[string]interface{}{
		"data": map[string]interface{}{"title": "x", "course": map[string]interface{}{"id": 7}},
	})
	if w.Code != http.StatusCreated {
		t.Errorf("owner creating section: expected 201, got %d — %s", w.Code, w.Body)
	}
}

func TestSectionCreate_Admin_Allowed(t *testing.T) {
	r := newSectionLessonRouter(&stubCMSService{getByIDResult: draftCourse(1)}, 99, "admin")
	w := doRequest(r, http.MethodPost, "/api/sections", map[string]interface{}{
		"data": map[string]interface{}{"title": "x", "course": map[string]interface{}{"id": 7}},
	})
	if w.Code != http.StatusCreated {
		t.Errorf("admin creating section: expected 201, got %d — %s", w.Code, w.Body)
	}
}

func TestSectionCreate_NoParent_NonAdmin_Forbidden(t *testing.T) {
	r := newSectionLessonRouter(&stubCMSService{getByIDResult: draftCourse(42)}, 42, "user")
	w := doRequest(r, http.MethodPost, "/api/sections", map[string]interface{}{
		"data": map[string]interface{}{"title": "orphan"},
	})
	if w.Code != http.StatusForbidden {
		t.Errorf("section with no course: expected 403, got %d — %s", w.Code, w.Body)
	}
}

func TestLessonCreate_NonOwner_Forbidden(t *testing.T) {
	r := newSectionLessonRouter(&stubCMSService{getByIDResult: draftCourse(1)}, 99, "user")
	w := doRequest(r, http.MethodPost, "/api/lessons", map[string]interface{}{
		"data": map[string]interface{}{"title": "x", "section": map[string]interface{}{"id": 3}},
	})
	if w.Code != http.StatusForbidden {
		t.Errorf("non-owner creating lesson: expected 403, got %d — %s", w.Code, w.Body)
	}
}

func TestLessonCreate_Owner_Allowed(t *testing.T) {
	r := newSectionLessonRouter(&stubCMSService{getByIDResult: draftCourse(42)}, 42, "user")
	w := doRequest(r, http.MethodPost, "/api/lessons", map[string]interface{}{
		"data": map[string]interface{}{"title": "x", "section": map[string]interface{}{"id": 3}},
	})
	if w.Code != http.StatusCreated {
		t.Errorf("owner creating lesson: expected 201, got %d — %s", w.Code, w.Body)
	}
}

// ─── interactiveMetadata ──────────────────────────────────────────────────────

// metadataCapture records the InteractiveMetadata forwarded to the service.
type metadataCapture struct {
	stubCMSService
	created, updated *string
}

func (m *metadataCapture) Create(_ context.Context, req cmssvc.CreateRequest) (interface{}, error) {
	m.created = req.InteractiveMetadata
	return &entity.Course{ID: 1}, nil
}
func (m *metadataCapture) Update(_ context.Context, _ uint, _ entity.CMSType, req cmssvc.UpdateRequest) (interface{}, error) {
	m.updated = req.InteractiveMetadata
	return &entity.Course{ID: 1}, nil
}

func newMetadataRouter(svc cmssvc.Service, userID uint) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := handler.NewCMSHandler(svc, &stubTaskService{}, nil)
	auth := authMiddleware(userID, "user")
	r.POST("/api/cms", auth, h.Create)
	r.PUT("/api/cms/:id", auth, h.Update)
	return r
}

const sampleMetadata = `{"assessmentType":"PRACTICE","questions":[{"options":["a","b"],"correctIndex":0}]}`

func TestCMSCreate_ForwardsInteractiveMetadata(t *testing.T) {
	m := &metadataCapture{}
	r := newMetadataRouter(m, 42)
	w := doRequest(r, http.MethodPost, "/api/cms", map[string]interface{}{
		"type": "COURSE", "title": "Quiz", "courseType": "ASSESSMENT", "interactiveMetadata": sampleMetadata,
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d — %s", w.Code, w.Body)
	}
	if m.created == nil || *m.created != sampleMetadata {
		t.Errorf("interactiveMetadata not forwarded on create, got %v", m.created)
	}
}

func TestCMSUpdate_ForwardsInteractiveMetadata(t *testing.T) {
	m := &metadataCapture{stubCMSService: stubCMSService{getByIDResult: draftCourse(42)}}
	r := newMetadataRouter(m, 42)
	w := doRequest(r, http.MethodPut, "/api/cms/1?type=COURSE", map[string]interface{}{
		"interactiveMetadata": sampleMetadata,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d — %s", w.Code, w.Body)
	}
	if m.updated == nil || *m.updated != sampleMetadata {
		t.Errorf("interactiveMetadata not forwarded on update, got %v", m.updated)
	}
}

func TestCMSCreate_InvalidInteractiveMetadata_BadRequest(t *testing.T) {
	m := &metadataCapture{}
	r := newMetadataRouter(m, 42)
	w := doRequest(r, http.MethodPost, "/api/cms", map[string]interface{}{
		"type": "COURSE", "title": "Quiz", "interactiveMetadata": "{not json",
	})
	if w.Code != http.StatusBadRequest {
		t.Errorf("invalid JSON metadata: expected 400, got %d — %s", w.Code, w.Body)
	}
	if m.created != nil {
		t.Error("service must not be called when metadata is invalid")
	}
}

func TestCMSUpdate_InvalidInteractiveMetadata_BadRequest(t *testing.T) {
	m := &metadataCapture{stubCMSService: stubCMSService{getByIDResult: draftCourse(42)}}
	r := newMetadataRouter(m, 42)
	w := doRequest(r, http.MethodPut, "/api/cms/1?type=COURSE", map[string]interface{}{
		"interactiveMetadata": "{not json",
	})
	if w.Code != http.StatusBadRequest {
		t.Errorf("invalid JSON metadata: expected 400, got %d — %s", w.Code, w.Body)
	}
}

// sectionOwnedByCourse is a section service whose sections all belong to courseID.
type sectionOwnedByCourse struct {
	stubSectionService
	courseID uint
}

func (s *sectionOwnedByCourse) GetByID(_ context.Context, id uint) (*entity.Section, error) {
	return &entity.Section{ID: id, CourseID: &s.courseID}, nil
}
