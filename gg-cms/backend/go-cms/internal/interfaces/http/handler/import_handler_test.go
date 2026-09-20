package handler_test

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	cmssvc "github.com/serenya/go-cms/internal/application/cms"
	lessonsvc "github.com/serenya/go-cms/internal/application/lesson"
	sectionsvc "github.com/serenya/go-cms/internal/application/section"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/handler"
)

// ─── stub Section & Lesson Services ──────────────────────────────────────────

type stubSectionService struct{}

func (s *stubSectionService) Create(_ context.Context, _ sectionsvc.CreateRequest) (*entity.Section, error) {
	return &entity.Section{ID: 100}, nil
}
func (s *stubSectionService) GetByID(_ context.Context, id uint) (*entity.Section, error) {
	return &entity.Section{ID: id}, nil
}
func (s *stubSectionService) GetByCourseID(_ context.Context, _ uint) ([]*entity.Section, error) {
	return nil, nil
}
func (s *stubSectionService) Update(_ context.Context, id uint, _ sectionsvc.UpdateRequest) (*entity.Section, error) {
	return &entity.Section{ID: id}, nil
}
func (s *stubSectionService) Delete(_ context.Context, id uint) error { return nil }

type stubLessonService struct{}

func (s *stubLessonService) Create(_ context.Context, _ lessonsvc.CreateRequest) (*entity.Lesson, error) {
	return &entity.Lesson{ID: 200}, nil
}
func (s *stubLessonService) GetByID(_ context.Context, id uint) (*entity.Lesson, error) {
	return &entity.Lesson{ID: id}, nil
}
func (s *stubLessonService) GetBySectionID(_ context.Context, _ uint) ([]*entity.Lesson, error) {
	return nil, nil
}
func (s *stubLessonService) Update(_ context.Context, id uint, _ lessonsvc.UpdateRequest) (*entity.Lesson, error) {
	return &entity.Lesson{ID: id}, nil
}
func (s *stubLessonService) Delete(_ context.Context, id uint) error { return nil }

// ─── Helper to build Import Handler router ──────────────────────────────────

func newImportRouter(cmsSvc *stubCMSService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	
	// Create mock services
	secSvc := &stubSectionService{}
	lesSvc := &stubLessonService{}
	taskSvc := &stubTaskService{}

	h := handler.NewImportHandler(cmsSvc, taskSvc, secSvc, lesSvc)

	auth := authMiddleware(42, "admin")

	r.POST("/api/import/preview", h.Preview)
	r.POST("/api/import/confirm", auth, h.Confirm)
	return r
}

// ─── Test cases ──────────────────────────────────────────────────────────────

func TestImportPreview_MultipartFiles(t *testing.T) {
	svc := &stubCMSService{}
	r := newImportRouter(svc)

	body := new(bytes.Buffer)
	writer := multipart.NewWriter(body)

	// File 1: Markdown Article
	f1, err := writer.CreateFormFile("files", "article.md")
	if err != nil {
		t.Fatalf("failed to create form file: %v", err)
	}
	f1.Write([]byte("# Markdown Article Title\nBody text here"))

	// File 2: HTML Page
	f2, err := writer.CreateFormFile("files", "page.html")
	if err != nil {
		t.Fatalf("failed to create form file: %v", err)
	}
	f2.Write([]byte("<html><head><title>HTML Title</title></head><body><p>HTML Body</p></body></html>"))

	// File 3: Unsupported file
	f3, err := writer.CreateFormFile("files", "image.png")
	if err != nil {
		t.Fatalf("failed to create form file: %v", err)
	}
	f3.Write([]byte("binary image data"))

	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/import/preview", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Code int                      `json:"code"`
		Data dto.ImportPreviewResponse `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse json response: %v", err)
	}

	if resp.Data.Total != 3 {
		t.Errorf("expected 3 total items, got %d", resp.Data.Total)
	}
	if resp.Data.Valid != 2 {
		t.Errorf("expected 2 valid items, got %d", resp.Data.Valid)
	}
	if resp.Data.Invalid != 1 {
		t.Errorf("expected 1 invalid item, got %d", resp.Data.Invalid)
	}
}

func TestImportPreview_ZIPArchive(t *testing.T) {
	svc := &stubCMSService{}
	r := newImportRouter(svc)

	zipBuf := new(bytes.Buffer)
	zw := zip.NewWriter(zipBuf)

	f1, _ := zw.Create("doc1.md")
	f1.Write([]byte("# Doc 1 Title\nBody 1"))

	f2, _ := zw.Create("doc2.json")
	f2.Write([]byte(`{"title":"Doc 2 JSON","body":"Body 2"}`))

	zw.Close()

	body := new(bytes.Buffer)
	writer := multipart.NewWriter(body)

	filePart, err := writer.CreateFormFile("files", "bundle.zip")
	if err != nil {
		t.Fatalf("failed to create form file: %v", err)
	}
	filePart.Write(zipBuf.Bytes())
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/import/preview", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Code int                      `json:"code"`
		Data dto.ImportPreviewResponse `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse json response: %v", err)
	}

	if resp.Data.Total != 2 {
		t.Errorf("expected 2 extracted items from zip, got %d", resp.Data.Total)
	}
	if resp.Data.Valid != 2 {
		t.Errorf("expected 2 valid items from zip, got %d", resp.Data.Valid)
	}
}

