package personalization_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/serenya/go-cms/internal/application/personalization"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

var fixedNow = time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)

type feedArticles struct {
	repository.ArticleRepository
	list []*entity.Article
}

func (r *feedArticles) FindAll(_ context.Context, _ repository.ArticleFilter, _, _ int) ([]*entity.Article, int64, error) {
	return r.list, int64(len(r.list)), nil
}
func (r *feedArticles) FindByID(_ context.Context, id uint) (*entity.Article, error) {
	for _, a := range r.list {
		if a.ID == id {
			return a, nil
		}
	}
	return nil, nil
}

type feedCourses struct {
	repository.CourseRepository
	list []*entity.Course
}

func (r *feedCourses) FindAll(_ context.Context, _ repository.CourseFilter, _, _ int) ([]*entity.Course, int64, error) {
	return r.list, int64(len(r.list)), nil
}
func (r *feedCourses) FindByID(_ context.Context, id uint) (*entity.Course, error) {
	for _, c := range r.list {
		if c.ID == id {
			return c, nil
		}
	}
	return nil, nil
}

type feedEnrollments struct {
	repository.EnrollmentRepository
	list  []*entity.Enrollment
	err   error
	calls int
}

func (r *feedEnrollments) FindByUserID(context.Context, uint) ([]*entity.Enrollment, error) {
	r.calls++
	return r.list, r.err
}

type feedProfiles struct {
	repository.UserProfileRepository
	profile *entity.UserProfile
}

func (r *feedProfiles) FindDefaultByUserID(context.Context, uint) (*entity.UserProfile, error) {
	return r.profile, nil
}

type feedViews map[string]int64

func (v feedViews) GetContentViews(_ context.Context, id, typ string) (int64, error) {
	return v[typ+":"+id], nil
}

type feedPaths []*entity.LearningPath

func (p feedPaths) FindAll(context.Context, string) ([]*entity.LearningPath, error) { return p, nil }

func strp(s string) *string { return &s }

func published(id uint, cat uint, title string, ageDays int) (uint, *uint, string, *time.Time) {
	t := fixedNow.AddDate(0, 0, -ageDays)
	return id, uintPtr(cat), title, &t
}

func newArticle(id, cat uint, title string, ageDays int) *entity.Article {
	_, c, _, t := published(id, cat, title, ageDays)
	return &entity.Article{ID: id, Title: title, Slug: fmt.Sprintf("a-%d", id), CategoryID: c, Status: entity.CMSStatusPublished, PublishedAt: t, CreatedAt: *t}
}

func newCourse(id, cat uint, title string, ageDays int) *entity.Course {
	_, c, _, t := published(id, cat, title, ageDays)
	return &entity.Course{ID: id, Title: title, Slug: fmt.Sprintf("c-%d", id), CategoryID: c, Status: entity.CMSStatusPublished, PublishedAt: t, CreatedAt: *t}
}

func counterIDs() func() string {
	n := 0
	return func() string { n++; return fmt.Sprintf("rec_test_%d", n) }
}

type fixture struct {
	articles *feedArticles
	courses  *feedCourses
	enrolls  *feedEnrollments
	profiles *feedProfiles
	topics   *stubTopicRepository
}

func newFixture() *fixture {
	return &fixture{
		articles: &feedArticles{},
		courses:  &feedCourses{},
		enrolls:  &feedEnrollments{},
		profiles: &feedProfiles{profile: &entity.UserProfile{UserID: 7, ExperienceLevel: entity.ExperienceBeginner, PreferredCategoryIDs: []int64{}, InterestedTagIDs: []int64{}}},
		topics:   &stubTopicRepository{contentTopics: map[string][]*entity.ContentTopic{}, reachable: map[uint][]*repository.ReachableTopic{}},
	}
}

func (f *fixture) service(opts ...personalization.Option) personalization.Service {
	base := []personalization.Option{personalization.WithClock(func() time.Time { return fixedNow }), personalization.WithRecIDGenerator(counterIDs())}
	return personalization.NewService(f.profiles, f.articles, f.courses, f.enrolls, nil, f.topics, append(base, opts...)...)
}

func completed(courseID uint) *entity.Enrollment {
	at := fixedNow.AddDate(0, 0, -3)
	return &entity.Enrollment{UserID: 7, CourseID: courseID, Status: entity.EnrollmentStatusCompleted, Progress: 100, CompletedAt: &at, LastAccessedAt: &at, CreatedAt: at}
}

