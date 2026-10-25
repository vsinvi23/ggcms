package search

import (
	"context"
	"errors"
	"html"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/serenya/go-cms/internal/domain/repository"
	applogger "github.com/serenya/go-cms/pkg/logger"
	"go.uber.org/zap"
)

const (
	maxQueryRunes   = 200
	maxLogRunes     = 100
	maxTokens       = 8
	maxTokenRunes   = 40
	defaultPageSize = 10
	maxPageSize     = 50
	maxSuggest      = 8
	hlStart         = "[[hl]]"
	hlStop          = "[[/hl]]"
)

var digitRun = regexp.MustCompile(`\d{6,}`)

var ErrInvalidFilter = errors.New("invalid search filter")

var validLevels = map[string]struct{}{"beginner": {}, "intermediate": {}, "advanced": {}, "expert": {}}

type EventTracker interface {
	TrackEvent(ctx context.Context, eventType string, userID *uint, contentID, contentType *string, metadata map[string]interface{}) error
}

type Request struct {
	Query    string
	Type     string
	Category string
	Topic    string
	Level    string
	Page     int
	Size     int
	UserID   *uint
}

type CategoryRef struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

type Hit struct {
	Type          string       `json:"type"`
	ID            uint         `json:"id"`
	PublicID      string       `json:"publicId"`
	Slug          string       `json:"slug"`
	Path          string       `json:"path"`
	Title         string       `json:"title"`
	TitleHTML     string       `json:"titleHtml"`
	Description   *string      `json:"description,omitempty"`
	SnippetHTML   string       `json:"snippetHtml,omitempty"`
	ThumbnailURL  *string      `json:"thumbnailUrl,omitempty"`
	Category      *CategoryRef `json:"category,omitempty"`
	Level         *string      `json:"level,omitempty"`
	Subtype       string       `json:"subtype,omitempty"`
	PublishedAt   *time.Time   `json:"publishedAt,omitempty"`
	MatchedLesson *string      `json:"matchedLesson,omitempty"`
	Score         float64      `json:"score"`
}

type Response struct {
	Query      string `json:"query"`
	Total      int64  `json:"total"`
	Page       int    `json:"page"`
	Size       int    `json:"size"`
	TotalPages int    `json:"totalPages"`
	Hits       []Hit  `json:"hits"`
}

type SuggestTitle struct {
	Type  string `json:"type"`
	ID    uint   `json:"id"`
	Title string `json:"title"`
	Path  string `json:"path"`
}

type SuggestNamed struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

type SuggestResponse struct {
	Query      string         `json:"query"`
	Titles     []SuggestTitle `json:"titles"`
	Topics     []SuggestNamed `json:"topics"`
	Categories []SuggestNamed `json:"categories"`
	Queries    []string       `json:"queries"`
}

type Service interface {
	Search(ctx context.Context, req Request) (*Response, error)
	Suggest(ctx context.Context, q string, limit int) (*SuggestResponse, error)
}

type Option func(*service)

func WithEventTracker(t EventTracker) Option {
	return func(s *service) { s.tracker = t }
}

type service struct {
	repo    repository.SearchRepository
	tracker EventTracker
}

func NewService(repo repository.SearchRepository, opts ...Option) Service {
	s := &service{repo: repo}
	for _, o := range opts {
		o(s)
	}
	return s
}

func normalize(q string) string {
	q = strings.Join(strings.Fields(q), " ")
	r := []rune(q)
	if len(r) > maxQueryRunes {
		r = r[:maxQueryRunes]
	}
	return strings.TrimSpace(string(r))
}

func tokens(q string) []string {
	parts := strings.FieldsFunc(strings.ToLower(q), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		r := []rune(p)
		if len(r) > maxTokenRunes {
			r = r[:maxTokenRunes]
		}
		out = append(out, string(r))
		if len(out) == maxTokens {
			break
		}
	}
	return out
}

func prefixQuery(q string) string {
	toks := tokens(q)
	if len(toks) == 0 {
		return ""
	}
	toks[len(toks)-1] += ":*"
	return strings.Join(toks, " & ")
}

func logForm(q string) string {
	if strings.Contains(q, "@") || digitRun.MatchString(q) {
		return ""
	}
	r := []rune(strings.ToLower(strings.Join(tokens(q), " ")))
	if len(r) > maxLogRunes {
		r = r[:maxLogRunes]
	}
	return string(r)
}

