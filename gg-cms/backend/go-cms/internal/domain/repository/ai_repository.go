package repository

import (
	"context"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
)

type AIUsageRow struct {
	Key          string `json:"key"`
	Calls        int64  `json:"calls"`
	InputTokens  int64  `json:"inputTokens"`
	OutputTokens int64  `json:"outputTokens"`
	CostMicroUSD int64  `json:"costMicroUsd"`
	AvgLatencyMs int64  `json:"avgLatencyMs"`
	Errors       int64  `json:"errors"`
}

type AIUsageReport struct {
	Total  AIUsageRow   `json:"total"`
	ByTask []AIUsageRow `json:"byTask"`
	ByUser []AIUsageRow `json:"byUser"`
	ByDay  []AIUsageRow `json:"byDay"`
}

type AIUsageRepository interface {
	RecordUsage(ctx context.Context, u *entity.AIUsage) error
	CostSince(ctx context.Context, since time.Time) (int64, error)
	CountSince(ctx context.Context, userID uint, tasks []string, since time.Time) (int64, error)
	UsageReport(ctx context.Context, from, to time.Time) (*AIUsageReport, error)
}

type AIDraftRepository interface {
	CreateDraft(ctx context.Context, d *entity.AIDraft) error
	GetDraft(ctx context.Context, id string) (*entity.AIDraft, error)
	ListDrafts(ctx context.Context, contentType string, contentID uint, kind string) ([]*entity.AIDraft, error)
	SetDraftStatus(ctx context.Context, id, status string, reviewerID uint) error
}

type AIConversationRepository interface {
	CreateConversation(ctx context.Context, c *entity.AIConversation) error
	GetConversation(ctx context.Context, id string, userID uint) (*entity.AIConversation, error)
	ListConversations(ctx context.Context, userID uint, limit int) ([]*entity.AIConversation, error)
	DeleteConversation(ctx context.Context, id string, userID uint) (bool, error)
	AppendMessage(ctx context.Context, m *entity.AIMessage) error
	RecentMessages(ctx context.Context, conversationID string, limit int) ([]*entity.AIMessage, error)
	SetFeedback(ctx context.Context, messageID, userID uint, rating int, comment string) (bool, error)
}

type ChunkContentRef struct {
	ContentType string
	ContentID   uint
	Stamp       time.Time
}

type IndexDoc struct {
	ContentType string
	ContentID   uint
	Title       string
	Body        string
	Stamp       time.Time
	Lessons     []IndexLesson
}

type IndexLesson struct {
	Title   string
	Content string
}

type PublishedDoc struct {
	ContentType string
	ContentID   uint
	PublicID    string
	Slug        string
	Title       string
}

type AIChunkRepository interface {
	StaleContent(ctx context.Context) ([]ChunkContentRef, error)
	LoadIndexDoc(ctx context.Context, contentType string, id uint) (*IndexDoc, error)
	ReplaceChunks(ctx context.Context, contentType string, id uint, chunks []entity.ContentChunk) error
	PruneUnpublished(ctx context.Context) error
	SearchChunks(ctx context.Context, tsQuery, contentType string, contentID uint, limit int) ([]entity.ContentChunk, error)
	PublishedDoc(ctx context.Context, contentType string, id uint) (*PublishedDoc, error)
}

type AITaxon struct {
	ID   uint
	Name string
}

type AICatalogItem struct {
	ID          uint
	Title       string
	Description string
}

type AICatalogRepository interface {
	Tags(ctx context.Context) ([]AITaxon, error)
	Topics(ctx context.Context) ([]AITaxon, error)
	Categories(ctx context.Context) ([]AITaxon, error)
	PublishedCourses(ctx context.Context, limit int) ([]AICatalogItem, error)
	LearningPaths(ctx context.Context, limit int) ([]AICatalogItem, error)
	ContentExists(ctx context.Context, ref string) (bool, error)
}

type AIModerationRepository interface {
	UpsertModeration(ctx context.Context, m *entity.AIModerationItem) error
	HiddenCommentIDs(ctx context.Context, ids []string) (map[string]bool, error)
	ListModeration(ctx context.Context, status string, page, size int) ([]*entity.AIModerationItem, int64, error)
	ResolveModeration(ctx context.Context, id uint, status string, reviewerID uint) (bool, error)
}
