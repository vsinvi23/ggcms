package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

type seoRepository struct {
	read *gorm.DB
}

func NewSEORepository(read *gorm.DB) repository.SEORepository {
	return &seoRepository{read: read}
}

const (
	sitemapArticleFrom = `FROM articles a LEFT JOIN categories cat ON cat.id = a.category_id AND cat.deleted_at IS NULL
WHERE a.deleted_at IS NULL AND a.slug <> '' AND (a.status = 'PUBLISHED' OR a.has_pending_draft)`
	sitemapCourseFrom = `FROM courses a LEFT JOIN categories cat ON cat.id = a.category_id AND cat.deleted_at IS NULL
WHERE a.deleted_at IS NULL AND a.slug <> '' AND (a.status = 'PUBLISHED' OR a.has_pending_draft)`
	sitemapTopicFrom = `FROM topics t WHERE t.status = 'ACTIVE'`
	sitemapTechFrom  = `FROM categories c WHERE c.deleted_at IS NULL AND c.is_virtual = FALSE AND c.slug <> ''
AND (EXISTS (SELECT 1 FROM articles x WHERE x.category_id = c.id AND x.deleted_at IS NULL AND x.status = 'PUBLISHED')
  OR EXISTS (SELECT 1 FROM courses x WHERE x.category_id = c.id AND x.deleted_at IS NULL AND x.status = 'PUBLISHED'))`
	sitemapPathFrom = `FROM learning_paths p`

	lastModContent = `CASE WHEN a.has_pending_draft THEN COALESCE(a.published_at, a.updated_at) ELSE a.updated_at END`
)

func (r *seoRepository) CountURLs(ctx context.Context, kind string) (int64, error) {
	var from string
	switch kind {
	case repository.SEOKindArticle:
		from = sitemapArticleFrom
	case repository.SEOKindCourse:
		from = sitemapCourseFrom
	case repository.SEOKindTopic:
		from = sitemapTopicFrom
	case repository.SEOKindTechnology:
		from = sitemapTechFrom
	case repository.SEOKindPath:
		from = sitemapPathFrom
	default:
		return 0, errors.New("unknown sitemap kind")
	}
	var n int64
	err := r.read.WithContext(ctx).Raw("SELECT COUNT(*) " + from).Scan(&n).Error
	return n, err
}

type sitemapRow struct {
	ID           uint
	Slug         string
	CategorySlug *string
	LastMod      *time.Time
}

func (r *seoRepository) ListURLs(ctx context.Context, kind string, offset, limit int) ([]repository.SitemapEntry, error) {
	var query string
	switch kind {
	case repository.SEOKindArticle:
		query = "SELECT a.id, a.slug, cat.slug AS category_slug, " + lastModContent + " AS last_mod " + sitemapArticleFrom + " ORDER BY a.id LIMIT ? OFFSET ?"
	case repository.SEOKindCourse:
		query = "SELECT a.id, a.slug, cat.slug AS category_slug, " + lastModContent + " AS last_mod " + sitemapCourseFrom + " ORDER BY a.id LIMIT ? OFFSET ?"
	case repository.SEOKindTopic:
		query = "SELECT t.id, t.slug, NULL AS category_slug, t.updated_at AS last_mod " + sitemapTopicFrom + " ORDER BY t.id LIMIT ? OFFSET ?"
	case repository.SEOKindTechnology:
		query = "SELECT c.id, c.slug, NULL AS category_slug, c.updated_at AS last_mod " + sitemapTechFrom + " ORDER BY c.id LIMIT ? OFFSET ?"
	case repository.SEOKindPath:
		query = "SELECT p.id, p.slug, NULL AS category_slug, p.updated_at AS last_mod " + sitemapPathFrom + " ORDER BY p.id LIMIT ? OFFSET ?"
	default:
		return nil, errors.New("unknown sitemap kind")
	}
	var rows []sitemapRow
	if err := r.read.WithContext(ctx).Raw(query, limit, offset).Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]repository.SitemapEntry, len(rows))
	for i, row := range rows {
		e := repository.SitemapEntry{ID: row.ID, Slug: row.Slug}
		if row.CategorySlug != nil {
			e.CategorySlug = *row.CategorySlug
		}
		if row.LastMod != nil {
			e.LastMod = *row.LastMod
		}
		out[i] = e
	}
	return out, nil
}

