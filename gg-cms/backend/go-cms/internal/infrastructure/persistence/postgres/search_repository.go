package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/serenya/go-cms/internal/domain/repository"
	applogger "github.com/serenya/go-cms/pkg/logger"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

const (
	searchHLStart = "[[hl]]"
	searchHLOpts  = "StartSel=[[hl]], StopSel=[[/hl]], MaxFragments=2, MaxWords=25, MinWords=8, ShortWord=2, FragmentDelimiter=\" ... \""
	jsonNoiseRe   = `'"[A-Za-z_]+"\s*:|[{}\[\]"]|<[^>]+>'`
)

type searchRepository struct {
	write *gorm.DB
	read  *gorm.DB

	mu        sync.Mutex
	trgm      bool
	trgmUntil time.Time
}

func NewSearchRepository(write, read *gorm.DB) repository.SearchRepository {
	return &searchRepository{write: write, read: read}
}

func (r *searchRepository) hasTrigram(ctx context.Context) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if time.Now().Before(r.trgmUntil) {
		return r.trgm
	}
	var ok bool
	if err := r.read.WithContext(ctx).Raw("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm')").Scan(&ok).Error; err != nil {
		applogger.Warn("search: pg_trgm detection failed", zap.Error(err))
		ok = false
	}
	r.trgm = ok
	r.trgmUntil = time.Now().Add(5 * time.Minute)
	return ok
}

type sqlArgs struct{ vals []interface{} }

func (a *sqlArgs) add(v interface{}) string {
	a.vals = append(a.vals, v)
	return fmt.Sprintf("$%d", len(a.vals))
}

func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

