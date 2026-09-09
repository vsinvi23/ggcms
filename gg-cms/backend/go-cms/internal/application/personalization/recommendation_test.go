package personalization_test

import (
	"context"
	"testing"
	"time"

	"github.com/serenya/go-cms/internal/application/personalization"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type stubArticleRepo struct{}

func (s *stubArticleRepo) Create(ctx context.Context, article *entity.Article) error { return nil }
func (s *stubArticleRepo) Update(ctx context.Context, article *entity.Article) error { return nil }
func (s *stubArticleRepo) Delete(ctx context.Context, id uint) error                 { return nil }
func (s *stubArticleRepo) FindByID(ctx context.Context, id uint) (*entity.Article, error) {
	return &entity.Article{ID: id, Title: "Article Test"}, nil
}
func (s *stubArticleRepo) FindByPublicID(ctx context.Context, publicID string) (*entity.Article, error) {
	return nil, nil
}
func (s *stubArticleRepo) FindBySlug(ctx context.Context, slug string) (*entity.Article, error) {
	return nil, nil
}
func (s *stubArticleRepo) FindAll(ctx context.Context, filter repository.ArticleFilter, page, size int) ([]*entity.Article, int64, error) {
	arts := []*entity.Article{
		{ID: 10, Title: "Go Security", CategoryID: uintPtr(1)},
		{ID: 20, Title: "GCP Cloud Infrastructure", CategoryID: uintPtr(2)},
	}
	return arts, int64(len(arts)), nil
}
func (s *stubArticleRepo) FindPublished(ctx context.Context, page, size int) ([]*entity.Article, int64, error) {
	return nil, 0, nil
}
func (s *stubArticleRepo) FindPublishedByCategorySlug(ctx context.Context, slug string, page, size int) ([]*entity.Article, int64, error) {
	return nil, 0, nil
}
func (s *stubArticleRepo) UpdateStatus(ctx context.Context, id uint, status entity.CMSStatus, reviewerID *uint, comment *string, publishedAt *time.Time) error {
	return nil
}
func (s *stubArticleRepo) SaveSnapshot(ctx context.Context, id uint, a *entity.Article) error {
	return nil
}
func (s *stubArticleRepo) ClearSnapshot(ctx context.Context, id uint) error {
	return nil
}
func (s *stubArticleRepo) SaveReviewBaseline(ctx context.Context, id uint, body string, headline *string, summary *string) error {
	return nil
}
func (s *stubArticleRepo) SetReviewer(ctx context.Context, id uint, reviewerID *uint) error {
	return nil
}




func uintPtr(u uint) *uint { return &u }

func TestPersonalization_GetRecommendationsByRequest(t *testing.T) {
	svc := personalization.NewService(nil, &stubArticleRepo{}, nil, nil, nil, nil)
	ctx := context.Background()

	req := personalization.RecommendationRequest{
		ContentID:   1,
		ContentType: "ARTICLE",
		Mode:        personalization.ModeRelated,
		Limit:       5,
	}

	res, err := svc.GetRecommendationsByRequest(ctx, req)
	if err != nil {
		t.Fatalf("expected recommendation response success, got %v", err)
	}

	if len(res.Recommendations) == 0 {
		t.Logf("recommendations returned empty list as expected with nil topic repo")
	}
}

func TestPersonalization_RankCandidatesInvariants(t *testing.T) {
	svc := personalization.NewService(nil, &stubArticleRepo{}, nil, nil, nil, nil)
	ctx := context.Background()

	cands := []personalization.RecommendationCandidate{
		{
			ContentID:   10,
			ContentType: "ARTICLE",
			Signals: []personalization.CandidateSignal{
				{SignalType: "RELATIONSHIP_MATCH", SignalValue: 0.95},
			},
		},
		{
			ContentID:   20,
			ContentType: "ARTICLE",
			Signals: []personalization.CandidateSignal{
				{SignalType: "CATEGORY_MATCH", SignalValue: 0.5},
			},
		},
		// Duplicate for content ID 10
		{
			ContentID:   10,
			ContentType: "ARTICLE",
			Signals: []personalization.CandidateSignal{
				{SignalType: "TOPIC_MATCH", SignalValue: 0.8},
			},
		},
	}

	req := personalization.RecommendationRequest{
		ContentID:   1,
		ContentType: "ARTICLE",
		Mode:        personalization.ModeRelated,
	}

	scores, err := svc.RankCandidates(ctx, cands, req)
	if err != nil {
		t.Fatalf("expected success ranking candidates, got %v", err)
	}

	// Invariant 1: Deduplication by (ContentID, ContentType)
	if len(scores) != 2 {
		t.Fatalf("expected 2 deduplicated candidates, got %d", len(scores))
	}

	// Invariant 4: Deterministic ordering (highest score first)
	if scores[0].ContentID != 10 {
		t.Errorf("expected candidate 10 to rank first, got %d", scores[0].ContentID)
	}
	if scores[0].ReasonCode != "PREREQUISITE" {
		t.Errorf("expected PREREQUISITE reason code, got %s", scores[0].ReasonCode)
	}
}