func TestRecommend_NextStepOutranksAndExcludesCompleted(t *testing.T) {
	f := newFixture()
	f.courses.list = []*entity.Course{newCourse(1, 1, "OAuth Basics", 100), newCourse(2, 1, "OpenID Connect Deep Dive", 100), newCourse(3, 2, "Cloud 101", 100)}
	f.articles.list = []*entity.Article{newArticle(10, 2, "Cloud Notes", 100)}
	f.enrolls.list = []*entity.Enrollment{completed(1)}
	f.topics.contentTopics["1:COURSE"] = []*entity.ContentTopic{{ContentID: 1, ContentType: "COURSE", TopicID: 100, Weight: 1}}
	f.topics.contentTopics["200"] = []*entity.ContentTopic{{ContentID: 2, ContentType: "COURSE", TopicID: 200, Weight: 1}}
	f.topics.contentTopics["100"] = []*entity.ContentTopic{{ContentID: 1, ContentType: "COURSE", TopicID: 100, Weight: 1}}
	f.topics.reachable[100] = []*repository.ReachableTopic{{Topic: &entity.Topic{ID: 200}, Depth: 1, RelationshipType: "PREREQUISITE_OF", Weight: 1}}

	feed, err := f.service().Recommend(context.Background(), 7, 10)
	if err != nil {
		t.Fatal(err)
	}
	if feed.ColdStart || feed.Partial {
		t.Fatalf("unexpected coldStart=%v partial=%v", feed.ColdStart, feed.Partial)
	}
	if len(feed.Items) != 3 {
		t.Fatalf("want 3 items (completed course excluded), got %d", len(feed.Items))
	}
	first := feed.Items[0]
	if first.ID != 2 || first.ContentType != "course" || first.ReasonCode != personalization.ReasonNextStep {
		t.Fatalf("want next-step course 2 first, got %+v", first)
	}
	for i, it := range feed.Items {
		if it.ID == 1 && it.ContentType == "course" {
			t.Fatalf("completed course must be excluded")
		}
		if it.Position != i+1 || it.RecID != feed.RecID || it.RecID == "" || it.Reason == "" {
			t.Fatalf("bad impression metadata at %d: %+v", i, it)
		}
	}
}

func TestRecommend_ColdStartUsesTrending(t *testing.T) {
	f := newFixture()
	f.articles.list = []*entity.Article{newArticle(10, 1, "Quiet", 10), newArticle(11, 2, "Hot", 10)}
	views := feedViews{"article:11": 5000, "article:10": 3}

	feed, err := f.service(personalization.WithViews(views)).Recommend(context.Background(), 7, 5)
	if err != nil {
		t.Fatal(err)
	}
	if !feed.ColdStart {
		t.Fatal("expected cold start")
	}
	if feed.Items[0].ID != 11 || feed.Items[0].ReasonCode != personalization.ReasonTrending {
		t.Fatalf("want trending article 11 first, got %+v", feed.Items[0])
	}
	if feed.Continue != nil {
		t.Fatal("no continue item expected without enrollments")
	}
}

func TestRecommend_LevelMatch(t *testing.T) {
	f := newFixture()
	hard, easy := newCourse(1, 1, "Advanced", 50), newCourse(2, 1, "Beginner", 50)
	hard.Level, easy.Level = strp("advanced"), strp("beginner")
	f.courses.list = []*entity.Course{hard, easy}

	feed, err := f.service().Recommend(context.Background(), 7, 5)
	if err != nil {
		t.Fatal(err)
	}
	if feed.Items[0].ID != 2 {
		t.Fatalf("beginner user should get the beginner course first, got %d", feed.Items[0].ID)
	}
}

func TestRecommend_DiversityReRanking(t *testing.T) {
	f := newFixture()
	f.profiles.profile.PreferredCategoryIDs = []int64{1}
	for i := uint(1); i <= 4; i++ {
		f.articles.list = append(f.articles.list, newArticle(i, 1, fmt.Sprintf("Sec %d", i), 20))
	}
	f.articles.list = append(f.articles.list, newArticle(9, 2, "Cloud", 20))

	feed, err := f.service().Recommend(context.Background(), 7, 3)
	if err != nil {
		t.Fatal(err)
	}
	cats := map[uint]bool{}
	for _, it := range feed.Items {
		cats[*it.CategoryID] = true
	}
	if len(cats) < 2 {
		t.Fatalf("diversity re-ranking should surface a second category in the top 3, got %+v", feed.Items)
	}
}

func TestRecommend_CacheAndInvalidation(t *testing.T) {
	f := newFixture()
	f.articles.list = []*entity.Article{newArticle(10, 1, "A", 5)}
	svc := f.service()

	for i := 0; i < 3; i++ {
		if _, err := svc.Recommend(context.Background(), 7, 5); err != nil {
			t.Fatal(err)
		}
	}
	if f.enrolls.calls != 1 {
		t.Fatalf("expected feed to be cached after first call, enrollment lookups=%d", f.enrolls.calls)
	}
	svc.InvalidateUser(7)
	if _, err := svc.Recommend(context.Background(), 7, 5); err != nil {
		t.Fatal(err)
	}
	if f.enrolls.calls != 2 {
		t.Fatalf("expected recompute after invalidation, enrollment lookups=%d", f.enrolls.calls)
	}

	personalization.WrapTracker(nil, svc).TrackEvent(context.Background(), "course_enrolled", uintPtr(7), nil, nil, nil)
	if _, err := svc.Recommend(context.Background(), 7, 5); err != nil {
		t.Fatal(err)
	}
	if f.enrolls.calls != 3 {
		t.Fatalf("enrollment event must invalidate the cache, lookups=%d", f.enrolls.calls)
	}
}

