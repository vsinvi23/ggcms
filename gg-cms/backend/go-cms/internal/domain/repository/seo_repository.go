package repository

import (
	"context"
	"time"
)

const (
	SEOKindArticle    = "article"
	SEOKindCourse     = "course"
	SEOKindTopic      = "topic"
	SEOKindTechnology = "technology"
	SEOKindPath       = "path"
)

type SitemapEntry struct {
	ID           uint
	Slug         string
	CategorySlug string
	LastMod      time.Time
}

type SEOMeta struct {
	Kind         string
	ID           uint
	Slug         string
	Title        string
	Description  string
	ImageURL     string
	CategoryName string
	CategorySlug string
	Subtype      string
	PublishedAt  *time.Time
	UpdatedAt    *time.Time
}

type SEORepository interface {
	CountURLs(ctx context.Context, kind string) (int64, error)
	ListURLs(ctx context.Context, kind string, offset, limit int) ([]SitemapEntry, error)
	FindMeta(ctx context.Context, kind, key string) (*SEOMeta, error)
}