func TestImportConfirm_Success(t *testing.T) {
	svc := &stubCMSService{getByIDResult: &entity.Article{ID: 1}}
	r := newImportRouter(svc)

	reqPayload := dto.ImportConfirmRequest{
		Items: []dto.ImportConfirmItem{
			{
				Type:        "ARTICLE",
				Title:       "Imported Article",
				Description: "Summary",
				Body:        "Article Body Text",
				ArticleType: "guide",
			},
			{
				Type:       "COURSE",
				Title:      "Imported Course",
				CourseType: "standard",
				Sections: []dto.ImportSectionItem{
					{
						Title: "Section 1",
						Order: 0,
						Lessons: []dto.ImportLessonItem{
							{Title: "Lesson 1", Type: "text", Body: "Lesson Body", Order: 0},
						},
					},
				},
			},
		},
	}

	w := doRequest(r, http.MethodPost, "/api/import/confirm", reqPayload)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Code int                      `json:"code"`
		Data dto.ImportConfirmResponse `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse JSON response: %v", err)
	}

	if resp.Data.Created != 2 {
		t.Errorf("expected 2 created items, got %d", resp.Data.Created)
	}
	if resp.Data.Failed != 0 {
		t.Errorf("expected 0 failed items, got %d", resp.Data.Failed)
	}
}

type stubCategoryService struct{}

func (s *stubCategoryService) GetAll(_ context.Context, _, _ int) ([]*entity.Category, int64, error) {
	return []*entity.Category{
		{ID: 5, Name: "Backend & APIs", Slug: "backend-apis"},
		{ID: 10, Name: "PKI & Cryptography", Slug: "pki-cryptography"},
	}, 2, nil
}
func (s *stubCategoryService) GetByID(_ context.Context, _ uint) (*entity.Category, error) { return nil, nil }
func (s *stubCategoryService) GetTree(_ context.Context, _ bool) ([]*entity.Category, error) { return nil, nil }
func (s *stubCategoryService) Create(_ context.Context, _ string, _ *uint) (*entity.Category, error) { return nil, nil }
func (s *stubCategoryService) Update(_ context.Context, _ uint, _ string, _ *uint, _ int) (*entity.Category, error) { return nil, nil }
func (s *stubCategoryService) Delete(_ context.Context, _ uint) error { return nil }
func (s *stubCategoryService) GetReviewerGroups(_ context.Context, _ uint) ([]entity.Group, error) { return nil, nil }
func (s *stubCategoryService) AddReviewerGroup(_ context.Context, _, _ uint) error { return nil }
func (s *stubCategoryService) RemoveReviewerGroup(_ context.Context, _, _ uint) error { return nil }
func (s *stubCategoryService) GetReviewers(_ context.Context, _ uint) ([]*entity.User, error) { return nil, nil }
func (s *stubCategoryService) GetGroupCategories(_ context.Context, _ uint) ([]*entity.Category, error) { return nil, nil }
func (s *stubCategoryService) CountPublishedArticles(_ context.Context, _ uint) (int64, error) { return 0, nil }

func TestImportPreview_CategoryResolutionAndValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	cmsSvc := &stubCMSService{}
	catSvc := &stubCategoryService{}
	h := handler.NewImportHandler(cmsSvc, &stubTaskService{}, &stubSectionService{}, &stubLessonService{}, catSvc)
	r.POST("/api/import/preview", h.Preview)

	body := new(bytes.Buffer)
	writer := multipart.NewWriter(body)

	// File 1: Valid matching category
	f1, _ := writer.CreateFormFile("files", "valid_cat.md")
	f1.Write([]byte("---\ntitle: \"Valid Category\"\ncategory: \"backend-apis\"\n---\nBody text"))

	// File 2: Unrecognized category
	f2, _ := writer.CreateFormFile("files", "invalid_cat.md")
	f2.Write([]byte("---\ntitle: \"Invalid Category\"\ncategory: \"backend\"\n---\nBody text"))

	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/import/preview", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Code int                      `json:"code"`
		Data dto.ImportPreviewResponse `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse JSON response: %v", err)
	}

	if resp.Data.Total != 2 {
		t.Fatalf("expected 2 items, got %d", resp.Data.Total)
	}

	// First item: matched category ID 5
	item1 := resp.Data.Items[0]
	if !item1.Valid {
		t.Errorf("expected item 1 to be valid, got error: %s", item1.Error)
	}
	if item1.CategoryID == nil || *item1.CategoryID != 5 {
		t.Errorf("expected categoryId 5 for item 1, got %v", item1.CategoryID)
	}

	// Second item: unrecognized category "backend" -> valid for preview, categoryID nil
	item2 := resp.Data.Items[1]
	if !item2.Valid {
		t.Errorf("expected item 2 to be valid for preview even with unrecognized category slug, got error: %s", item2.Error)
	}
	if item2.CategoryID != nil {
		t.Errorf("expected categoryId nil for unrecognized category, got %v", item2.CategoryID)
	}
}

