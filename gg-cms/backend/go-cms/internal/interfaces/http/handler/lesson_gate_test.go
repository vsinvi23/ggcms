package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	sectionsvc "github.com/serenya/go-cms/internal/application/section"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/handler"
)

type sectionTree struct {
	sectionsvc.Service
	sections []*entity.Section
}

func (s *sectionTree) GetByCourseID(context.Context, uint) ([]*entity.Section, error) {
	return s.sections, nil
}

func str(s string) *string { return &s }

func courseTree() []*entity.Section {
	return []*entity.Section{
		{ID: 1, Title: "Intro", Order: 1, Lessons: []entity.Lesson{
			{ID: 10, Title: "L1", Content: str("FIRST-BODY"), Order: 1},
			{ID: 11, Title: "L2", Content: str("SECOND-BODY"), Order: 2},
		}, ChildSections: []entity.Section{
			{ID: 3, Title: "Nested", Lessons: []entity.Lesson{{ID: 12, Title: "L3", Content: str("NESTED-BODY")}}},
		}},
		{ID: 2, Title: "Advanced", Order: 2, Lessons: []entity.Lesson{{ID: 13, Title: "L4", Content: str("LAST-BODY")}}},
	}
}

func publishedCourse() *entity.Course {
	return &entity.Course{ID: 7, Title: "Course", Status: entity.CMSStatusPublished}
}

func sectionsRouter(policy handler.LessonPreviewPolicy, cms *stubCMSService, userID uint) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	sh := handler.NewSectionHandler(&sectionTree{sections: courseTree()}, cms)
	sh.SetLessonPreview(policy)
	r.GET("/api/sections", optionalAuth(userID, "user"), sh.GetAll)
	return r
}

const sectionsURL = "/api/sections?filters[course][id][$eq]=7"

func TestSections_DefaultFirstLessonOnlyForAnonymous(t *testing.T) {
	r := sectionsRouter("", &stubCMSService{getByIDResult: publishedCourse()}, 0)
	w := doRequest(r, http.MethodGet, sectionsURL, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	body := w.Body.String()
	if !strings.Contains(body, "FIRST-BODY") {
		t.Fatalf("first lesson must be open: %s", body)
	}
	for _, secret := range []string{"SECOND-BODY", "NESTED-BODY", "LAST-BODY"} {
		if strings.Contains(body, secret) {
			t.Fatalf("anonymous caller must not receive %s: %s", secret, body)
		}
	}
	var out struct {
		Data []struct {
			Lessons []struct {
				ID     uint    `json:"id"`
				Locked bool    `json:"locked"`
				Body   *string `json:"content"`
			}
		}
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	l := out.Data[0].Lessons
	if l[0].Locked || !l[1].Locked || l[1].Body != nil || !out.Data[1].Lessons[0].Locked {
		t.Fatalf("unexpected lock flags: %+v", out.Data)
	}
}

func TestSections_NonePolicyLocksEverythingForAnonymous(t *testing.T) {
	r := sectionsRouter(handler.LessonPreviewNone, &stubCMSService{getByIDResult: publishedCourse()}, 0)
	w := doRequest(r, http.MethodGet, sectionsURL, nil)
	if strings.Contains(w.Body.String(), "FIRST-BODY") || !strings.Contains(w.Body.String(), `"locked":true`) {
		t.Fatalf("none policy must lock every lesson: %s", w.Body)
	}
}

func TestSections_AllPolicyAndAuthenticatedUsersSeeEverything(t *testing.T) {
	for name, r := range map[string]*gin.Engine{
		"all policy":    sectionsRouter(handler.LessonPreviewAll, &stubCMSService{getByIDResult: publishedCourse()}, 0),
		"authenticated": sectionsRouter(handler.LessonPreviewNone, &stubCMSService{getByIDResult: publishedCourse()}, 5),
	} {
		w := doRequest(r, http.MethodGet, sectionsURL, nil)
		for _, want := range []string{"FIRST-BODY", "SECOND-BODY", "NESTED-BODY", "LAST-BODY"} {
			if !strings.Contains(w.Body.String(), want) {
				t.Fatalf("%s: missing %s in %s", name, want, w.Body)
			}
		}
		if strings.Contains(w.Body.String(), `"locked"`) {
			t.Fatalf("%s: nothing should be locked: %s", name, w.Body)
		}
	}
}

func TestSections_AnonymousCannotReadDraftCourseLessons(t *testing.T) {
	r := sectionsRouter("", &stubCMSService{getByIDResult: draftCourse(1)}, 0)
	if w := doRequest(r, http.MethodGet, sectionsURL, nil); w.Code != http.StatusNotFound {
		t.Fatalf("draft course lessons must not be public, got %d", w.Code)
	}
}

func TestParseLessonPreview(t *testing.T) {
	for in, want := range map[string]handler.LessonPreviewPolicy{
		"": handler.LessonPreviewFirst, "first": handler.LessonPreviewFirst, "NONE": handler.LessonPreviewNone,
		" all ": handler.LessonPreviewAll, "bogus": handler.LessonPreviewFirst,
	} {
		if got := handler.ParseLessonPreview(in); got != want {
			t.Errorf("ParseLessonPreview(%q)=%s want %s", in, got, want)
		}
	}
}

func TestPublicCourse_SnapshotLessonBodiesAreGatedAndBaselineHidden(t *testing.T) {
	snap := `[{"id":1,"title":"S","description":"","order":1,"lessons":[{"id":10,"title":"L1","type":"text","content":"FIRST-BODY","order":1},{"id":11,"title":"L2","type":"text","content":"SECOND-BODY","order":2}],"childSections":[]}]`
	course := publishedCourse()
	course.PublishedChaptersSnapshot = &snap
	course.ReviewBaselineChapters = &snap

	anon := newPublicRouter(&stubCMSService{getByIDResult: course}, 0, "")
	body := doRequest(anon, http.MethodGet, "/api/public/courses/7", nil).Body.String()
	if !strings.Contains(body, "FIRST-BODY") || strings.Contains(body, "SECOND-BODY") {
		t.Fatalf("anonymous snapshot must expose only the first lesson: %s", body)
	}
	if strings.Contains(body, "reviewBaselineChapters") {
		t.Fatalf("review baseline must not be public: %s", body)
	}

	authed := newPublicRouter(&stubCMSService{getByIDResult: course}, 9, "user")
	body = doRequest(authed, http.MethodGet, "/api/public/courses/7", nil).Body.String()
	if !strings.Contains(body, "SECOND-BODY") {
		t.Fatalf("authenticated callers get the full snapshot: %s", body)
	}
}