func (r *searchRepository) Search(ctx context.Context, p repository.SearchParams) (*repository.SearchPage, error) {
	trgm := r.hasTrigram(ctx)
	args := &sqlArgs{}
	raw := p.Query
	rawP := args.add(raw)
	prefP := args.add(p.PrefixQuery)
	prefP2 := args.add(p.PrefixQuery)

	var sb strings.Builder
	fmt.Fprintf(&sb, `WITH q AS (
  SELECT wq, pq, (CASE WHEN pq IS NULL THEN wq ELSE wq || pq END) AS aq FROM (
    SELECT websearch_to_tsquery('simple', %s::text) AS wq,
           CASE WHEN %s::text = '' THEN NULL::tsquery ELSE to_tsquery('simple', %s::text) END AS pq
  ) s
),
docs AS (
`, rawP, prefP, prefP2)

	var parts []string
	for _, t := range p.Types {
		alias, ctype, sub := "a", "article", "a.article_type"
		table, upper := "articles", "ARTICLE"
		if t == "course" {
			alias, ctype, sub, table, upper = "c", "course", "c.course_type", "courses", "COURSE"
		}
		var w strings.Builder
		fmt.Fprintf(&w, `SELECT '%[1]s'::text AS content_type, %[2]s.id, %[2]s.public_id, %[2]s.slug, %[2]s.title, %[2]s.description,
  %[2]s.thumbnail_url, %[2]s.category_id, %[2]s.published_at, %[2]s.updated_at, %[2]s.level, %[3]s::text AS subtype,
  cat.name AS category_name, cat.slug AS category_slug,
  (%[2]s.search_vector || setweight(to_tsvector('simple', coalesce(cat.name, '') || ' ' || coalesce(m.names, '')), 'B')) AS vec
FROM %[4]s %[2]s
LEFT JOIN categories cat ON cat.id = %[2]s.category_id AND cat.deleted_at IS NULL
LEFT JOIN categories pcat ON pcat.id = cat.parent_id
LEFT JOIN LATERAL (
  SELECT string_agg(x.n, ' ') AS names FROM (
    SELECT t.name AS n FROM content_topics ct JOIN topics t ON t.id = ct.topic_id
      WHERE ct.content_id = %[2]s.id AND upper(ct.content_type) = '%[5]s' AND t.status = 'ACTIVE'
    UNION ALL
    SELECT ta.alias FROM content_topics ct JOIN topic_aliases ta ON ta.topic_id = ct.topic_id
      WHERE ct.content_id = %[2]s.id AND upper(ct.content_type) = '%[5]s' AND ta.status = 'ACTIVE'
    UNION ALL
    SELECT tg.name FROM category_tags cgt JOIN tags tg ON tg.id = cgt.tag_id WHERE cgt.category_id = %[2]s.category_id
  ) x
) m ON TRUE
WHERE %[2]s.deleted_at IS NULL AND %[2]s.status = 'PUBLISHED'`, ctype, alias, sub, table, upper)
		if p.Category != "" {
			ph := args.add(p.Category)
			fmt.Fprintf(&w, " AND (cat.slug = %s OR pcat.slug = %s)", ph, ph)
		}
		if p.Topic != "" {
			fmt.Fprintf(&w, ` AND EXISTS (SELECT 1 FROM content_topics fct JOIN topics ft ON ft.id = fct.topic_id
  WHERE fct.content_id = %s.id AND upper(fct.content_type) = '%s' AND ft.slug = %s)`, alias, upper, args.add(p.Topic))
		}
		if p.Level != "" {
			fmt.Fprintf(&w, " AND %s.level = %s", alias, args.add(p.Level))
		}
		parts = append(parts, w.String())
	}
	if len(parts) == 0 {
		return &repository.SearchPage{Hits: []repository.SearchHitRow{}}, nil
	}
	sb.WriteString(strings.Join(parts, "\nUNION ALL\n"))
	sb.WriteString("\n),\n")

	lessonHit := `EXISTS (SELECT 1 FROM lessons l JOIN sections s ON s.id = l.section_id
  WHERE s.course_id = d.id AND s.deleted_at IS NULL AND l.deleted_at IS NULL
    AND (l.search_vector @@ q.aq OR s.search_vector @@ q.aq))`
	rank := "0::float8"
	match := "TRUE"
	if raw != "" {
		rank = "ts_rank_cd('{0.1,0.2,0.6,1.0}', d.vec, q.aq, 32) + CASE WHEN d.content_type = 'course' AND " + lessonHit + " THEN 0.3 ELSE 0 END"
		match = "(d.vec @@ q.aq OR (d.content_type = 'course' AND " + lessonHit + ")"
		if trgm {
			rank += " + 0.4 * word_similarity(" + rawP + "::text, d.title)"
			match += " OR " + rawP + "::text <% d.title"
		} else {
			match += " OR d.title ILIKE " + args.add("%"+escapeLike(raw)+"%")
		}
		match += ")"
	}
	fmt.Fprintf(&sb, `ranked AS (
  SELECT d.content_type, d.id, (%s)::float8 AS rank, count(*) OVER() AS total
  FROM docs d CROSS JOIN q
  WHERE %s
  ORDER BY rank DESC, d.published_at DESC NULLS LAST, d.id DESC
  LIMIT %s OFFSET %s
)
`, rank, match, args.add(p.Limit), args.add(p.Offset))

	fmt.Fprintf(&sb, `SELECT d.content_type, d.id, d.public_id, d.slug, d.title,
  ts_headline('simple', d.title, q.aq, 'StartSel=[[hl]], StopSel=[[/hl]]') AS title_hl,
  d.description,
  CASE WHEN coalesce(d.description, '') <> '' AND to_tsvector('simple', d.description) @@ q.aq
       THEN ts_headline('simple', d.description, q.aq, '%[1]s') ELSE '' END AS desc_hl,
  ts_headline('simple', regexp_replace(left(coalesce(a.body, c.body, ''), 20000), %[2]s, ' ', 'g'), q.aq, '%[1]s') AS body_hl,
  d.thumbnail_url, d.category_id, d.category_name, d.category_slug, d.level, d.subtype, d.published_at, d.updated_at,
  ml.title AS matched_lesson, r.rank, r.total
FROM ranked r
JOIN docs d ON d.content_type = r.content_type AND d.id = r.id
CROSS JOIN q
LEFT JOIN articles a ON r.content_type = 'article' AND a.id = r.id
LEFT JOIN courses c ON r.content_type = 'course' AND c.id = r.id
LEFT JOIN LATERAL (
  SELECT l.title FROM lessons l JOIN sections s ON s.id = l.section_id
  WHERE d.content_type = 'course' AND s.course_id = d.id AND s.deleted_at IS NULL AND l.deleted_at IS NULL
    AND l.search_vector @@ q.aq
  ORDER BY ts_rank(l.search_vector, q.aq) DESC LIMIT 1
) ml ON TRUE
ORDER BY r.rank DESC, d.published_at DESC NULLS LAST, d.id DESC`, searchHLOpts, jsonNoiseRe)

	sqlDB, err := r.read.DB()
	if err != nil {
		return nil, err
	}
	rows, err := sqlDB.QueryContext(ctx, sb.String(), args.vals...)
	if err != nil {
		return nil, fmt.Errorf("search query: %w", err)
	}
	defer rows.Close()

	page := &repository.SearchPage{Hits: []repository.SearchHitRow{}}
	for rows.Next() {
		var h repository.SearchHitRow
		var descHL, bodyHL string
		var id, total int64
		var catID sql.NullInt64
		if err := rows.Scan(&h.ContentType, &id, &h.PublicID, &h.Slug, &h.Title, &h.TitleHL, &h.Description, &descHL, &bodyHL,
			&h.ThumbnailURL, &catID, &h.CategoryName, &h.CategorySlug, &h.Level, &h.Subtype, &h.PublishedAt, &h.UpdatedAt,
			&h.MatchedLesson, &h.Rank, &total); err != nil {
			return nil, fmt.Errorf("search scan: %w", err)
		}
		h.ID = uint(id)
		if catID.Valid {
			cid := uint(catID.Int64)
			h.CategoryID = &cid
		}
		switch {
		case descHL != "":
			h.Snippet = descHL
		case strings.Contains(bodyHL, searchHLStart):
			h.Snippet = bodyHL
		}
		page.Total = total
		page.Hits = append(page.Hits, h)
	}
	return page, rows.Err()
}

