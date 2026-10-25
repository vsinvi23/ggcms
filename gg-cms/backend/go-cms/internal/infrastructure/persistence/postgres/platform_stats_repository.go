package postgres

import (
	"context"
	"strconv"
	"time"

	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

type platformStatsRepository struct {
	read *gorm.DB
}

func NewPlatformStatsRepository(read *gorm.DB) repository.PlatformStatsRepository {
	return &platformStatsRepository{read: read}
}

func (r *platformStatsRepository) dayCounts(ctx context.Context, query string, from, to time.Time) ([]repository.DayCount, error) {
	var rows []repository.DayCount
	err := r.read.WithContext(ctx).Raw(query, from, to).Scan(&rows).Error
	return rows, err
}

func (r *platformStatsRepository) NewUsersByDay(ctx context.Context, from, to time.Time) ([]repository.DayCount, error) {
	return r.dayCounts(ctx, `SELECT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS day, COUNT(*) AS count
		FROM users WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ? GROUP BY 1`, from, to)
}

func (r *platformStatsRepository) EnrollmentsByDay(ctx context.Context, from, to time.Time) ([]repository.DayCount, error) {
	return r.dayCounts(ctx, `SELECT to_char(COALESCE(enrolled_at, created_at) AT TIME ZONE 'UTC','YYYY-MM-DD') AS day, COUNT(*) AS count
		FROM enrollments WHERE deleted_at IS NULL AND COALESCE(enrolled_at, created_at) >= ? AND COALESCE(enrolled_at, created_at) < ? GROUP BY 1`, from, to)
}

func (r *platformStatsRepository) CompletionsByDay(ctx context.Context, from, to time.Time) ([]repository.DayCount, error) {
	return r.dayCounts(ctx, `SELECT to_char(completed_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS day, COUNT(*) AS count
		FROM enrollments WHERE deleted_at IS NULL AND completed_at >= ? AND completed_at < ? GROUP BY 1`, from, to)
}

func (r *platformStatsRepository) DistinctEnrollers(ctx context.Context, from, to time.Time) (int64, error) {
	var n int64
	err := r.read.WithContext(ctx).Raw(`SELECT COUNT(DISTINCT user_id) FROM enrollments
		WHERE deleted_at IS NULL AND COALESCE(enrolled_at, created_at) >= ? AND COALESCE(enrolled_at, created_at) < ?`, from, to).Scan(&n).Error
	return n, err
}

func (r *platformStatsRepository) DistinctCompleters(ctx context.Context, from, to time.Time) (int64, error) {
	var n int64
	err := r.read.WithContext(ctx).Raw(`SELECT COUNT(DISTINCT user_id) FROM enrollments
		WHERE deleted_at IS NULL AND completed_at >= ? AND completed_at < ?`, from, to).Scan(&n).Error
	return n, err
}

func (r *platformStatsRepository) SignupsBetween(ctx context.Context, from, to time.Time) ([]repository.SignupRow, error) {
	var rows []repository.SignupRow
	err := r.read.WithContext(ctx).Raw(`SELECT id AS user_id, created_at FROM users
		WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?`, from, to).Scan(&rows).Error
	return rows, err
}

type contentInfoRow struct {
	ID          uint
	Title       string
	Slug        string
	UpdatedAt   time.Time
	PublishedAt *time.Time
}

func (r *platformStatsRepository) ContentInfo(ctx context.Context, refs []repository.ContentRef) (map[string]repository.ContentInfo, error) {
	out := map[string]repository.ContentInfo{}
	ids := map[string][]uint{}
	for _, ref := range refs {
		if ref.Type != "article" && ref.Type != "course" {
			continue
		}
		if n, err := strconv.ParseUint(ref.ID, 10, 64); err == nil {
			ids[ref.Type] = append(ids[ref.Type], uint(n))
		}
	}
	for typ, list := range ids {
		table := typ + "s"
		var rows []contentInfoRow
		if err := r.read.WithContext(ctx).Raw("SELECT id, title, slug, updated_at, published_at FROM "+table+" WHERE id IN ?", list).Scan(&rows).Error; err != nil {
			return nil, err
		}
		for _, row := range rows {
			id := strconv.FormatUint(uint64(row.ID), 10)
			out[typ+":"+id] = repository.ContentInfo{Type: typ, ID: id, Title: row.Title, Slug: row.Slug, UpdatedAt: row.UpdatedAt, PublishedAt: row.PublishedAt}
		}
	}
	return out, nil
}

func (r *platformStatsRepository) published(ctx context.Context, where string, args []interface{}, limit int) ([]repository.ContentInfo, error) {
	type row struct {
		Type        string
		ID          uint
		Title       string
		Slug        string
		UpdatedAt   time.Time
		PublishedAt *time.Time
	}
	var rows []row
	q := `SELECT * FROM (
		SELECT 'article' AS type, id, title, slug, updated_at, published_at FROM articles WHERE status = 'PUBLISHED' AND deleted_at IS NULL
		UNION ALL
		SELECT 'course' AS type, id, title, slug, updated_at, published_at FROM courses WHERE status = 'PUBLISHED' AND deleted_at IS NULL
	) c ` + where + ` LIMIT ?`
	if err := r.read.WithContext(ctx).Raw(q, append(args, limit)...).Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]repository.ContentInfo, len(rows))
	for i, rw := range rows {
		out[i] = repository.ContentInfo{Type: rw.Type, ID: strconv.FormatUint(uint64(rw.ID), 10), Title: rw.Title, Slug: rw.Slug, UpdatedAt: rw.UpdatedAt, PublishedAt: rw.PublishedAt}
	}
	return out, nil
}

func (r *platformStatsRepository) PublishedContent(ctx context.Context, limit int) ([]repository.ContentInfo, error) {
	return r.published(ctx, "ORDER BY updated_at ASC", nil, limit)
}

func (r *platformStatsRepository) RecentlyPublished(ctx context.Context, since time.Time, limit int) ([]repository.ContentInfo, error) {
	return r.published(ctx, "WHERE published_at >= ? ORDER BY published_at DESC", []interface{}{since}, limit)
}

func (r *platformStatsRepository) UserActivityPage(ctx context.Context, page, size int) ([]repository.UserActivity, int64, error) {
	var total int64
	if err := r.read.WithContext(ctx).Raw("SELECT COUNT(*) FROM users WHERE deleted_at IS NULL").Scan(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []repository.UserActivity
	err := r.read.WithContext(ctx).Raw(`SELECT u.id, u.name, u.email, u.created_at, u.last_login,
		(SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id AND e.deleted_at IS NULL AND e.status = 'active') AS active_enrollments,
		(SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id AND e.deleted_at IS NULL AND e.completed_at IS NOT NULL) AS completed_enrollment
		FROM users u WHERE u.deleted_at IS NULL ORDER BY u.id DESC OFFSET ? LIMIT ?`, page*size, size).Scan(&rows).Error
	return rows, total, err
}
