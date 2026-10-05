package handler_test

// import_images_test.go — zip image import, inline SVG and the overwrite/exists fixes.
//
// Rules covered:
//   - only a super admin gets images imported from a zip (and the zip size limits lifted)
//   - a plain admin keeps the limits and gets documents only, with a warning for image references
//   - relative image paths are stored and rewritten; inline <svg> becomes a sanitized data URI
//   - overwriting a course replaces its sections instead of appending (atomic), and an imported
//     slug is honoured on create

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	cmssvc "github.com/serenya/go-cms/internal/application/cms"
	sectionsvc "github.com/serenya/go-cms/internal/application/section"
	settingssvc "github.com/serenya/go-cms/internal/application/settings"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/infrastructure/storage"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/handler"
)

var tinyPNG, _ = base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")

// ─── stubs ────────────────────────────────────────────────────────────────────

type memStorage struct{ saved [][]byte }

func (m *memStorage) Save(f io.Reader, _ string, _ string, _ int64) (string, string, error) {
	b, _ := io.ReadAll(f)
	m.saved = append(m.saved, b)
	key := "k" + string(rune('0'+len(m.saved)))
	return key, "/uploads/" + key + ".png", nil
}
func (m *memStorage) Delete(string) error { return nil }
func (m *memStorage) Name() string        { return "mem" }

type stubSettings struct{ store *memStorage }

func (s *stubSettings) GetAll(context.Context) (map[string]string, error) { return nil, nil }
func (s *stubSettings) Set(context.Context, string, string) error         { return nil }
func (s *stubSettings) SetMany(context.Context, map[string]string) error  { return nil }
func (s *stubSettings) GetStorageProvider(context.Context) (storage.Provider, error) {
	return s.store, nil
}

var _ settingssvc.Service = (*stubSettings)(nil)

// groupUserService returns a fixed set of groups for the calling user.
type groupUserService struct {
	stubUserService
	groups []entity.Group
}

func (g *groupUserService) GetGroups(context.Context, uint) ([]entity.Group, error) {
	return g.groups, nil
}

// recordingSections records ReplaceCourseStructure calls.
type recordingSections struct {
	stubSectionService
	replaced   map[uint][]sectionsvc.StructureSection
	created    int
	replaceErr error
}

func (r *recordingSections) Create(_ context.Context, _ sectionsvc.CreateRequest) (*entity.Section, error) {
	r.created++
	return &entity.Section{ID: 1}, nil
}
func (r *recordingSections) ReplaceCourseStructure(_ context.Context, id uint, s []sectionsvc.StructureSection) error {
	if r.replaceErr != nil {
		return r.replaceErr
	}
	if r.replaced == nil {
		r.replaced = map[uint][]sectionsvc.StructureSection{}
	}
	r.replaced[id] = s
	return nil
}

// createCapture records the CreateRequest of the last Create and returns a course with an id.
type createCapture struct {
	stubCMSService
	last    cmssvc.CreateRequest
	updated []uint
}

func (c *createCapture) Create(_ context.Context, r cmssvc.CreateRequest) (interface{}, error) {
	c.last = r
	return &entity.Course{ID: 77}, nil
}
func (c *createCapture) Update(_ context.Context, id uint, _ entity.CMSType, _ cmssvc.UpdateRequest) (interface{}, error) {
	c.updated = append(c.updated, id)
	return &entity.Course{ID: id}, nil
}

// ─── helpers ──────────────────────────────────────────────────────────────────

func zipOf(t *testing.T, files map[string][]byte) []byte {
	t.Helper()
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)
	for n, d := range files {
		w, _ := zw.Create(n)
		w.Write(d)
	}
	zw.Close()
	return buf.Bytes()
}

