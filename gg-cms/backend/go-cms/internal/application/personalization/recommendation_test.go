package personalization_test

import (
	"context"
	"testing"
	"time"

	"github.com/serenya/go-cms/internal/application/personalization"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

// stubArticleRepo honors CategoryID filtering (unlike the earlier version of this
// stub, which returned the same fixed articles regardless of filter) so tests can
// actually verify category-scoping bugs.
type stubArticleRepo struct {
	articles []*entity.Article
}

func newStubArticleRepo() *stubArticleRepo {
	return &stubArticleRepo{
		articles: []*entity.Article{
			{ID: 10, Title: "Go Security", CategoryID: uintPtr(1)},
			{ID: 11, Title: "Zero Trust Basics", CategoryID: uintPtr(1)},
			{ID: 20, Title: "GCP Cloud Infrastructure", CategoryID: uintPtr(2)},
		},
	}
}

func (s *stubArticleRepo) Create(ctx context.Context, article *entity.Article) error { return nil }
func (s *stubArticleRepo) Update(ctx context.Context, article *entity.Article) error { return nil }
func (s *stubArticleRepo) Delete(ctx context.Context, id uint) error                 { return nil }
func (s *stubArticleRepo) FindByID(ctx context.Context, id uint) (*entity.Article, error) {
	for _, a := range s.articles {
		if a.ID == id {
			return a, nil
		}
	}
	return &entity.Article{ID: id, Title: "Article Test"}, nil
}
func (s *stubArticleRepo) FindByPublicID(ctx context.Context, publicID string) (*entity.Article, error) {
	return nil, nil
}
func (s *stubArticleRepo) FindBySlug(ctx context.Context, slug string) (*entity.Article, error) {
	return nil, nil
}
func (s *stubArticleRepo) FindAll(ctx context.Context, filter repository.ArticleFilter, page, size int) ([]*entity.Article, int64, error) {
	var out []*entity.Article
	for _, a := range s.articles {
		if filter.CategoryID != nil && (a.CategoryID == nil || *a.CategoryID != *filter.CategoryID) {
			continue
		}
		out = append(out, a)
	}
	return out, int64(len(out)), nil
}
func (s *stubArticleRepo) FindPublished(ctx context.Context, page, size int) ([]*entity.Article, int64, error) {
	return nil, 0, nil
}
func (s *stubArticleRepo) FindPublishedByCategorySlug(ctx context.Context, slug string, page, size int) ([]*entity.Article, int64, error) {
	return nil, 0, nil
}
func (s *stubArticleRepo) CountPublishedByDomainID(ctx context.Context, domainID uint) (int64, error) {
	return 0, nil
}
func (s *stubArticleRepo) CountPublishedByCategoryID(ctx context.Context, categoryID uint) (int64, error) {
	return 0, nil
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
func (s *stubArticleRepo) SaveReviewBaseline(ctx context.Context, id uint, title string, description *string, body *string) error {
	return nil
}
func (s *stubArticleRepo) SetReviewer(ctx context.Context, id uint, reviewerID *uint) error {
	return nil
}

// stubCourseRepo mirrors stubArticleRepo — honors CategoryID filtering.
type stubCourseRepo struct {
	courses []*entity.Course
}

func newStubCourseRepo() *stubCourseRepo {
	return &stubCourseRepo{
		courses: []*entity.Course{
			{ID: 30, Title: "Cloud Fundamentals", CategoryID: uintPtr(2)},
		},
	}
}

func (s *stubCourseRepo) Create(ctx context.Context, course *entity.Course) error { return nil }
func (s *stubCourseRepo) Update(ctx context.Context, course *entity.Course) error { return nil }
func (s *stubCourseRepo) Delete(ctx context.Context, id uint) error               { return nil }
func (s *stubCourseRepo) FindByID(ctx context.Context, id uint) (*entity.Course, error) {
	for _, c := range s.courses {
		if c.ID == id {
			return c, nil
		}
	}
	return &entity.Course{ID: id, Title: "Course Test"}, nil
}
func (s *stubCourseRepo) FindByPublicID(ctx context.Context, publicID string) (*entity.Course, error) {
	return nil, nil
}
func (s *stubCourseRepo) FindBySlug(ctx context.Context, slug string) (*entity.Course, error) {
	return nil, nil
}
func (s *stubCourseRepo) FindAll(ctx context.Context, filter repository.CourseFilter, page, size int) ([]*entity.Course, int64, error) {
	var out []*entity.Course
	for _, c := range s.courses {
		if filter.CategoryID != nil && (c.CategoryID == nil || *c.CategoryID != *filter.CategoryID) {
			continue
		}
		out = append(out, c)
	}
	return out, int64(len(out)), nil
}
func (s *stubCourseRepo) FindPublished(ctx context.Context, page, size int) ([]*entity.Course, int64, error) {
	return nil, 0, nil
}
func (s *stubCourseRepo) FindPublishedByCategorySlug(ctx context.Context, slug string, page, size int) ([]*entity.Course, int64, error) {
	return nil, 0, nil
}
func (s *stubCourseRepo) CountPublishedByDomainID(ctx context.Context, domainID uint) (int64, error) {
	return 0, nil
}
func (s *stubCourseRepo) UpdateStatus(ctx context.Context, id uint, status entity.CMSStatus, reviewerID *uint, comment *string, publishedAt *time.Time) error {
	return nil
}
func (s *stubCourseRepo) SaveSnapshot(ctx context.Context, id uint, c *entity.Course) error {
	return nil
}
func (s *stubCourseRepo) ClearSnapshot(ctx context.Context, id uint) error { return nil }
func (s *stubCourseRepo) SaveReviewBaseline(ctx context.Context, id uint, title string, description *string, body *string) error {
	return nil
}
func (s *stubCourseRepo) SaveChaptersSnapshot(ctx context.Context, id uint, chaptersJSON string) error {
	return nil
}
func (s *stubCourseRepo) SaveReviewBaselineChapters(ctx context.Context, id uint, chaptersJSON string) error {
	return nil
}
func (s *stubCourseRepo) SetReviewer(ctx context.Context, id uint, reviewerID *uint) error {
	return nil
}

// stubTopicRepository provides realistic fixture data so GenerateTopicCandidates and
// GenerateRelationshipCandidates are actually exercised (the prior tests passed a nil
// TopicRepository, which made both generators unconditionally short-circuit to nil).
type stubTopicRepository struct {
	// contentTopics maps "contentID:contentType" -> ContentTopic rows
	contentTopics map[string][]*entity.ContentTopic
	reachable     map[uint][]*repository.ReachableTopic
}

func newStubTopicRepository() *stubTopicRepository {
	// Fixture: article 1 (ARTICLE) is tagged with topic 100 (OAuth 2.0).
	// article 10 (ARTICLE) is also tagged with topic 100 -> shares topic with article 1.
	// topic 100 --PREREQUISITE_OF--> topic 200 (OIDC), and article 20 is tagged with topic 200.
	return &stubTopicRepository{
		contentTopics: map[string][]*entity.ContentTopic{
			"1:ARTICLE": {
				{ContentID: 1, ContentType: "ARTICLE", TopicID: 100, Role: "PRIMARY", Weight: 1.0},
			},
			"100": { // keyed by topic ID for FindContentByTopicIDs lookups
				{ContentID: 1, ContentType: "ARTICLE", TopicID: 100, Role: "PRIMARY", Weight: 1.0},
				{ContentID: 10, ContentType: "ARTICLE", TopicID: 100, Role: "PRIMARY", Weight: 0.9},
			},
			"200": {
				{ContentID: 20, ContentType: "ARTICLE", TopicID: 200, Role: "PRIMARY", Weight: 1.0},
			},
		},
		reachable: map[uint][]*repository.ReachableTopic{
			100: {
				{
					Topic:            &entity.Topic{ID: 200, Name: "OpenID Connect", Slug: "openid-connect"},
					Depth:            1,
					RelationshipType: "PREREQUISITE_OF",
					Weight:           0.95,
				},
			},
		},
	}
}

func (r *stubTopicRepository) Create(ctx context.Context, t *entity.Topic) error { return nil }
func (r *stubTopicRepository) FindAll(ctx context.Context) ([]*entity.Topic, error) {
	return nil, nil
}
func (r *stubTopicRepository) FindByID(ctx context.Context, id uint) (*entity.Topic, error) {
	return nil, nil
}
func (r *stubTopicRepository) FindBySlug(ctx context.Context, slug string) (*entity.Topic, error) {
	return nil, nil
}
func (r *stubTopicRepository) FindBySlugs(ctx context.Context, slugs []string) ([]*entity.Topic, error) {
	return nil, nil
}
func (r *stubTopicRepository) Update(ctx context.Context, t *entity.Topic) error { return nil }
func (r *stubTopicRepository) Delete(ctx context.Context, id uint) error        { return nil }
func (r *stubTopicRepository) ListRelationships(ctx context.Context, topicID uint) ([]*entity.TopicRelationship, error) {
	return nil, nil
}
func (r *stubTopicRepository) SetRelationships(ctx context.Context, topicID uint, rels []entity.TopicRelationship) error {
	return nil
}
func (r *stubTopicRepository) GetContentTopics(ctx context.Context, contentID uint, contentType string) ([]*entity.Topic, error) {
	entries := r.contentTopics[contentKeyReal(contentID, contentType)]
	var topics []*entity.Topic
	for _, e := range entries {
		topics = append(topics, &entity.Topic{ID: e.TopicID})
	}
	return topics, nil
}
func (r *stubTopicRepository) GetContentTopicEntries(ctx context.Context, contentID uint, contentType string) ([]*entity.ContentTopic, error) {
	return r.contentTopics[contentKeyReal(contentID, contentType)], nil
}
func (r *stubTopicRepository) SetContentTopics(ctx context.Context, contentID uint, contentType string, topicIDs []uint) error {
	return nil
}
func (r *stubTopicRepository) SetContentTopicEntries(ctx context.Context, contentID uint, contentType string, entries []entity.ContentTopic) error {
	return nil
}
func (r *stubTopicRepository) ResolveTopic(ctx context.Context, rawName string) (*repository.TopicResolutionResult, error) {
	return nil, nil
}
func (r *stubTopicRepository) FindReachable(ctx context.Context, topicID uint, maxDepth int) ([]*repository.ReachableTopic, error) {
	return r.reachable[topicID], nil
}
func (r *stubTopicRepository) FindContentByTopicIDs(ctx context.Context, topicIDs []uint, excludeContentID uint, excludeContentType string, limit int) ([]*entity.ContentTopic, error) {
	var out []*entity.ContentTopic
	for _, tid := range topicIDs {
		for _, e := range r.contentTopics[topicIDKey(tid)] {
			if e.ContentID == excludeContentID && e.ContentType == excludeContentType {
				continue
			}
			out = append(out, e)
		}
	}
	return out, nil
}

// contentKeyReal/topicIDKey are simple string-keying helpers distinct from the
// unused contentKey above (kept private, non-colliding key formats for clarity).
func contentKeyReal(contentID uint, contentType string) string {
	return uintToString(contentID) + ":" + contentType
}
func topicIDKey(topicID uint) string {
	return uintToString(topicID)
}
func uintToString(u uint) string {
	if u == 0 {
		return "0"
	}
	digits := []byte{}
	for u > 0 {
		digits = append([]byte{byte('0' + u%10)}, digits...)
		u /= 10
	}
	return string(digits)
}

func uintPtr(u uint) *uint { return &u }

func TestPersonalization_GetRecommendationsByRequest(t *testing.T) {
	svc := personalization.NewService(nil, newStubArticleRepo(), newStubCourseRepo(), nil, nil, newStubTopicRepository())
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
		t.Fatalf("expected non-empty recommendations given fixture topic/relationship data")
	}
}

func TestPersonalization_GenerateTopicCandidates_ReturnsOtherContentNotTopics(t *testing.T) {
	svc := personalization.NewService(nil, newStubArticleRepo(), newStubCourseRepo(), nil, nil, newStubTopicRepository())
	ctx := context.Background()

	req := personalization.RecommendationRequest{ContentID: 1, ContentType: "ARTICLE"}
	cands, err := svc.GenerateTopicCandidates(ctx, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(cands) != 1 {
		t.Fatalf("expected exactly 1 candidate (article 10, sharing topic 100), got %d", len(cands))
	}
	if cands[0].ContentID != 10 || cands[0].ContentType != "ARTICLE" {
		t.Fatalf("expected candidate to be content (ContentID=10, ContentType=ARTICLE), got ContentID=%d ContentType=%s — generator must return CONTENT sharing a topic, not the topic itself", cands[0].ContentID, cands[0].ContentType)
	}
}

func TestPersonalization_GenerateRelationshipCandidates_ReturnsOtherContentNotTopics(t *testing.T) {
	svc := personalization.NewService(nil, newStubArticleRepo(), newStubCourseRepo(), nil, nil, newStubTopicRepository())
	ctx := context.Background()

	req := personalization.RecommendationRequest{ContentID: 1, ContentType: "ARTICLE", Mode: personalization.ModeRelated}
	cands, err := svc.GenerateRelationshipCandidates(ctx, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(cands) != 1 {
		t.Fatalf("expected exactly 1 candidate (article 20, tagged with the PREREQUISITE_OF-reachable topic 200), got %d", len(cands))
	}
	if cands[0].ContentID != 20 || cands[0].ContentType != "ARTICLE" {
		t.Fatalf("expected candidate to be content (ContentID=20), got ContentID=%d ContentType=%s — generator must return CONTENT tagged with the reachable topic, not the topic itself", cands[0].ContentID, cands[0].ContentType)
	}
}

func TestPersonalization_GenerateCategoryCandidates_FiltersToSameCategory(t *testing.T) {
	svc := personalization.NewService(nil, newStubArticleRepo(), newStubCourseRepo(), nil, nil, newStubTopicRepository())
	ctx := context.Background()

	// Article 10 is in category 1, same as article 11 but different from article 20 (category 2) and course 30 (category 2).
	req := personalization.RecommendationRequest{ContentID: 10, ContentType: "ARTICLE"}
	cands, err := svc.GenerateCategoryCandidates(ctx, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(cands) != 1 {
		t.Fatalf("expected exactly 1 same-category candidate (article 11), got %d", len(cands))
	}
	if cands[0].ContentID != 11 {
		t.Fatalf("expected candidate 11 (same category as 10), got %d — category filter is not being applied", cands[0].ContentID)
	}
}

func TestPersonalization_RankCandidatesInvariants(t *testing.T) {
	svc := personalization.NewService(nil, newStubArticleRepo(), newStubCourseRepo(), nil, nil, nil)
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

func TestPersonalization_RankCandidatesInvariants_ExcludesCurrentContent(t *testing.T) {
	svc := personalization.NewService(nil, newStubArticleRepo(), newStubCourseRepo(), nil, nil, nil)
	ctx := context.Background()

	cands := []personalization.RecommendationCandidate{
		{
			ContentID:   1,
			ContentType: "ARTICLE",
			Signals:     []personalization.CandidateSignal{{SignalType: "TOPIC_MATCH", SignalValue: 0.9}},
		},
		{
			ContentID:   10,
			ContentType: "ARTICLE",
			Signals:     []personalization.CandidateSignal{{SignalType: "TOPIC_MATCH", SignalValue: 0.5}},
		},
	}

	req := personalization.RecommendationRequest{ContentID: 1, ContentType: "ARTICLE"}
	scores, err := svc.RankCandidates(ctx, cands, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(scores) != 1 {
		t.Fatalf("expected the current content (id=1) to be excluded, got %d results", len(scores))
	}
	if scores[0].ContentID != 10 {
		t.Fatalf("expected remaining candidate to be 10, got %d", scores[0].ContentID)
	}
}
