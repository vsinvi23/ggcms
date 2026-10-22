package search

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/serenya/go-cms/internal/domain/repository"
)

type fakeRepo struct {
	mu      sync.Mutex
	params  repository.SearchParams
	page    *repository.SearchPage
	err     error
	logged  []string
	counts  []int
	suggest *repository.SuggestResult
	done    chan struct{}
}

func (f *fakeRepo) Search(_ context.Context, p repository.SearchParams) (*repository.SearchPage, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.params = p
	return f.page, f.err
}

func (f *fakeRepo) Suggest(context.Context, string, int) (*repository.SuggestResult, error) {
	return f.suggest, nil
}

func (f *fakeRepo) LogQuery(_ context.Context, q string, n int) error {
	f.mu.Lock()
	f.logged = append(f.logged, q)
	f.counts = append(f.counts, n)
	f.mu.Unlock()
	if f.done != nil {
		f.done <- struct{}{}
	}
	return nil
}

type fakeTracker struct {
	mu     sync.Mutex
	events []map[string]interface{}
}

func (t *fakeTracker) TrackEvent(_ context.Context, eventType string, _ *uint, _, _ *string, meta map[string]interface{}) error {
	t.mu.Lock()
	defer t.mu.Unlock()
	if eventType != "search" {
		return errors.New("unexpected event")
	}
	t.events = append(t.events, meta)
	return nil
}