func previewZip(t *testing.T, r *gin.Engine, z []byte) dto.ImportPreviewResponse {
	t.Helper()
	body := new(bytes.Buffer)
	mw := multipart.NewWriter(body)
	part, _ := mw.CreateFormFile("files", "bundle.zip")
	part.Write(z)
	mw.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/import/preview", body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("preview status %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Data dto.ImportPreviewResponse `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	return resp.Data
}

func previewRouter(role string, groups []entity.Group, st *memStorage) *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := handler.NewImportHandler(&stubCMSService{}, &stubTaskService{}, &stubSectionService{}, &stubLessonService{},
		&groupUserService{groups: groups}, &stubSettings{store: st})
	r := gin.New()
	r.POST("/api/import/preview", authMiddleware(42, role), h.Preview)
	return r
}

const mdWithImage = "# Guide\n\nIntro\n\n![diagram](./img/a.png)\n\n![diagram again](./img/a.png)\n"

// ─── super admin vs admin ─────────────────────────────────────────────────────

func TestImportPreview_SuperAdmin_StoresAndRewritesImages(t *testing.T) {
	st := &memStorage{}
	r := previewRouter("admin", []entity.Group{{Name: "SuperAdmin"}}, st)
	res := previewZip(t, r, zipOf(t, map[string][]byte{"docs/guide.md": []byte(mdWithImage), "docs/img/a.png": tinyPNG}))
	if res.Total != 1 || !res.Items[0].Valid {
		t.Fatalf("unexpected preview: %+v", res)
	}
	it := res.Items[0]
	if strings.Contains(it.Body, "./img/a.png") || strings.Count(it.Body, "/uploads/k1.png") != 2 {
		t.Errorf("body not rewritten: %q", it.Body)
	}
	if len(st.saved) != 1 {
		t.Errorf("the same image used twice must be stored once, stored %d", len(st.saved))
	}
	if len(it.Warnings) != 0 {
		t.Errorf("unexpected warnings: %v", it.Warnings)
	}
}

func TestImportPreview_PlainAdmin_NoImageImport_WithWarning(t *testing.T) {
	st := &memStorage{}
	r := previewRouter("admin", []entity.Group{{Name: "Admin"}}, st)
	res := previewZip(t, r, zipOf(t, map[string][]byte{"docs/guide.md": []byte(mdWithImage), "docs/img/a.png": tinyPNG}))
	it := res.Items[0]
	if len(st.saved) != 0 {
		t.Errorf("a plain admin must not store images, stored %d", len(st.saved))
	}
	if !strings.Contains(it.Body, "./img/a.png") {
		t.Errorf("references must be left as written: %q", it.Body)
	}
	if len(it.Warnings) == 0 || !strings.Contains(it.Warnings[0], "super admin") {
		t.Errorf("expected a super-admin warning, got %v", it.Warnings)
	}
}

func TestImportPreview_NonAdmin_NoImageImport(t *testing.T) {
	st := &memStorage{}
	r := previewRouter("user", []entity.Group{{Name: "SuperAdmin"}}, st) // group name alone is not enough: JWT role must be admin
	res := previewZip(t, r, zipOf(t, map[string][]byte{"g.md": []byte(mdWithImage), "img/a.png": tinyPNG}))
	if len(st.saved) != 0 || len(res.Items[0].Warnings) == 0 {
		t.Errorf("non-admin must not import images (stored=%d warnings=%v)", len(st.saved), res.Items[0].Warnings)
	}
}

func TestImportPreview_LimitsLiftedOnlyForSuperAdmin(t *testing.T) {
	// 501 tiny entries: over the standard 500-entry cap.
	files := map[string][]byte{"doc.md": []byte("# T\n\nbody")}
	for i := 0; i < 500; i++ {
		files["pad/"+strings.Repeat("x", i%7)+string(rune('a'+i%26))+string(rune('a'+(i/26)%26))+string(rune('a'+(i/676)%26))+".txt"] = []byte("p")
	}
	z := zipOf(t, files)

	admin := previewZip(t, previewRouter("admin", []entity.Group{{Name: "Admin"}}, &memStorage{}), z)
	if admin.Valid != 0 || !strings.Contains(admin.Items[0].Error, "maximum allowed") {
		t.Errorf("plain admin must hit the entry limit: %+v", admin.Items)
	}
	super := previewZip(t, previewRouter("admin", []entity.Group{{Name: "SuperAdmin"}}, &memStorage{}), z)
	if super.Valid != 1 {
		t.Errorf("super admin must not hit the entry limit: %+v", super.Items)
	}
}

// ─── inline SVG ───────────────────────────────────────────────────────────────

func TestImportPreview_InlineSVG_BecomesSanitizedDataURI(t *testing.T) {
	md := "# Diagram\n\n<svg viewBox=\"0 0 5 5\" onload=\"alert(1)\"><script>alert(1)</script><circle cx=\"2\" cy=\"2\" r=\"1\"/></svg>\n"
	// Works for every role: inline SVG needs no storage.
	r := previewRouter("user", nil, &memStorage{})
	res := previewZip(t, r, zipOf(t, map[string][]byte{"d.md": []byte(md)}))
	body := res.Items[0].Body
	if strings.Contains(body, "<svg") || !strings.Contains(body, "data:image/svg+xml;base64,") {
		t.Fatalf("inline svg not converted: %q", body)
	}
	enc := body[strings.Index(body, "base64,")+7:]
	enc = enc[:strings.Index(enc, ")")]
	raw, _ := base64.StdEncoding.DecodeString(enc)
	if strings.Contains(string(raw), "script") || strings.Contains(string(raw), "onload") || !strings.Contains(string(raw), "<circle") {
		t.Errorf("sanitization wrong: %s", raw)
	}
}

// ─── overwrite / exists fixes ────────────────────────────────────────────────

func confirmRouter(cms cmssvc.Service, sec sectionsvc.Service) *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := handler.NewImportHandler(cms, &stubTaskService{}, sec, &stubLessonService{})
	r := gin.New()
	r.POST("/api/import/confirm", authMiddleware(42, "admin"), h.Confirm)
	return r
}

func TestImportConfirm_Overwrite_ReplacesStructureAtomically(t *testing.T) {
	cms := &createCapture{}
	sec := &recordingSections{}
	r := confirmRouter(cms, sec)
	w := doRequest(r, http.MethodPost, "/api/import/confirm", dto.ImportConfirmRequest{Items: []dto.ImportConfirmItem{{
		Type: "COURSE", Title: "C", Exists: true, ExistingID: 9, Overwrite: true,
		Sections: []dto.ImportSectionItem{{Title: "S1", Lessons: []dto.ImportLessonItem{{Title: "L1", Body: "b"}}}},
	}}})
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	got, ok := sec.replaced[9]
	if !ok || len(got) != 1 || got[0].Title != "S1" || len(got[0].Lessons) != 1 {
		t.Fatalf("structure must be replaced for the existing course, got %+v", sec.replaced)
	}
	if sec.created != 0 {
		t.Errorf("overwrite must not append sections one by one (created %d)", sec.created)
	}
}

func TestImportConfirm_StructureFailure_IsReportedAndKeepsCourse(t *testing.T) {
	cms := &createCapture{}
	sec := &recordingSections{replaceErr: context.DeadlineExceeded}
	r := confirmRouter(cms, sec)
	w := doRequest(r, http.MethodPost, "/api/import/confirm", dto.ImportConfirmRequest{Items: []dto.ImportConfirmItem{{
		Type: "COURSE", Title: "C", Sections: []dto.ImportSectionItem{{Title: "S1"}},
	}}})
	var resp struct {
		Data dto.ImportConfirmResponse `json:"data"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Data.Failed != 1 || !strings.Contains(resp.Data.Results[0].Error, "structure import failed") {
		t.Errorf("a failed structure write must be reported: %+v", resp.Data)
	}
}

