package repository

import (
	"context"
	"encoding/json"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
)

type UserEventStat struct {
	ActiveDays      int
	Reads           int
	LessonsComplete int
	Events          int
	LastEventAt     time.Time
}

// AnalyticsStore is the full MongoDB analytics persistence surface.
type AnalyticsStore interface {
	AnalyticsRepository
	InsertEvents(ctx context.Context, events []*entity.AnalyticsEvent) error
	// EventsBetween streams raw events in [from,to) ordered by server time.
	EventsBetween(ctx context.Context, from, to time.Time, fn func(*entity.AnalyticsEvent)) error
	ReplaceRollups(ctx context.Context, day string, rollups []*entity.AnalyticsRollup) error
	RollupsBetween(ctx context.Context, kind string, from, to time.Time) ([]*entity.AnalyticsRollup, error)
	HasRollups(ctx context.Context, day string) (bool, error)
	UserEventStats(ctx context.Context, userIDs []uint, since time.Time) (map[uint]UserEventStat, error)
	// DeleteByUser purges raw events and removes the user from rollup active-user sets.
	DeleteByUser(ctx context.Context, userID uint) (int64, error)
}

type ContentRef struct {
	Type string
	ID   string
}

func (r ContentRef) Key() string { return r.Type + ":" + r.ID }

type ContentInfo struct {
	Type        string
	ID          string
	Title       string
	Slug        string
	UpdatedAt   time.Time
	PublishedAt *time.Time
}

type DayCount struct {
	Day   string
	Count int64
}

type SignupRow struct {
	UserID    uint
	CreatedAt time.Time
}

type UserActivity struct {
	ID                  uint
	Name                string
	Email               string
	CreatedAt           time.Time
	LastLogin           *time.Time
	ActiveEnrollments   int
	CompletedEnrollment int
}

// PlatformStatsRepository serves cross-store analytics joins from PostgreSQL.
type PlatformStatsRepository interface {
	NewUsersByDay(ctx context.Context, from, to time.Time) ([]DayCount, error)
	EnrollmentsByDay(ctx context.Context, from, to time.Time) ([]DayCount, error)
	CompletionsByDay(ctx context.Context, from, to time.Time) ([]DayCount, error)
	DistinctEnrollers(ctx context.Context, from, to time.Time) (int64, error)
	DistinctCompleters(ctx context.Context, from, to time.Time) (int64, error)
	SignupsBetween(ctx context.Context, from, to time.Time) ([]SignupRow, error)
	ContentInfo(ctx context.Context, refs []ContentRef) (map[string]ContentInfo, error)
	PublishedContent(ctx context.Context, limit int) ([]ContentInfo, error)
	RecentlyPublished(ctx context.Context, since time.Time, limit int) ([]ContentInfo, error)
	UserActivityPage(ctx context.Context, page, size int) ([]UserActivity, int64, error)
}

type UserPreferencesRepository interface {
	Find(ctx context.Context, userID uint) (*entity.UserPreferences, error)
	Save(ctx context.Context, p *entity.UserPreferences) error
	FindByUnsubscribeToken(ctx context.Context, token string) (*entity.UserPreferences, error)
	// DigestCandidates returns verified, active users whose digest is due for the given frequency.
	DigestCandidates(ctx context.Context, freq string, before time.Time, limit int) ([]DigestUser, error)
	MarkDigestSent(ctx context.Context, userID uint, at time.Time) error
}

type DigestUser struct {
	UserID uint
	Email  string
	Name   string
}

type ConsentRepository interface {
	Create(ctx context.Context, c *entity.UserConsent) error
	Latest(ctx context.Context, userID uint) (*entity.UserConsent, error)
	ListByUser(ctx context.Context, userID uint) ([]*entity.UserConsent, error)
}

type EmailQueueRepository interface {
	// Enqueue inserts the item; created=false when its dedupe key already exists.
	Enqueue(ctx context.Context, item *entity.EmailQueueItem) (created bool, err error)
	Claim(ctx context.Context, limit int, lease time.Duration) ([]*entity.EmailQueueItem, error)
	MarkSent(ctx context.Context, id uint, at time.Time) error
	MarkFailed(ctx context.Context, id uint, next time.Time, errMsg string, dead bool) error
	PurgeOlderThan(ctx context.Context, before time.Time) (int64, error)
	DeletePendingForUser(ctx context.Context, userID uint) error
	// RecentlyVerifiedUsers lists active users verified at/after since (welcome sweep).
	RecentlyVerifiedUsers(ctx context.Context, since time.Time, limit int) ([]DigestUser, error)
}

// UserDataRepository is PostgreSQL per-user export and erasure.
type UserDataRepository interface {
	// ExportTables returns the user's rows per table as JSON (missing tables are skipped).
	ExportTables(ctx context.Context, userID uint) (map[string][]json.RawMessage, error)
	// EraseUser deletes personal rows and soft-deletes + anonymises the user atomically.
	EraseUser(ctx context.Context, userID uint) error
}

// UserContentRepository is MongoDB per-user engagement export and erasure.
type UserContentRepository interface {
	Export(ctx context.Context, userID uint) (map[string][]map[string]interface{}, error)
	Erase(ctx context.Context, userID uint) (map[string]int64, error)
}

// NotificationLookup answers whether a notification of a type was already created for a user.
type NotificationLookup interface {
	HasType(ctx context.Context, userID uint, notifType string) (bool, error)
	PurgeReadOlderThan(ctx context.Context, before time.Time) (int64, error)
}