type trackingCMSService struct {
	stubCMSService
	publishedIDs []uint
}

func (s *trackingCMSService) Create(_ context.Context, _ cmssvc.CreateRequest) (interface{}, error) {
	return &entity.Article{ID: 1}, nil
}

func (s *trackingCMSService) Publish(_ context.Context, id uint, _ entity.CMSType, _ *uint) error {
	s.publishedIDs = append(s.publishedIDs, id)
	return nil
}

func TestImportConfirm_DirectPublish(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("Admin user with PUBLISHED status triggers publish", func(t *testing.T) {
		svc := &trackingCMSService{}
		h := handler.NewImportHandler(svc, &stubTaskService{}, &stubSectionService{}, &stubLessonService{})
		r := gin.New()
		r.POST("/api/import/confirm", authMiddleware(42, "admin"), h.Confirm)

		reqPayload := dto.ImportConfirmRequest{
			Items: []dto.ImportConfirmItem{
				{
					Type:   "ARTICLE",
					Title:  "Direct Published Article",
					Body:   "Body content",
					Status: "PUBLISHED",
				},
			},
		}

		w := doRequest(r, http.MethodPost, "/api/import/confirm", reqPayload)
		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}
		if len(svc.publishedIDs) != 1 {
			t.Errorf("expected 1 published call for admin, got %d", len(svc.publishedIDs))
		}
	})

	t.Run("Non-admin user requesting PUBLISHED status falls back to DRAFT", func(t *testing.T) {
		svc := &trackingCMSService{}
		h := handler.NewImportHandler(svc, &stubTaskService{}, &stubSectionService{}, &stubLessonService{})
		r := gin.New()
		r.POST("/api/import/confirm", authMiddleware(42, "editor"), h.Confirm)

		reqPayload := dto.ImportConfirmRequest{
			Items: []dto.ImportConfirmItem{
				{
					Type:   "ARTICLE",
					Title:  "Editor Attempted Publish Article",
					Body:   "Body content",
					Status: "PUBLISHED",
				},
			},
		}

		w := doRequest(r, http.MethodPost, "/api/import/confirm", reqPayload)
		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}
		if len(svc.publishedIDs) != 0 {
			t.Errorf("expected 0 published calls for non-admin user, got %d", len(svc.publishedIDs))
		}
	})
}