func TestImportConfirm_Create_HonoursImportedSlug(t *testing.T) {
	cms := &createCapture{}
	r := confirmRouter(cms, &recordingSections{})
	doRequest(r, http.MethodPost, "/api/import/confirm", dto.ImportConfirmRequest{Items: []dto.ImportConfirmItem{
		{Type: "ARTICLE", Title: "Some Title", Slug: "My Custom Slug!"},
	}})
	if cms.last.Slug == nil || *cms.last.Slug != "my-custom-slug" {
		t.Errorf("imported slug not passed through, got %v", cms.last.Slug)
	}
	doRequest(r, http.MethodPost, "/api/import/confirm", dto.ImportConfirmRequest{Items: []dto.ImportConfirmItem{
		{Type: "ARTICLE", Title: "No Slug Given"},
	}})
	if cms.last.Slug != nil {
		t.Errorf("no slug in the file must leave it to the repository, got %v", *cms.last.Slug)
	}
}

func TestImportConfirm_Skip_DoesNotTouchExisting(t *testing.T) {
	cms := &createCapture{}
	sec := &recordingSections{}
	r := confirmRouter(cms, sec)
	doRequest(r, http.MethodPost, "/api/import/confirm", dto.ImportConfirmRequest{Items: []dto.ImportConfirmItem{{
		Type: "COURSE", Title: "C", Exists: true, ExistingID: 9, Overwrite: false,
		Sections: []dto.ImportSectionItem{{Title: "S1"}},
	}}})
	if len(cms.updated) != 0 || len(sec.replaced) != 0 {
		t.Errorf("a skipped duplicate must not be modified: updated=%v replaced=%v", cms.updated, sec.replaced)
	}
}

func TestImportConfirm_LearningPath_RejectsUnknownKind(t *testing.T) {
	r := confirmRouter(&createCapture{}, &recordingSections{})
	w := doRequest(r, http.MethodPost, "/api/import/confirm", dto.ImportConfirmRequest{Items: []dto.ImportConfirmItem{
		{Type: "LEARNING_PATH", Title: "P", Kind: "DevOps Engineer"},
	}})
	var resp struct {
		Data dto.ImportConfirmResponse `json:"data"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Data.Failed != 1 || !strings.Contains(resp.Data.Results[0].Error, "invalid learning path kind") {
		t.Errorf("unknown kind must be rejected: %+v", resp.Data)
	}
}
