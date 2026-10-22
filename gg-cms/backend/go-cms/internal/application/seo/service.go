package seo

import (
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"html"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/serenya/go-cms/internal/domain/repository"
)

const (
	DefaultMaxURLsPerSitemap = 50000
	defaultSiteName          = "GeekGully"
	defaultDescription       = "Master new skills with GeekGully. Structured courses, in-depth articles and hands-on projects."
	maxDescriptionRunes      = 160
	maxKeyLen                = 200
	sitemapNS                = "http://www.sitemaps.org/schemas/sitemap/0.9"
)

var ErrNotFound = errors.New("sitemap part not found")

var staticPaths = []string{"/", "/courses", "/explore", "/explore/articles", "/learning-paths", "/topics", "/technologies", "/domains", "/interview-prep", "/practice"}

var sitemapKinds = []string{"static", "articles", "courses", "topics", "technologies", "paths"}

var kindToRepo = map[string]string{
	"articles":     repository.SEOKindArticle,
	"courses":      repository.SEOKindCourse,
	"topics":       repository.SEOKindTopic,
	"technologies": repository.SEOKindTechnology,
	"paths":        repository.SEOKindPath,
}

type Config struct {
	BaseURL           string
	SiteName          string
	CacheTTL          time.Duration
	MaxURLsPerSitemap int
}

type PageMeta struct {
	Title       string
	Description string
	Canonical   string
	Image       string
	OGType      string
	JSONLD      []map[string]interface{}
}

type Sitemap struct {
	Body []byte
	ETag string
}

type Service interface {
	Sitemap(ctx context.Context, file string) (*Sitemap, error)
	Robots() string
	PageMeta(ctx context.Context, urlPath string) (*PageMeta, error)
	Render(index []byte, m *PageMeta) []byte
	InvalidateSitemaps()
}

type cacheEntry struct {
	sm  *Sitemap
	exp time.Time
}

type service struct {
	repo repository.SEORepository
	cfg  Config

	mu    sync.Mutex
	cache map[string]cacheEntry
}

func NewService(repo repository.SEORepository, cfg Config) Service {
	cfg.BaseURL = strings.TrimRight(cfg.BaseURL, "/")
	if cfg.SiteName == "" {
		cfg.SiteName = defaultSiteName
	}
	if cfg.CacheTTL <= 0 {
		cfg.CacheTTL = 15 * time.Minute
	}
	if cfg.MaxURLsPerSitemap <= 0 {
		cfg.MaxURLsPerSitemap = DefaultMaxURLsPerSitemap
	}
	return &service{repo: repo, cfg: cfg, cache: map[string]cacheEntry{}}
}

func (s *service) Robots() string {
	return "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /graphql\nDisallow: /factory\nDisallow: /dashboard\nDisallow: /workspace\nDisallow: /auth\n\nSitemap: " +
		s.cfg.BaseURL + "/sitemap.xml\n"
}

func (s *service) InvalidateSitemaps() {
	s.mu.Lock()
	s.cache = map[string]cacheEntry{}
	s.mu.Unlock()
}

type urlEntry struct {
	Loc     string `xml:"loc"`
	LastMod string `xml:"lastmod,omitempty"`
}

type urlSet struct {
	XMLName xml.Name   `xml:"urlset"`
	Xmlns   string     `xml:"xmlns,attr"`
	URLs    []urlEntry `xml:"url"`
}

type sitemapRef struct {
	Loc string `xml:"loc"`
}

type sitemapIndex struct {
	XMLName  xml.Name     `xml:"sitemapindex"`
	Xmlns    string       `xml:"xmlns,attr"`
	Sitemaps []sitemapRef `xml:"sitemap"`
}

// Sitemap returns the sitemap for file ("" or "sitemap.xml" is the main document,
// otherwise "<kind>-<n>.xml" for chunk n, 1-based). Results are cached.
func (s *service) Sitemap(ctx context.Context, file string) (*Sitemap, error) {
	key := strings.TrimSuffix(file, ".xml")
	if key == "" || key == "sitemap" {
		key = "index"
	}
	s.mu.Lock()
	if e, ok := s.cache[key]; ok && time.Now().Before(e.exp) {
		s.mu.Unlock()
		return e.sm, nil
	}
	s.mu.Unlock()

	var body []byte
	var err error
	if key == "index" {
		body, err = s.buildMain(ctx)
	} else {
		body, err = s.buildChunk(ctx, key)
	}
	if err != nil {
		return nil, err
	}
	sum := sha1.Sum(body)
	sm := &Sitemap{Body: body, ETag: `"` + hex.EncodeToString(sum[:8]) + `"`}
	s.mu.Lock()
	s.cache[key] = cacheEntry{sm: sm, exp: time.Now().Add(s.cfg.CacheTTL)}
	s.mu.Unlock()
	return sm, nil
}