func TestPrefixQueryIsSafeAndPrefixesLastToken(t *testing.T) {
	cases := map[string]string{
		"kubernetes net":          "kubernetes & net:*",
		"  Go  ":                  "go:*",
		"a'; DROP TABLE x;--":     "a & drop & table & x:*",
		"":                        "",
		"!!!":                     "",
		"c++ & (rust | go) -java": "c & rust & go & java:*",
		"one two three four five six seven eight nine ten": "one & two & three & four & five & six & seven & eight:*",
	}
	for in, want := range cases {
		if got := prefixQuery(normalize(in)); got != want {
			t.Errorf("prefixQuery(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSearchValidatesFiltersAndPaginates(t *testing.T) {
	repo := &fakeRepo{page: &repository.SearchPage{Total: 25, Hits: []repository.SearchHitRow{}}}
	svc := NewService(repo)
	ctx := context.Background()

	if _, err := svc.Search(ctx, Request{Query: "go", Type: "video"}); !errors.Is(err, ErrInvalidFilter) {
		t.Fatalf("invalid type must be rejected, got %v", err)
	}
	if _, err := svc.Search(ctx, Request{Query: "go", Level: "godlike"}); !errors.Is(err, ErrInvalidFilter) {
		t.Fatalf("invalid level must be rejected, got %v", err)
	}

	res, err := svc.Search(ctx, Request{Query: "go", Type: "course", Level: "Beginner", Category: "Cloud", Page: 2, Size: 1000})
	if err != nil {
		t.Fatal(err)
	}
	p := repo.params
	if len(p.Types) != 1 || p.Types[0] != "course" || p.Level != "beginner" || p.Category != "cloud" {
		t.Fatalf("filters not normalised: %+v", p)
	}
	if p.Limit != maxPageSize || p.Offset != 2*maxPageSize {
		t.Fatalf("size must be capped and offset computed: %+v", p)
	}
	if res.TotalPages != 1 || res.Total != 25 {
		t.Fatalf("unexpected paging: %+v", res)
	}
}

func TestSearchEmptyQueryWithoutFiltersSkipsRepo(t *testing.T) {
	repo := &fakeRepo{}
	res, err := NewService(repo).Search(context.Background(), Request{Query: "   "})
	if err != nil || len(res.Hits) != 0 || res.Total != 0 {
		t.Fatalf("expected empty result, got %+v err=%v", res, err)
	}
}

func TestSearchQueryLengthCapped(t *testing.T) {
	repo := &fakeRepo{page: &repository.SearchPage{}}
	_, err := NewService(repo).Search(context.Background(), Request{Query: strings.Repeat("a", 5000)})
	if err != nil {
		t.Fatal(err)
	}
	if n := len([]rune(repo.params.Query)); n != maxQueryRunes {
		t.Fatalf("query must be capped to %d runes, got %d", maxQueryRunes, n)
	}
}

func TestHitsAreHTMLEscapedWithMarks(t *testing.T) {
	desc := "x"
	cat, catName, catSlug := uint(3), "Cloud", "cloud"
	repo := &fakeRepo{page: &repository.SearchPage{Total: 1, Hits: []repository.SearchHitRow{{
		ContentType: "article", ID: 9, Slug: "oauth-guide", Title: "<script>alert(1)</script> OAuth",
		TitleHL: "<script>alert(1)</script> [[hl]]OAuth[[/hl]]", Description: &desc,
		Snippet: `a "quote" <img src=x onerror=1> [[hl]]token[[/hl]]`, CategoryID: &cat, CategoryName: &catName, CategorySlug: &catSlug, Rank: 0.7,
	}}}}
	res, err := NewService(repo).Search(context.Background(), Request{Query: "oauth"})
	if err != nil {
		t.Fatal(err)
	}
	h := res.Hits[0]
	if strings.Contains(h.TitleHTML, "<script>") || !strings.Contains(h.TitleHTML, "<mark>OAuth</mark>") {
		t.Fatalf("title not safely highlighted: %s", h.TitleHTML)
	}
	if strings.Contains(h.SnippetHTML, "<img") || !strings.Contains(h.SnippetHTML, "<mark>token</mark>") {
		t.Fatalf("snippet not safely highlighted: %s", h.SnippetHTML)
	}
	if h.Path != "/article/cloud/oauth-guide" || h.Category == nil || h.Category.Slug != "cloud" {
		t.Fatalf("unexpected path/category: %+v", h)
	}
}

func TestQueryLoggingIsCappedAnonymisedAndTracked(t *testing.T) {
	repo := &fakeRepo{page: &repository.SearchPage{Total: 4}, done: make(chan struct{}, 4)}
	tr := &fakeTracker{}
	svc := NewService(repo, WithEventTracker(tr))
	ctx := context.Background()

	if _, err := svc.Search(ctx, Request{Query: "Kubernetes Networking"}); err != nil {
		t.Fatal(err)
	}
	select {
	case <-repo.done:
	case <-time.After(2 * time.Second):
		t.Fatal("query was not logged")
	}
	time.Sleep(50 * time.Millisecond)

	repo.mu.Lock()
	if len(repo.logged) != 1 || repo.logged[0] != "kubernetes networking" || repo.counts[0] != 4 {
		t.Fatalf("unexpected log: %v %v", repo.logged, repo.counts)
	}
	repo.mu.Unlock()
	tr.mu.Lock()
	if len(tr.events) != 1 || tr.events[0]["query_text"] != "kubernetes networking" || tr.events[0]["result_count"] != 4 {
		t.Fatalf("unexpected analytics event: %v", tr.events)
	}
	tr.mu.Unlock()

	for _, q := range []string{"john@example.com", "my card 4111111111111111"} {
		if _, err := svc.Search(ctx, Request{Query: q}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := svc.Search(ctx, Request{Query: "go", Page: 1}); err != nil {
		t.Fatal(err)
	}
	time.Sleep(100 * time.Millisecond)
	repo.mu.Lock()
	defer repo.mu.Unlock()
	if len(repo.logged) != 1 {
		t.Fatalf("PII-like queries and pages > 0 must not be logged: %v", repo.logged)
	}
}

func TestSuggestSkipsShortQueriesAndDedupesPopular(t *testing.T) {
	repo := &fakeRepo{suggest: &repository.SuggestResult{
		Titles:  []repository.SuggestTitle{{ContentType: "course", ID: 1, Slug: "go-intro", Title: "Go Intro"}},
		Queries: []string{"golang", "go modules"},
		Topics:  []repository.SuggestNamed{{ID: 5, Slug: "go", Name: "Go"}},
	}}
	svc := NewService(repo)
	short, _ := svc.Suggest(context.Background(), "g", 5)
	if len(short.Titles) != 0 {
		t.Fatal("single-char query must not hit the repo")
	}
	res, err := svc.Suggest(context.Background(), "golang", 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Queries) != 1 || res.Queries[0] != "go modules" {
		t.Fatalf("exact query should be removed from popular list: %v", res.Queries)
	}
	if res.Titles[0].Path != "/course/go-intro" {
		t.Fatalf("unexpected suggestion path: %s", res.Titles[0].Path)
	}
}
