package handler_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	seosvc "github.com/serenya/go-cms/internal/application/seo"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/internal/interfaces/http/handler"
)

type seoFakeRepo struct{}

func (seoFakeRepo) CountURLs(_ context.Context, kind string) (int64, error) {
	if kind == repository.SEOKindArticle {
		return 1, nil
	}
	return 0, nil
}

func (seoFakeRepo) ListURLs(_ context.Context, kind string, _, _ int) ([]repository.SitemapEntry, error) {
	if kind == repository.SEOKindArticle {
		return []repository.SitemapEntry{{ID: 1, Slug: "oauth", CategorySlug: "security"}}, nil
	}
	return nil, nil
}

func (seoFakeRepo) FindMeta(_ context.Context, kind, key string) (*repository.SEOMeta, error) {
	if kind == repository.SEOKindArticle && key == "oauth" {
		return &repository.SEOMeta{Kind: kind, ID: 1, Slug: "oauth", CategorySlug: "security", CategoryName: "Security", Title: `OAuth <b>"guide"</b>`, Description: "About tokens"}, nil
	}
	return nil, nil
}

const spaShell = `<!doctype html><html><head><title>GeekGully</title><link rel="canonical" href="/" /></head><body><div id="root"></div></body></html>`

func seoRouter(t *testing.T) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	index := filepath.Join(t.TempDir(), "index.html")
	if err := os.WriteFile(index, []byte(spaShell), 0o600); err != nil {
		t.Fatal(err)
	}
	svc := seosvc.NewService(seoFakeRepo{}, seosvc.Config{BaseURL: "https://example.test"})
	h := handler.NewSEOHandler(svc, index)
	r := gin.New()
	r.GET("/sitemap.xml", h.Sitemap)
	r.GET("/sitemaps/:file", h.Sitemap)
	r.GET("/robots.txt", h.Robots)
	r.NoRoute(h.ServeSPA)
	return r
}

func get(r *gin.Engine, path string, headers ...string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestSEO_InjectsMetaForPublishedArticle(t *testing.T) {
	w := get(seoRouter(t), "/article/security/oauth")
	body := w.Body.String()
	if w.Code != http.StatusOK || !strings.Contains(body, `<link rel="canonical" href="https://example.test/article/security/oauth" />`) {
		t.Fatalf("canonical not injected (%d): %s", w.Code, body)
	}
	if strings.Contains(body, "<b>") || !strings.Contains(body, "&lt;b&gt;") {
		t.Fatalf("title must be HTML-escaped: %s", body)
	}
	if !strings.Contains(w.Header().Get("Cache-Control"), "public") {
		t.Fatalf("injected pages must be cacheable, got %q", w.Header().Get("Cache-Control"))
	}
	if !strings.Contains(body, `id="root"`) {
		t.Fatalf("SPA shell must be preserved")
	}
}

func TestSEO_PreviewUnknownAndOtherRoutesServePlainShell(t *testing.T) {
	r := seoRouter(t)
	for _, path := range []string{"/article/security/oauth?preview=true", "/article/security/missing", "/dashboard", "/"} {
		w := get(r, path)
		if w.Code != http.StatusOK || w.Body.String() != spaShell {
			t.Fatalf("%s must serve the untouched shell, got %d %q", path, w.Code, w.Body.String())
		}
		if !strings.Contains(w.Header().Get("Cache-Control"), "no-store") {
			t.Fatalf("%s: plain shell must not be cached, got %q", path, w.Header().Get("Cache-Control"))
		}
	}
	if get(r, "/article/security/oauth?preview=true").Header().Get("X-Robots-Tag") == "" {
		t.Fatal("preview responses must carry X-Robots-Tag noindex")
	}
}

func TestSEO_SitemapRobotsAndETag(t *testing.T) {
	r := seoRouter(t)
	w := get(r, "/sitemap.xml")
	if w.Code != http.StatusOK || !strings.Contains(w.Header().Get("Content-Type"), "application/xml") ||
		!strings.Contains(w.Body.String(), "https://example.test/article/security/oauth") {
		t.Fatalf("bad sitemap (%d): %s", w.Code, w.Body)
	}
	if w.Header().Get("Cache-Control") == "" || w.Header().Get("ETag") == "" {
		t.Fatalf("sitemap needs cache headers: %v", w.Header())
	}
	if got := get(r, "/sitemap.xml", "If-None-Match", w.Header().Get("ETag")); got.Code != http.StatusNotModified {
		t.Fatalf("expected 304, got %d", got.Code)
	}
	if get(r, "/sitemaps/articles-9.xml").Code != http.StatusNotFound || get(r, "/sitemaps/junk.xml").Code != http.StatusNotFound {
		t.Fatal("unknown chunks must 404")
	}
	rb := get(r, "/robots.txt")
	if rb.Code != http.StatusOK || !strings.Contains(rb.Body.String(), "Sitemap: https://example.test/sitemap.xml") {
		t.Fatalf("bad robots: %s", rb.Body)
	}
}