func (s *service) counts(ctx context.Context) (map[string]int64, error) {
	out := map[string]int64{"static": int64(len(staticPaths))}
	for kind, repoKind := range kindToRepo {
		n, err := s.repo.CountURLs(ctx, repoKind)
		if err != nil {
			return nil, err
		}
		out[kind] = n
	}
	return out, nil
}

func (s *service) buildMain(ctx context.Context) ([]byte, error) {
	counts, err := s.counts(ctx)
	if err != nil {
		return nil, err
	}
	var total int64
	for _, n := range counts {
		total += n
	}
	limit := s.cfg.MaxURLsPerSitemap
	if total <= int64(limit) {
		var all []urlEntry
		for _, kind := range sitemapKinds {
			entries, err := s.entries(ctx, kind, 0, limit)
			if err != nil {
				return nil, err
			}
			all = append(all, entries...)
		}
		return marshalXML(urlSet{Xmlns: sitemapNS, URLs: all})
	}
	idx := sitemapIndex{Xmlns: sitemapNS}
	for _, kind := range sitemapKinds {
		chunks := int((counts[kind] + int64(limit) - 1) / int64(limit))
		for n := 1; n <= chunks; n++ {
			idx.Sitemaps = append(idx.Sitemaps, sitemapRef{Loc: fmt.Sprintf("%s/sitemaps/%s-%d.xml", s.cfg.BaseURL, kind, n)})
		}
	}
	return marshalXML(idx)
}

func (s *service) buildChunk(ctx context.Context, key string) ([]byte, error) {
	i := strings.LastIndex(key, "-")
	if i <= 0 {
		return nil, ErrNotFound
	}
	kind := key[:i]
	n, err := strconv.Atoi(key[i+1:])
	if err != nil || n < 1 || n > 1000 {
		return nil, ErrNotFound
	}
	known := false
	for _, k := range sitemapKinds {
		if k == kind {
			known = true
		}
	}
	if !known {
		return nil, ErrNotFound
	}
	counts, err := s.counts(ctx)
	if err != nil {
		return nil, err
	}
	limit := s.cfg.MaxURLsPerSitemap
	if int64(n-1)*int64(limit) >= counts[kind] && n != 1 {
		return nil, ErrNotFound
	}
	entries, err := s.entries(ctx, kind, (n-1)*limit, limit)
	if err != nil {
		return nil, err
	}
	return marshalXML(urlSet{Xmlns: sitemapNS, URLs: entries})
}

func (s *service) entries(ctx context.Context, kind string, offset, limit int) ([]urlEntry, error) {
	if kind == "static" {
		if offset > 0 {
			return nil, nil
		}
		out := make([]urlEntry, len(staticPaths))
		for i, p := range staticPaths {
			out[i] = urlEntry{Loc: s.cfg.BaseURL + p}
		}
		return out, nil
	}
	rows, err := s.repo.ListURLs(ctx, kindToRepo[kind], offset, limit)
	if err != nil {
		return nil, err
	}
	out := make([]urlEntry, 0, len(rows))
	for _, r := range rows {
		e := urlEntry{Loc: s.cfg.BaseURL + s.pathFor(kindToRepo[kind], r.ID, r.Slug, r.CategorySlug)}
		if !r.LastMod.IsZero() {
			e.LastMod = r.LastMod.UTC().Format("2006-01-02")
		}
		out = append(out, e)
	}
	return out, nil
}

func marshalXML(v interface{}) ([]byte, error) {
	b, err := xml.MarshalIndent(v, "", "  ")
	if err != nil {
		return nil, err
	}
	return append([]byte(xml.Header), b...), nil
}

func seg(s string) string { return url.PathEscape(s) }