type metaRow struct {
	ID           uint
	Slug         string
	Title        string
	Description  *string
	ImageURL     *string
	CategoryName *string
	CategorySlug *string
	Subtype      *string
	PublishedAt  *time.Time
	UpdatedAt    *time.Time
}

func (r *seoRepository) FindMeta(ctx context.Context, kind, key string) (*repository.SEOMeta, error) {
	var query string
	args := []interface{}{key, key}
	switch kind {
	case repository.SEOKindArticle:
		args = []interface{}{key, key, key}
		query = contentMetaSQL("articles", "a.article_type")
	case repository.SEOKindCourse:
		args = []interface{}{key, key, key}
		query = contentMetaSQL("courses", "a.course_type")
	case repository.SEOKindTopic:
		query = `SELECT t.id, t.slug, t.name AS title, t.description, NULL AS image_url, NULL AS category_name, NULL AS category_slug,
  t.entity_type AS subtype, NULL AS published_at, t.updated_at
FROM topics t WHERE t.status = 'ACTIVE' AND (t.slug = ? OR t.id::text = ?) LIMIT 1`
	case repository.SEOKindTechnology:
		query = `SELECT c.id, c.slug, c.name AS title, NULL AS description, NULL AS image_url, c.name AS category_name, c.slug AS category_slug,
  NULL AS subtype, NULL AS published_at, c.updated_at
FROM categories c WHERE c.deleted_at IS NULL AND c.is_virtual = FALSE AND (c.slug = ? OR c.id::text = ?) LIMIT 1`
	case repository.SEOKindPath:
		query = `SELECT p.id, p.slug, p.title, p.description, NULL AS image_url, NULL AS category_name, NULL AS category_slug,
  p.kind AS subtype, NULL AS published_at, p.updated_at
FROM learning_paths p WHERE p.slug = ? OR p.id::text = ? LIMIT 1`
	default:
		return nil, errors.New("unknown seo kind")
	}
	var rows []metaRow
	if err := r.read.WithContext(ctx).Raw(query, args...).Scan(&rows).Error; err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	m := rows[0]
	out := &repository.SEOMeta{Kind: kind, ID: m.ID, Slug: m.Slug, Title: m.Title, PublishedAt: m.PublishedAt, UpdatedAt: m.UpdatedAt}
	if m.Description != nil {
		out.Description = *m.Description
	}
	if m.ImageURL != nil {
		out.ImageURL = *m.ImageURL
	}
	if m.CategoryName != nil {
		out.CategoryName = *m.CategoryName
	}
	if m.CategorySlug != nil {
		out.CategorySlug = *m.CategorySlug
	}
	if m.Subtype != nil {
		out.Subtype = *m.Subtype
	}
	return out, nil
}

func contentMetaSQL(table, subtype string) string {
	return `SELECT a.id, a.slug,
  CASE WHEN a.has_pending_draft AND a.published_title <> '' THEN a.published_title ELSE a.title END AS title,
  CASE WHEN a.has_pending_draft THEN a.published_description ELSE a.description END AS description,
  a.thumbnail_url AS image_url, cat.name AS category_name, cat.slug AS category_slug, ` + subtype + `::text AS subtype,
  a.published_at, a.updated_at
FROM ` + table + ` a LEFT JOIN categories cat ON cat.id = a.category_id AND cat.deleted_at IS NULL
WHERE a.deleted_at IS NULL AND (a.status = 'PUBLISHED' OR a.has_pending_draft)
  AND (a.slug = ? OR a.public_id = ? OR a.id::text = ?) LIMIT 1`
}
