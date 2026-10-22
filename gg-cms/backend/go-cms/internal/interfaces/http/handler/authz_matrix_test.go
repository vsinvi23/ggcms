package handler_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	cmssvc "github.com/serenya/go-cms/internal/application/cms"
	commentsvc "github.com/serenya/go-cms/internal/application/comment"
	groupsvc "github.com/serenya/go-cms/internal/application/group"
	"github.com/serenya/go-cms/internal/application/identity"
	notificationsvc "github.com/serenya/go-cms/internal/application/notification"
	tagsvc "github.com/serenya/go-cms/internal/application/tag"
	usersvc "github.com/serenya/go-cms/internal/application/user"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/handler"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func send(r *gin.Engine, method, path, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	rq := httptest.NewRequest(method, path, strings.NewReader(body))
	rq.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, rq)
	return w
}

type caller struct {
	name string
	id   uint
	role string
}

var (
	owner    = caller{"owner", 10, "user"}
	reviewer = caller{"assigned reviewer", 20, "user"}
	stranger = caller{"stranger", 30, "user"}
	admin    = caller{"admin", 1, "admin"}
)

func TestCMSVisibilityMatrix(t *testing.T) {
	reviewerID := reviewer.id
	draft := &entity.Article{ID: 1, CreatedByID: owner.id, ReviewerID: &reviewerID, Status: entity.CMSStatusDraft}
	published := &entity.Article{ID: 1, CreatedByID: owner.id, Status: entity.CMSStatusPublished}

	cases := []struct {
		name   string
		item   *entity.Article
		path   string
		caller caller
		want   int
	}{
		{"draft read by owner", draft, "/api/cms/1", owner, http.StatusOK},
		{"draft read by assigned reviewer", draft, "/api/cms/1", reviewer, http.StatusOK},
		{"draft read by admin", draft, "/api/cms/1", admin, http.StatusOK},
		{"draft hidden from stranger", draft, "/api/cms/1", stranger, http.StatusNotFound},
		{"published read by stranger", published, "/api/cms/1", stranger, http.StatusOK},
		{"history of draft hidden from stranger", draft, "/api/cms/1/activity", stranger, http.StatusNotFound},
		{"history of published hidden from stranger", published, "/api/cms/1/activity", stranger, http.StatusNotFound},
		{"history readable by owner", published, "/api/cms/1/activity", owner, http.StatusOK},
		{"history readable by admin", draft, "/api/cms/1/activity", admin, http.StatusOK},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := gin.New()
			h := handler.NewCMSHandler(&stubCMSService{getByIDResult: tc.item}, &stubTaskService{}, nil)
			auth := authMiddleware(tc.caller.id, tc.caller.role)
			r.GET("/api/cms/:id", auth, h.GetByID)
			r.GET("/api/cms/:id/activity", auth, h.GetActivity)
			if w := send(r, http.MethodGet, tc.path, ""); w.Code != tc.want {
				t.Fatalf("got %d want %d: %s", w.Code, tc.want, w.Body)
			}
		})
	}
}

type stubCommentService struct {
	parent  *entity.ReviewComment
	replies []*entity.ReviewComment
	listed  bool
}

func (s *stubCommentService) GetByContent(context.Context, string, string) ([]*entity.ReviewComment, error) {
	return s.replies, nil
}
func (s *stubCommentService) GetByID(context.Context, string) (*entity.ReviewComment, error) {
	if s.parent == nil {
		return nil, errors.New("comment not found")
	}
	return s.parent, nil
}
func (s *stubCommentService) ListReplies(context.Context, string, int, int) ([]*entity.ReviewComment, int64, error) {
	s.listed = true
	return s.replies, int64(len(s.replies)), nil
}
func (s *stubCommentService) Create(context.Context, commentsvc.CreateRequest) (*entity.ReviewComment, error) {
	return nil, nil
}
func (s *stubCommentService) Delete(context.Context, string, uint, bool) error { return nil }