func (s *service) Search(ctx context.Context, req Request) (*Response, error) {
	q := normalize(req.Query)
	types := []string{"article", "course"}
	switch strings.ToLower(req.Type) {
	case "", "all":
	case "article", "articles":
		types = []string{"article"}
	case "course", "courses":
		types = []string{"course"}
	default:
		return nil, ErrInvalidFilter
	}
	level := strings.ToLower(strings.TrimSpace(req.Level))
	if level != "" {
		if _, ok := validLevels[level]; !ok {
			return nil, ErrInvalidFilter
		}
	}
	category := capRunes(strings.ToLower(strings.TrimSpace(req.Category)), 120)
	topic := capRunes(strings.ToLower(strings.TrimSpace(req.Topic)), 120)

	size := req.Size
	if size <= 0 {
		size = defaultPageSize
	}
	if size > maxPageSize {
		size = maxPageSize
	}
	page := req.Page
	if page < 0 {
		page = 0
	}

	resp := &Response{Query: q, Page: page, Size: size, Hits: []Hit{}}
	if q == "" && category == "" && topic == "" && level == "" {
		return resp, nil
	}

	res, err := s.repo.Search(ctx, repository.SearchParams{
		Query:       q,
		PrefixQuery: prefixQuery(q),
		Types:       types,
		Category:    category,
		Topic:       topic,
		Level:       level,
		Offset:      page * size,
		Limit:       size,
	})
	if err != nil {
		return nil, err
	}

	resp.Total = res.Total
	resp.TotalPages = int((res.Total + int64(size) - 1) / int64(size))
	for _, h := range res.Hits {
		resp.Hits = append(resp.Hits, toHit(h))
	}

	if page == 0 && q != "" {
		s.record(req.UserID, q, int(res.Total))
	}
	return resp, nil
}

func (s *service) record(userID *uint, q string, total int) {
	norm := logForm(q)
	if len([]rune(norm)) < 2 {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := s.repo.LogQuery(ctx, norm, total); err != nil {
			applogger.Warn("search: log query failed", zap.Error(err))
		}
		if s.tracker != nil {
			meta := map[string]interface{}{"query_text": norm, "result_count": total}
			if err := s.tracker.TrackEvent(ctx, "search", userID, nil, nil, meta); err != nil {
				applogger.Warn("search: track event failed", zap.Error(err))
			}
		}
	}()
}

func (s *service) Suggest(ctx context.Context, q string, limit int) (*SuggestResponse, error) {
	q = capRunes(normalize(q), 60)
	if limit <= 0 || limit > maxSuggest {
		limit = 5
	}
	out := &SuggestResponse{Query: q, Titles: []SuggestTitle{}, Topics: []SuggestNamed{}, Categories: []SuggestNamed{}, Queries: []string{}}
	if len([]rune(q)) < 2 {
		return out, nil
	}
	res, err := s.repo.Suggest(ctx, q, limit)
	if err != nil {
		return nil, err
	}
	for _, t := range res.Titles {
		out.Titles = append(out.Titles, SuggestTitle{Type: t.ContentType, ID: t.ID, Title: t.Title, Path: contentPath(t.ContentType, t.CategorySlug, t.Slug, t.PublicID)})
	}
	for _, t := range res.Topics {
		out.Topics = append(out.Topics, SuggestNamed{ID: t.ID, Name: t.Name, Slug: t.Slug})
	}
	for _, c := range res.Categories {
		out.Categories = append(out.Categories, SuggestNamed{ID: c.ID, Name: c.Name, Slug: c.Slug})
	}
	for _, p := range res.Queries {
		if !strings.EqualFold(p, q) {
			out.Queries = append(out.Queries, p)
		}
	}
	return out, nil
}

func toHit(h repository.SearchHitRow) Hit {
	hit := Hit{
		Type:          h.ContentType,
		ID:            h.ID,
		PublicID:      h.PublicID,
		Slug:          h.Slug,
		Path:          contentPath(h.ContentType, h.CategorySlug, h.Slug, h.PublicID),
		Title:         h.Title,
		TitleHTML:     Highlight(h.TitleHL),
		Description:   h.Description,
		SnippetHTML:   Highlight(h.Snippet),
		ThumbnailURL:  h.ThumbnailURL,
		Level:         h.Level,
		Subtype:       h.Subtype,
		PublishedAt:   h.PublishedAt,
		MatchedLesson: h.MatchedLesson,
		Score:         h.Rank,
	}
	if hit.TitleHTML == "" {
		hit.TitleHTML = html.EscapeString(h.Title)
	}
	if h.CategoryID != nil && h.CategoryName != nil && h.CategorySlug != nil {
		hit.Category = &CategoryRef{ID: *h.CategoryID, Name: *h.CategoryName, Slug: *h.CategorySlug}
	}
	return hit
}

func contentPath(contentType string, categorySlug *string, slug, publicID string) string {
	id := slug
	if id == "" {
		id = publicID
	}
	base := "/article/"
	if contentType == "course" {
		base = "/course/"
	}
	if categorySlug != nil && *categorySlug != "" {
		return base + *categorySlug + "/" + id
	}
	return base + id
}

// Highlight HTML-escapes text and turns repository highlight markers into <mark> tags.
func Highlight(s string) string {
	if s == "" {
		return ""
	}
	s = html.EscapeString(s)
	s = strings.ReplaceAll(s, hlStart, "<mark>")
	return strings.ReplaceAll(s, hlStop, "</mark>")
}

func capRunes(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}