func (s *service) pathFor(kind string, id uint, slug, categorySlug string) string {
	key := slug
	if key == "" {
		key = strconv.FormatUint(uint64(id), 10)
	}
	switch kind {
	case repository.SEOKindArticle, repository.SEOKindCourse:
		base := "/article/"
		if kind == repository.SEOKindCourse {
			base = "/course/"
		}
		if categorySlug != "" {
			return base + seg(categorySlug) + "/" + seg(key)
		}
		return base + seg(key)
	case repository.SEOKindTopic:
		return "/topics/" + seg(key)
	case repository.SEOKindTechnology:
		return "/technology/" + seg(key)
	default:
		return "/learn/" + seg(key)
	}
}

func routeKind(urlPath string) (kind, key string) {
	segs := strings.Split(strings.Trim(urlPath, "/"), "/")
	if len(segs) < 2 {
		return "", ""
	}
	key = segs[len(segs)-1]
	if key == "" || len(key) > maxKeyLen {
		return "", ""
	}
	switch segs[0] {
	case "article":
		return repository.SEOKindArticle, key
	case "course":
		return repository.SEOKindCourse, key
	case "learn":
		if len(segs) == 2 {
			return repository.SEOKindPath, key
		}
	case "topics":
		if len(segs) == 2 {
			return repository.SEOKindTopic, key
		}
	case "technology":
		if len(segs) == 2 {
			return repository.SEOKindTechnology, key
		}
	}
	return "", ""
}

// PageMeta resolves SEO metadata for a SPA route. It returns nil when the route
// has no published content behind it, in which case the plain SPA shell is served.
func (s *service) PageMeta(ctx context.Context, urlPath string) (*PageMeta, error) {
	kind, key := routeKind(urlPath)
	if kind == "" {
		return nil, nil
	}
	m, err := s.repo.FindMeta(ctx, kind, key)
	if err != nil || m == nil {
		return nil, err
	}
	canonical := s.cfg.BaseURL + s.pathFor(kind, m.ID, m.Slug, m.CategorySlug)
	desc := cleanDescription(m.Description)
	if desc == "" {
		desc = s.fallbackDescription(kind, m.Title)
	}
	pm := &PageMeta{
		Title:       m.Title + " | " + s.cfg.SiteName,
		Description: desc,
		Canonical:   canonical,
		Image:       s.absoluteImage(m.ImageURL),
		OGType:      "website",
	}
	org := map[string]interface{}{"@type": "Organization", "name": s.cfg.SiteName, "url": s.cfg.BaseURL}
	switch kind {
	case repository.SEOKindArticle:
		pm.OGType = "article"
		ld := map[string]interface{}{
			"@context": "https://schema.org", "@type": "Article", "headline": m.Title, "description": desc,
			"mainEntityOfPage": canonical, "publisher": org, "author": org,
		}
		if m.PublishedAt != nil {
			ld["datePublished"] = m.PublishedAt.UTC().Format(time.RFC3339)
		}
		if m.UpdatedAt != nil {
			ld["dateModified"] = m.UpdatedAt.UTC().Format(time.RFC3339)
		}
		if pm.Image != "" {
			ld["image"] = []string{pm.Image}
		}
		if m.CategoryName != "" {
			ld["articleSection"] = m.CategoryName
		}
		pm.JSONLD = append(pm.JSONLD, ld, s.breadcrumb(m, canonical))
	case repository.SEOKindCourse:
		ld := map[string]interface{}{
			"@context": "https://schema.org", "@type": "Course", "name": m.Title, "description": desc,
			"url": canonical, "provider": org,
		}
		if pm.Image != "" {
			ld["image"] = []string{pm.Image}
		}
		pm.JSONLD = append(pm.JSONLD, ld, s.breadcrumb(m, canonical))
	default:
		pm.JSONLD = append(pm.JSONLD, map[string]interface{}{
			"@context": "https://schema.org", "@type": "CollectionPage", "name": m.Title, "description": desc,
			"url": canonical, "publisher": org,
		})
	}
	return pm, nil
}