func (r *searchRepository) Suggest(ctx context.Context, prefix string, limit int) (*repository.SuggestResult, error) {
	out := &repository.SuggestResult{}
	if prefix == "" {
		return out, nil
	}
	like := escapeLike(prefix) + "%"
	contains := "%" + escapeLike(prefix) + "%"
	db := r.read.WithContext(ctx)

	type titleRow struct {
		ContentType  string
		ID           uint
		Slug         string
		PublicID     string
		Title        string
		CategorySlug *string
	}
	var titles []titleRow
	if err := db.Raw(`
SELECT content_type, id, slug, public_id, title, category_slug FROM (
  SELECT 'article' AS content_type, a.id, a.slug, a.public_id, a.title, cat.slug AS category_slug,
         (CASE WHEN a.title ILIKE ? THEN 0 ELSE 1 END) AS pri, a.published_at
  FROM articles a LEFT JOIN categories cat ON cat.id = a.category_id
  WHERE a.deleted_at IS NULL AND a.status = 'PUBLISHED' AND a.title ILIKE ?
  UNION ALL
  SELECT 'course', c.id, c.slug, c.public_id, c.title, cat.slug,
         (CASE WHEN c.title ILIKE ? THEN 0 ELSE 1 END), c.published_at
  FROM courses c LEFT JOIN categories cat ON cat.id = c.category_id
  WHERE c.deleted_at IS NULL AND c.status = 'PUBLISHED' AND c.title ILIKE ?
) u ORDER BY pri, published_at DESC NULLS LAST LIMIT ?`, like, contains, like, contains, limit).Scan(&titles).Error; err != nil {
		applogger.Warn("search: suggest titles failed", zap.Error(err))
	}
	for _, t := range titles {
		out.Titles = append(out.Titles, repository.SuggestTitle{ContentType: t.ContentType, ID: t.ID, Slug: t.Slug, PublicID: t.PublicID, Title: t.Title, CategorySlug: t.CategorySlug})
	}

	type namedRow struct {
		ID   uint
		Slug string
		Name string
	}
	var topics []namedRow
	if err := db.Raw(`
SELECT t.id, t.slug, t.name FROM topics t
WHERE t.status = 'ACTIVE' AND (t.name ILIKE ? OR EXISTS (SELECT 1 FROM topic_aliases ta WHERE ta.topic_id = t.id AND ta.status = 'ACTIVE' AND ta.alias ILIKE ?))
ORDER BY (CASE WHEN t.name ILIKE ? THEN 0 ELSE 1 END), t.name LIMIT ?`, contains, like, like, limit).Scan(&topics).Error; err != nil {
		applogger.Warn("search: suggest topics failed", zap.Error(err))
	}
	for _, t := range topics {
		out.Topics = append(out.Topics, repository.SuggestNamed{ID: t.ID, Slug: t.Slug, Name: t.Name})
	}

	var cats []namedRow
	if err := db.Raw(`
SELECT id, slug, name FROM categories
WHERE deleted_at IS NULL AND is_virtual = FALSE AND name ILIKE ?
ORDER BY (CASE WHEN name ILIKE ? THEN 0 ELSE 1 END), name LIMIT ?`, contains, like, limit).Scan(&cats).Error; err != nil {
		applogger.Warn("search: suggest categories failed", zap.Error(err))
	}
	for _, c := range cats {
		out.Categories = append(out.Categories, repository.SuggestNamed{ID: c.ID, Slug: c.Slug, Name: c.Name})
	}

	if err := db.Raw(`
SELECT query_norm FROM search_query_log
WHERE created_at > NOW() - INTERVAL '30 days' AND result_count > 0 AND query_norm LIKE ?
GROUP BY query_norm ORDER BY COUNT(*) DESC, MAX(created_at) DESC LIMIT ?`, like, limit).Scan(&out.Queries).Error; err != nil {
		applogger.Warn("search: suggest queries failed", zap.Error(err))
	}
	return out, nil
}

func (r *searchRepository) LogQuery(ctx context.Context, normalized string, resultCount int) error {
	return r.write.WithContext(ctx).Exec(
		"INSERT INTO search_query_log (query_norm, result_count) VALUES (?, ?)", normalized, resultCount).Error
}
