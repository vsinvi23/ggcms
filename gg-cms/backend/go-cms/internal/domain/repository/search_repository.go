package repository

import (
	"context"
	"time"
)

type SearchParams struct {
	Query       string
	PrefixQuery string
	Types       []string
	Category    string
	Topic       string
	Level       string
	Offset      int
	Limit       int
}

type SearchHitRow struct {
	ContentType   string
	ID            uint
	PublicID      string
	Slug          string
	Title         string
	TitleHL       string
	Description   *string
	Snippet       string
	ThumbnailURL  *string
	CategoryID    *uint
	CategoryName  *string
	CategorySlug  *string
	Level         *string
	Subtype       string
	PublishedAt   *time.Time
	UpdatedAt     *time.Time
	MatchedLesson *string
	Rank          float64
}

type SearchPage struct {
	Hits  []SearchHitRow
	Total int64
}

type SuggestTitle struct {
	ContentType  string
	ID           uint
	Slug         string
	PublicID     string
	Title        string
	CategorySlug *string
}

type SuggestNamed struct {
	ID   uint
	Slug string
	Name string
}

type SuggestResult struct {
	Titles     []SuggestTitle
	Topics     []SuggestNamed
	Categories []SuggestNamed
	Queries    []string
}

type SearchRepository interface {
	Search(ctx context.Context, p SearchParams) (*SearchPage, error)
	Suggest(ctx context.Context, prefix string, limit int) (*SuggestResult, error)
	LogQuery(ctx context.Context, normalized string, resultCount int) error
}