func (s *service) breadcrumb(m *repository.SEOMeta, canonical string) map[string]interface{} {
	items := []map[string]interface{}{{"@type": "ListItem", "position": 1, "name": "Home", "item": s.cfg.BaseURL + "/"}}
	if m.CategoryName != "" && m.CategorySlug != "" {
		items = append(items, map[string]interface{}{"@type": "ListItem", "position": len(items) + 1, "name": m.CategoryName, "item": s.cfg.BaseURL + "/technology/" + seg(m.CategorySlug)})
	}
	items = append(items, map[string]interface{}{"@type": "ListItem", "position": len(items) + 1, "name": m.Title, "item": canonical})
	return map[string]interface{}{"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items}
}

func (s *service) fallbackDescription(kind, title string) string {
	switch kind {
	case repository.SEOKindTopic, repository.SEOKindTechnology:
		return "Explore articles, courses and learning paths on " + title + " at " + s.cfg.SiteName + "."
	}
	return defaultDescription
}

func (s *service) absoluteImage(u string) string {
	u = strings.TrimSpace(u)
	switch {
	case strings.HasPrefix(u, "https://"), strings.HasPrefix(u, "http://"):
		return u
	case strings.HasPrefix(u, "/") && !strings.HasPrefix(u, "//"):
		return s.cfg.BaseURL + u
	}
	return ""
}

var tagRe = regexp.MustCompile(`<[^>]*>`)

func cleanDescription(d string) string {
	d = html.UnescapeString(tagRe.ReplaceAllString(d, " "))
	d = strings.Join(strings.Fields(d), " ")
	r := []rune(d)
	if len(r) <= maxDescriptionRunes {
		return d
	}
	cut := string(r[:maxDescriptionRunes])
	if i := strings.LastIndex(cut, " "); i > maxDescriptionRunes/2 {
		cut = cut[:i]
	}
	return strings.TrimSpace(cut) + "..."
}

var (
	titleRe     = regexp.MustCompile(`(?is)<title[^>]*>.*?</title>\s*`)
	metaRe      = regexp.MustCompile(`(?i)<meta\s+(?:name|property)\s*=\s*"(?:description|og:[a-z:_]+|twitter:(?:title|description|image|card))"[^>]*>\s*`)
	canonicalRe = regexp.MustCompile(`(?i)<link\s+rel\s*=\s*"canonical"[^>]*>\s*`)
)

// Render replaces the head metadata of index with m. Every dynamic value is
// HTML-escaped; JSON-LD is marshalled with json.Marshal, which escapes <, > and &.
func (s *service) Render(index []byte, m *PageMeta) []byte {
	if m == nil {
		return index
	}
	out := titleRe.ReplaceAll(index, nil)
	out = metaRe.ReplaceAll(out, nil)
	out = canonicalRe.ReplaceAll(out, nil)

	e := html.EscapeString
	var b bytes.Buffer
	fmt.Fprintf(&b, "<title>%s</title>\n", e(m.Title))
	fmt.Fprintf(&b, "<meta name=\"description\" content=\"%s\" />\n", e(m.Description))
	fmt.Fprintf(&b, "<link rel=\"canonical\" href=\"%s\" />\n", e(m.Canonical))
	fmt.Fprintf(&b, "<meta property=\"og:title\" content=\"%s\" />\n", e(m.Title))
	fmt.Fprintf(&b, "<meta property=\"og:description\" content=\"%s\" />\n", e(m.Description))
	fmt.Fprintf(&b, "<meta property=\"og:type\" content=\"%s\" />\n", e(m.OGType))
	fmt.Fprintf(&b, "<meta property=\"og:url\" content=\"%s\" />\n", e(m.Canonical))
	fmt.Fprintf(&b, "<meta property=\"og:site_name\" content=\"%s\" />\n", e(s.cfg.SiteName))
	card := "summary"
	if m.Image != "" {
		card = "summary_large_image"
		fmt.Fprintf(&b, "<meta property=\"og:image\" content=\"%s\" />\n", e(m.Image))
		fmt.Fprintf(&b, "<meta name=\"twitter:image\" content=\"%s\" />\n", e(m.Image))
	}
	fmt.Fprintf(&b, "<meta name=\"twitter:card\" content=\"%s\" />\n", card)
	fmt.Fprintf(&b, "<meta name=\"twitter:title\" content=\"%s\" />\n", e(m.Title))
	fmt.Fprintf(&b, "<meta name=\"twitter:description\" content=\"%s\" />\n", e(m.Description))
	for _, ld := range m.JSONLD {
		j, err := json.Marshal(ld)
		if err != nil {
			continue
		}
		fmt.Fprintf(&b, "<script type=\"application/ld+json\">%s</script>\n", j)
	}

	i := bytes.Index(bytes.ToLower(out), []byte("</head>"))
	if i < 0 {
		return index
	}
	res := make([]byte, 0, len(out)+b.Len())
	res = append(res, out[:i]...)
	res = append(res, b.Bytes()...)
	res = append(res, out[i:]...)
	return res
}
