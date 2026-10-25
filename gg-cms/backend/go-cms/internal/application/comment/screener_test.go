package comment

import (
	"context"
	"testing"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type stubRepo struct {
	repository.CommentRepository
	stored []*entity.ReviewComment
}

func (r *stubRepo) Create(_ context.Context, c *entity.ReviewComment) error {
	c.ID = primitive.NewObjectID()
	r.stored = append(r.stored, c)
	return nil
}

func (r *stubRepo) FindByContentTypeAndID(context.Context, string, string) ([]*entity.ReviewComment, error) {
	return r.stored, nil
}

type stubScreener struct{ hidden map[string]bool }

func (s *stubScreener) Screen(_ context.Context, id, _, _ string, _ uint, text string) bool {
	if text == "spam" {
		s.hidden[id] = true
		return true
	}
	return false
}

func (s *stubScreener) HiddenIDs(context.Context, []string) map[string]bool { return s.hidden }

func TestFlaggedCommentsAreHiddenUntilApproved(t *testing.T) {
	repo := &stubRepo{}
	scr := &stubScreener{hidden: map[string]bool{}}
	svc := NewServiceWithScreener(repo, scr)

	ok, err := svc.Create(context.Background(), CreateRequest{Content: "nice", ContentType: "article", ContentID: "1"})
	if err != nil || ok.ModerationStatus != "" {
		t.Fatalf("clean: %+v %v", ok, err)
	}
	bad, err := svc.Create(context.Background(), CreateRequest{Content: "spam", ContentType: "article", ContentID: "1"})
	if err != nil || bad.ModerationStatus != "pending_review" {
		t.Fatalf("flagged: %+v %v", bad, err)
	}
	list, _ := svc.GetByContent(context.Background(), "article", "1")
	if len(list) != 1 || list[0].Content != "nice" {
		t.Fatalf("flagged comment must be hidden from listings: %+v", list)
	}
	delete(scr.hidden, bad.ID.Hex())
	if list, _ = svc.GetByContent(context.Background(), "article", "1"); len(list) != 2 {
		t.Fatalf("approved comment must reappear: %d", len(list))
	}
}

func TestNoScreenerKeepsLegacyBehaviour(t *testing.T) {
	svc := NewService(&stubRepo{})
	if c, err := svc.Create(context.Background(), CreateRequest{Content: "spam"}); err != nil || c.ModerationStatus != "" {
		t.Fatalf("%+v %v", c, err)
	}
}