func TestReviewCommentVisibilityAndEmailRedaction(t *testing.T) {
	reviewerID := reviewer.id
	draft := &entity.Article{ID: 1, CreatedByID: owner.id, ReviewerID: &reviewerID, Status: entity.CMSStatusDraft}
	published := &entity.Article{ID: 1, CreatedByID: owner.id, Status: entity.CMSStatusPublished}
	parentID := primitive.NewObjectID()
	mk := func() *stubCommentService {
		return &stubCommentService{
			parent: &entity.ReviewComment{ID: parentID, ContentType: "article", ContentID: "1", AuthorID: owner.id},
			replies: []*entity.ReviewComment{
				{ID: primitive.NewObjectID(), ContentType: "article", ContentID: "1", AuthorID: reviewer.id, AuthorEmail: "reviewer@x.io"},
				{ID: primitive.NewObjectID(), ContentType: "article", ContentID: "1", AuthorID: stranger.id, AuthorEmail: "stranger@x.io"},
			},
		}
	}
	emailsOf := func(w *httptest.ResponseRecorder) map[string]string {
		var body struct {
			Data []struct {
				Author struct {
					ID    uint   `json:"id"`
					Email string `json:"email"`
				} `json:"author"`
			} `json:"data"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &body)
		out := map[string]string{}
		for _, d := range body.Data {
			out[fmt.Sprint(d.Author.ID)] = d.Author.Email
		}
		return out
	}

	byContent := "/api/review-comments?filters[contentType]=article&filters[contentId]=1"
	replies := "/api/review-comments/" + parentID.Hex() + "/replies"
	cases := []struct {
		name      string
		item      *entity.Article
		caller    caller
		path      string
		want      int
		wantMails map[string]string
	}{
		{"replies of draft hidden from stranger", draft, stranger, replies, http.StatusNotFound, nil},
		{"replies of draft visible to owner, others' emails redacted", draft, owner, replies, http.StatusOK,
			map[string]string{"20": "", "30": ""}},
		{"replies of draft visible to admin with emails", draft, admin, replies, http.StatusOK,
			map[string]string{"20": "reviewer@x.io", "30": "stranger@x.io"}},
		{"replies of published visible to stranger, own email kept", published, stranger, replies, http.StatusOK,
			map[string]string{"20": "", "30": "stranger@x.io"}},
		{"comments of draft hidden from stranger", draft, stranger, byContent, http.StatusNotFound, nil},
		{"comments of published redacted for stranger", published, stranger, byContent, http.StatusOK,
			map[string]string{"20": "", "30": "stranger@x.io"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			cs := mk()
			r := gin.New()
			h := handler.NewCommentHandler(cs, &stubCMSService{getByIDResult: c.item})
			auth := authMiddleware(c.caller.id, c.caller.role)
			r.GET("/api/review-comments", auth, h.GetByContent)
			r.GET("/api/review-comments/:id/replies", auth, h.ListReplies)
			w := send(r, http.MethodGet, c.path, "")
			if w.Code != c.want {
				t.Fatalf("got %d want %d: %s", w.Code, c.want, w.Body)
			}
			if c.want == http.StatusNotFound && cs.listed {
				t.Fatal("replies were fetched before the visibility check")
			}
			if c.wantMails != nil {
				got := emailsOf(w)
				for id, mail := range c.wantMails {
					if got[id] != mail {
						t.Fatalf("author %s email = %q, want %q", id, got[id], mail)
					}
				}
			}
		})
	}

	t.Run("replies of unknown parent", func(t *testing.T) {
		cs := mk()
		cs.parent = nil
		r := gin.New()
		r.GET("/api/review-comments/:id/replies", authMiddleware(admin.id, admin.role),
			handler.NewCommentHandler(cs, &stubCMSService{}).ListReplies)
		if w := send(r, http.MethodGet, replies, ""); w.Code != http.StatusNotFound {
			t.Fatalf("got %d", w.Code)
		}
	})
}

type stubNotifService struct {
	notificationsvc.Service
	gotID, gotUser uint
	listedFor      uint
}

func (s *stubNotifService) MarkAsRead(_ context.Context, id, userID uint) error {
	s.gotID, s.gotUser = id, userID
	return nil
}
func (s *stubNotifService) GetByUserID(_ context.Context, userID uint, _, _ int) ([]*entity.Notification, int64, error) {
	s.listedFor = userID
	return nil, 0, nil
}

func TestNotificationOwnershipIsBoundToAuthenticatedUser(t *testing.T) {
	for _, c := range []caller{owner, stranger, admin} {
		t.Run(c.name, func(t *testing.T) {
			svc := &stubNotifService{}
			h := handler.NewNotificationHandler(svc)
			r := gin.New()
			auth := authMiddleware(c.id, c.role)
			r.PATCH("/api/notifications/:id/read", auth, h.MarkAsRead)
			r.GET("/api/notifications", auth, h.GetAll)

			if w := send(r, http.MethodPatch, "/api/notifications/5/read?userId=999", ""); w.Code != http.StatusOK {
				t.Fatalf("got %d", w.Code)
			}
			if svc.gotID != 5 || svc.gotUser != c.id {
				t.Fatalf("service called with notification %d user %d, want 5/%d", svc.gotID, svc.gotUser, c.id)
			}
			send(r, http.MethodGet, "/api/notifications?userId=999", "")
			if svc.listedFor != c.id {
				t.Fatalf("listed notifications for %d, want %d", svc.listedFor, c.id)
			}
		})
	}
}

type lastAdminUserSvc struct{ usersvc.Service }

func (lastAdminUserSvc) Update(context.Context, uint, string, *string, *string, *uint) (*entity.User, error) {
	return nil, usersvc.ErrLastAdmin
}
func (lastAdminUserSvc) Delete(context.Context, uint) error     { return usersvc.ErrLastAdmin }
func (lastAdminUserSvc) Deactivate(context.Context, uint) error { return usersvc.ErrLastAdmin }

type lastAdminGroupSvc struct{ groupsvc.Service }

func (lastAdminGroupSvc) RemoveMember(context.Context, uint, uint) error { return identity.ErrLastAdmin }

func TestLastAdminGuardReturnsConflict(t *testing.T) {
	r := gin.New()
	auth := authMiddleware(admin.id, admin.role)
	uh := handler.NewUserHandler(lastAdminUserSvc{})
	gh := handler.NewGroupHandler(lastAdminGroupSvc{})
	r.PUT("/api/users/:id", auth, uh.Update)
	r.DELETE("/api/users/:id", auth, uh.Delete)
	r.POST("/api/users/:id/deactivate", auth, uh.Deactivate)
	r.DELETE("/api/user-groups/:id/members/:userId", auth, gh.RemoveMember)

	cases := []struct{ method, path string }{
		{http.MethodPut, "/api/users/2"},
		{http.MethodDelete, "/api/users/2"},
		{http.MethodPost, "/api/users/2/deactivate"},
		{http.MethodDelete, "/api/user-groups/1/members/2"},
	}
	for _, c := range cases {
		t.Run(c.method+" "+c.path, func(t *testing.T) {
			if w := send(r, c.method, c.path, `{"name":"x"}`); w.Code != http.StatusConflict {
				t.Fatalf("got %d want 409: %s", w.Code, w.Body)
			}
		})
	}
}

type stubTagService struct{ tagsvc.Service }

func (stubTagService) Create(context.Context, string) (*entity.Tag, error) { return &entity.Tag{}, nil }
func (stubTagService) Delete(context.Context, uint) error                   { return nil }

func TestTagWritesAreAdminOnly(t *testing.T) {
	h := handler.NewTagHandler(stubTagService{})
	cases := []struct {
		caller caller
		method string
		path   string
		want   int
	}{
		{stranger, http.MethodPost, "/api/tags", http.StatusForbidden},
		{stranger, http.MethodDelete, "/api/tags/1", http.StatusForbidden},
		{owner, http.MethodPost, "/api/tags", http.StatusForbidden},
		{admin, http.MethodPost, "/api/tags", http.StatusCreated},
		{admin, http.MethodDelete, "/api/tags/1", http.StatusOK},
	}
	for _, c := range cases {
		t.Run(fmt.Sprintf("%s %s %s", c.caller.name, c.method, c.path), func(t *testing.T) {
			r := gin.New()
			p := r.Group("/api", authMiddleware(c.caller.id, c.caller.role))
			p.POST("tags", middleware.AdminOnly(), h.Create)
			p.DELETE("tags/:id", middleware.AdminOnly(), h.Delete)
			if w := send(r, c.method, c.path, `{"name":"go"}`); w.Code != c.want {
				t.Fatalf("got %d want %d: %s", w.Code, c.want, w.Body)
			}
		})
	}
}

var _ cmssvc.Service = (*stubCMSService)(nil)