func TestRecommend_PartialOnDependencyErrorIsNotCached(t *testing.T) {
	f := newFixture()
	f.articles.list = []*entity.Article{newArticle(10, 1, "A", 5)}
	f.enrolls.err = errors.New("db down")
	svc := f.service()

	for i := 0; i < 2; i++ {
		feed, err := svc.Recommend(context.Background(), 7, 5)
		if err != nil {
			t.Fatalf("partial failures must not fail the request: %v", err)
		}
		if !feed.Partial || len(feed.Items) != 1 {
			t.Fatalf("want partial feed with 1 item, got partial=%v items=%d", feed.Partial, len(feed.Items))
		}
	}
	if f.enrolls.calls != 2 {
		t.Fatalf("partial feeds must not be cached, lookups=%d", f.enrolls.calls)
	}
}

func TestRecommend_ContinueNextInPath(t *testing.T) {
	f := newFixture()
	f.courses.list = []*entity.Course{newCourse(1, 1, "One", 60), newCourse(2, 1, "Two", 60), newCourse(3, 1, "Three", 60)}
	f.enrolls.list = []*entity.Enrollment{completed(1)}
	path := &entity.LearningPath{ID: 5, Title: "Path", Slug: "path", Courses: []entity.LearningPathCourse{
		{CourseID: 1, SortOrder: 1}, {CourseID: 2, SortOrder: 2}, {CourseID: 3, SortOrder: 3},
	}}

	feed, err := f.service(personalization.WithPaths(feedPaths{path})).Recommend(context.Background(), 7, 5)
	if err != nil {
		t.Fatal(err)
	}
	c := feed.Continue
	if c == nil || c.CourseID != 2 || c.ReasonCode != personalization.ReasonNextInPath || c.PathCompleted != 1 || c.PathTotal != 3 || c.PathSlug != "path" {
		t.Fatalf("unexpected continue item: %+v", c)
	}
	if c.RecID != feed.RecID {
		t.Fatalf("continue item must carry the impression id")
	}
}

func TestRecommend_ContinueInProgressWithoutPath(t *testing.T) {
	f := newFixture()
	f.courses.list = []*entity.Course{newCourse(1, 1, "One", 60)}
	at := fixedNow.AddDate(0, 0, -1)
	f.enrolls.list = []*entity.Enrollment{{UserID: 7, CourseID: 1, Status: entity.EnrollmentStatusActive, Progress: 40, LastAccessedAt: &at, CreatedAt: at}}

	feed, err := f.service().Recommend(context.Background(), 7, 5)
	if err != nil {
		t.Fatal(err)
	}
	if feed.Continue == nil || feed.Continue.CourseID != 1 || feed.Continue.Kind != "in_progress" || feed.Continue.Progress != 40 {
		t.Fatalf("unexpected continue item: %+v", feed.Continue)
	}
	for _, it := range feed.Items {
		if it.ID == 1 && it.ContentType == "course" {
			t.Fatal("enrolled course must not be recommended again")
		}
	}
}

type failingTopics struct{ *stubTopicRepository }

func (failingTopics) GetContentTopics(context.Context, uint, string) ([]*entity.Topic, error) {
	return nil, errors.New("topic store down")
}

func TestRelated_GeneratorErrorIsSurfacedAsPartial(t *testing.T) {
	svc := personalization.NewService(nil, newStubArticleRepo(), newStubCourseRepo(), nil, nil, failingTopics{newStubTopicRepository()},
		personalization.WithRecIDGenerator(counterIDs()))
	res, err := svc.GetRecommendationsByRequest(context.Background(), personalization.RecommendationRequest{ContentID: 10, ContentType: "ARTICLE", Limit: 5})
	if err != nil {
		t.Fatal(err)
	}
	if !res.Partial {
		t.Fatal("generator failure must be reported as partial")
	}
	if len(res.Recommendations) == 0 {
		t.Fatal("category generator results should still be returned")
	}
	if res.RecID == "" || res.Recommendations[0].Position != 1 || res.Recommendations[0].Title == "" {
		t.Fatalf("missing impression metadata or hydration: %+v", res)
	}
}

func TestRelated_ExcludesUnpublishedContent(t *testing.T) {
	arts := newStubArticleRepo()
	arts.articles[1].Status = entity.CMSStatusDraft
	svc := personalization.NewService(nil, arts, newStubCourseRepo(), nil, nil, newStubTopicRepository())
	res, err := svc.GetRecommendationsByRequest(context.Background(), personalization.RecommendationRequest{ContentID: 10, ContentType: "ARTICLE", Limit: 5})
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range res.Recommendations {
		if r.ContentID == 11 {
			t.Fatal("draft article 11 must not be recommended")
		}
	}
}
