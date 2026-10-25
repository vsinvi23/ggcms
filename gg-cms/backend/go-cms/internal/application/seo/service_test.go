package seo

import (
	"context"
	"encoding/xml"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/serenya/go-cms/internal/domain/repository"
)

type fakeRepo struct {
	entries map[string][]repository.SitemapEntry
	meta    map[string]*repository.SEOMeta
	lists   int
}

func (f *fakeRepo) CountURLs(_ context.Context, kind string) (int64, error) {
	return int64(len(f.entries[kind])), nil
}

func (f *fakeRepo) ListURLs(_ context.Context, kind string, offset, limit int) ([]repository.SitemapEntry, error) {
	f.lists++
	all := f.entries[kind]
	if offset >= len(all) {
		return nil, nil
	}
	end := offset + limit
	if end > len(all) {
		end = len(all)
	}
	return all[offset:end], nil
}

func (f *fakeRepo) FindMeta(_ context.Context, kind, key string) (*repository.SEOMeta, error) {
	return f.meta[kind+":"+key], nil
}

func newTestService(repo *fakeRepo, max int) Service {
	return NewService(repo, Config{BaseURL: "https://example.test/", MaxURLsPerSitemap: max, CacheTTL: time.Hour})
}

func TestSitemapSingleDocumentWithLastmodAndCaching(t *testing.T) {
	mod := time.Date(2026, 5, 4, 10, 0, 0, 0, time.UTC)
	repo := &fakeRepo{entries: map[string][]repository.SitemapEntry{
		repository.SEOKindArticle: {{ID: 1, Slug: "oauth & more", CategorySlug: "security", LastMod: mod}},
		repository.SEOKindCourse:  {{ID: 2, Slug: "go-intro", LastMod: mod}},
		repository.SEOKindTopic:   {{ID: 3, Slug: "go"}},
	}}
	svc := newTestService(repo, 0)

	sm, err := svc.Sitemap(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	var doc urlSet
	if err := xml.Unmarshal(sm.Body, &doc); err != nil {
		t.Fatalf("invalid xml: %v\n%s", err, sm.Body)
	}
	locs := map[string]string{}
	for _, u := range doc.URLs {
		locs[u.Loc] = u.LastMod
	}
	if locs["https://example.test/article/security/oauth%20&%20more"] != "2026-05-04" {
		t.Fatalf("article url/lastmod missing or unescaped: %v", locs)
	}
	if _, ok := locs["https://example.test/course/go-intro"]; !ok {
		t.Fatalf("course url missing: %v", locs)
	}
	if _, ok := locs["https://example.test/topics/go"]; !ok {
		t.Fatalf("topic url missing: %v", locs)
	}
	if _, ok := locs["https://example.test/"]; !ok {
		t.Fatalf("static home url missing")
	}

	before := repo.lists
	again, _ := svc.Sitemap(context.Background(), "sitemap.xml")
	if repo.lists != before || again.ETag != sm.ETag {
		t.Fatalf("second call must be served from cache")
	}
	svc.InvalidateSitemaps()
	if _, err := svc.Sitemap(context.Background(), ""); err != nil || repo.lists == before {
		t.Fatalf("invalidate must force a rebuild")
	}
}

func TestSitemapIndexChunking(t *testing.T) {
	repo := &fakeRepo{entries: map[string][]repository.SitemapEntry{}}
	for i := 1; i <= 25; i++ {
		repo.entries[repository.SEOKindArticle] = append(repo.entries[repository.SEOKindArticle], repository.SitemapEntry{ID: uint(i), Slug: fmt.Sprintf("a-%d", i), CategorySlug: "c"})
	}
	svc := newTestService(repo, 10)

	idx, err := svc.Sitemap(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	var si sitemapIndex
	if err := xml.Unmarshal(idx.Body, &si); err != nil || si.XMLName.Local != "sitemapindex" {
		t.Fatalf("expected a sitemap index, err=%v body=%s", err, idx.Body)
	}
	var articleChunks []string
	for _, s := range si.Sitemaps {
		if strings.Contains(s.Loc, "/sitemaps/articles-") {
			articleChunks = append(articleChunks, s.Loc)
		}
	}
	if len(articleChunks) != 3 {
		t.Fatalf("25 articles at 10 per file must give 3 chunks, got %v", articleChunks)
	}

	last, err := svc.Sitemap(context.Background(), "articles-3.xml")
	if err != nil {
		t.Fatal(err)
	}
	var doc urlSet
	_ = xml.Unmarshal(last.Body, &doc)
	if len(doc.URLs) != 5 {
		t.Fatalf("last chunk must hold the remaining 5 urls, got %d", len(doc.URLs))
	}
	for _, bad := range []string{"articles-4.xml", "nonsense-1.xml", "articles-0.xml", "articles-x.xml", "../etc-1.xml"} {
		if _, err := svc.Sitemap(context.Background(), bad); err != ErrNotFound {
			t.Fatalf("%s must be not found, got %v", bad, err)
		}
	}
}

func TestRobotsHasSitemapLineAndBlocksPrivateAreas(t *testing.T) {
	r := newTestService(&fakeRepo{}, 0).Robots()
	for _, want := range []string{"Sitemap: https://example.test/sitemap.xml", "Disallow: /api/", "Disallow: /dashboard"} {
		if !strings.Contains(r, want) {
			t.Fatalf("robots.txt missing %q:\n%s", want, r)
		}
	}
}

const shell = `<!doctype html><html><head><meta charset="UTF-8" />
<title>GeekGully</title>
<meta name="description" content="old" />
<meta property="og:title" content="old" />
<meta name="twitter:site" content="@GeekGully" />
<link rel="canonical" href="/" />
</head><body><div id="root"></div></body></html>`

func TestPageMetaAndRenderEscapesEverything(t *testing.T) {
	pub := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	repo := &fakeRepo{meta: map[string]*repository.SEOMeta{
		"article:oauth-guide": {
			Kind: repository.SEOKindArticle, ID: 7, Slug: "oauth-guide", CategoryName: "Security", CategorySlug: "security",
			Title:       `OAuth "2.0" </title><script>alert(1)</script>`,
			Description: `<p>Learn <b>OAuth</b> & tokens</p>`, ImageURL: "/uploads/x.png",
			PublishedAt: &pub, UpdatedAt: &pub,
		},
	}}
	svc := newTestService(repo, 0)

	meta, err := svc.PageMeta(context.Background(), "/article/anything/oauth-guide")
	if err != nil || meta == nil {
		t.Fatalf("expected meta, got %v err=%v", meta, err)
	}
	if meta.Canonical != "https://example.test/article/security/oauth-guide" || meta.OGType != "article" || meta.Image != "https://example.test/uploads/x.png" {
		t.Fatalf("unexpected meta: %+v", meta)
	}
	if strings.ContainsAny(meta.Description, "<>") {
		t.Fatalf("description must be plain text: %q", meta.Description)
	}

	out := string(svc.Render([]byte(shell), meta))
	if strings.Contains(out, "<script>alert(1)") || strings.Contains(out, "</title><script>") {
		t.Fatalf("injected markup must be escaped:\n%s", out)
	}
	for _, want := range []string{
		`<link rel="canonical" href="https://example.test/article/security/oauth-guide" />`,
		`<meta property="og:type" content="article" />`,
		`<meta name="twitter:card" content="summary_large_image" />`,
		`<meta name="twitter:site" content="@GeekGully" />`,
		`application/ld+json`, `"@type":"Article"`, `"@type":"BreadcrumbList"`,
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("missing %q in:\n%s", want, out)
		}
	}
	if strings.Count(out, "<title>") != 1 || strings.Count(out, `rel="canonical"`) != 1 || strings.Count(out, `name="description"`) != 1 {
		t.Fatalf("old head tags must be replaced, not duplicated:\n%s", out)
	}
	for _, ld := range strings.Split(out, `<script type="application/ld+json">`)[1:] {
		body := ld[:strings.Index(ld, "</script>")]
		if strings.ContainsAny(body, "<>") {
			t.Fatalf("json-ld must not contain raw angle brackets: %s", body)
		}
	}
}

func TestPageMetaRoutesAndMisses(t *testing.T) {
	repo := &fakeRepo{meta: map[string]*repository.SEOMeta{
		"course:go-intro":  {Kind: repository.SEOKindCourse, ID: 1, Slug: "go-intro", Title: "Go Intro"},
		"topic:go":         {Kind: repository.SEOKindTopic, ID: 2, Slug: "go", Title: "Go"},
		"path:backend":     {Kind: repository.SEOKindPath, ID: 3, Slug: "backend", Title: "Backend"},
		"technology:cloud": {Kind: repository.SEOKindTechnology, ID: 4, Slug: "cloud", Title: "Cloud"},
	}}
	svc := newTestService(repo, 0)
	cases := map[string]string{
		"/course/cat/go-intro": "https://example.test/course/go-intro",
		"/topics/go":           "https://example.test/topics/go",
		"/learn/backend":       "https://example.test/learn/backend",
		"/technology/cloud":    "https://example.test/technology/cloud",
	}
	for path, canonical := range cases {
		m, err := svc.PageMeta(context.Background(), path)
		if err != nil || m == nil || m.Canonical != canonical {
			t.Fatalf("%s: got %+v err=%v, want canonical %s", path, m, err, canonical)
		}
	}
	for _, path := range []string{"/", "/dashboard/articles", "/article", "/article/missing", "/topics/go/extra", "/explore/articles"} {
		if m, _ := svc.PageMeta(context.Background(), path); m != nil {
			t.Fatalf("%s must not get meta, got %+v", path, m)
		}
	}
}
