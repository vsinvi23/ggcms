package postgres

import (
	"context"
	"encoding/json"
	"strconv"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type AIRepository interface {
	repository.AIUsageRepository
	repository.AIDraftRepository
	repository.AIConversationRepository
	repository.AIChunkRepository
	repository.AICatalogRepository
	repository.AIModerationRepository
}

type aiRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewAIRepository(write, read *gorm.DB) AIRepository {
	return &aiRepository{write: write, read: read}
}

func (r *aiRepository) RecordUsage(ctx context.Context, u *entity.AIUsage) error {
	return r.write.WithContext(ctx).Create(u).Error
}

func (r *aiRepository) CostSince(ctx context.Context, since time.Time) (int64, error) {
	var total int64
	err := r.write.WithContext(ctx).Model(&entity.AIUsage{}).Where("created_at >= ?", since).Select("COALESCE(SUM(cost_micro_usd), 0)").Scan(&total).Error
	return total, err
}

func (r *aiRepository) CountSince(ctx context.Context, userID uint, tasks []string, since time.Time) (int64, error) {
	var n int64
	err := r.write.WithContext(ctx).Model(&entity.AIUsage{}).
		Where("user_id = ? AND task IN ? AND created_at >= ? AND status = 'ok'", userID, tasks, since).Count(&n).Error
	return n, err
}

const usageAgg = "COUNT(*) AS calls, COALESCE(SUM(input_tokens),0) AS input_tokens, COALESCE(SUM(output_tokens),0) AS output_tokens, COALESCE(SUM(cost_micro_usd),0) AS cost_micro_usd, COALESCE(AVG(latency_ms),0)::bigint AS avg_latency_ms, COUNT(*) FILTER (WHERE status <> 'ok') AS errors"

func (r *aiRepository) UsageReport(ctx context.Context, from, to time.Time) (*repository.AIUsageReport, error) {
	db := r.read.WithContext(ctx).Model(&entity.AIUsage{}).Where("created_at >= ? AND created_at < ?", from, to)
	rep := &repository.AIUsageReport{ByTask: []repository.AIUsageRow{}, ByUser: []repository.AIUsageRow{}, ByDay: []repository.AIUsageRow{}}
	if err := db.Session(&gorm.Session{}).Select("'total' AS key, " + usageAgg).Scan(&rep.Total).Error; err != nil {
		return nil, err
	}
	if err := db.Session(&gorm.Session{}).Select("task AS key, " + usageAgg).Group("task").Order("cost_micro_usd DESC").Scan(&rep.ByTask).Error; err != nil {
		return nil, err
	}
	if err := db.Session(&gorm.Session{}).Select("COALESCE(user_id::text, 'system') AS key, " + usageAgg).Group("user_id").Order("cost_micro_usd DESC").Limit(20).Scan(&rep.ByUser).Error; err != nil {
		return nil, err
	}
	if err := db.Session(&gorm.Session{}).Select("to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS key, " + usageAgg).Group("1").Order("key ASC").Scan(&rep.ByDay).Error; err != nil {
		return nil, err
	}
	return rep, nil
}

func (r *aiRepository) CreateDraft(ctx context.Context, d *entity.AIDraft) error {
	return r.write.WithContext(ctx).Create(d).Error
}

func (r *aiRepository) GetDraft(ctx context.Context, id string) (*entity.AIDraft, error) {
	var d entity.AIDraft
	if err := r.write.WithContext(ctx).First(&d, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &d, nil
}

func (r *aiRepository) ListDrafts(ctx context.Context, contentType string, contentID uint, kind string) ([]*entity.AIDraft, error) {
	q := r.read.WithContext(ctx).Where("content_type = ? AND content_id = ?", contentType, contentID)
	if kind != "" {
		q = q.Where("kind = ?", kind)
	}
	var out []*entity.AIDraft
	return out, q.Order("created_at DESC").Limit(50).Find(&out).Error
}

func (r *aiRepository) SetDraftStatus(ctx context.Context, id, status string, reviewerID uint) error {
	return r.write.WithContext(ctx).Model(&entity.AIDraft{}).Where("id = ?", id).
		Updates(map[string]interface{}{"status": status, "reviewed_by_id": reviewerID, "updated_at": time.Now()}).Error
}

func (r *aiRepository) CreateConversation(ctx context.Context, c *entity.AIConversation) error {
	return r.write.WithContext(ctx).Create(c).Error
}

func (r *aiRepository) GetConversation(ctx context.Context, id string, userID uint) (*entity.AIConversation, error) {
	var c entity.AIConversation
	if err := r.write.WithContext(ctx).First(&c, "id = ? AND user_id = ?", id, userID).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *aiRepository) ListConversations(ctx context.Context, userID uint, limit int) ([]*entity.AIConversation, error) {
	var out []*entity.AIConversation
	return out, r.read.WithContext(ctx).Where("user_id = ?", userID).Order("updated_at DESC").Limit(limit).Find(&out).Error
}

func (r *aiRepository) DeleteConversation(ctx context.Context, id string, userID uint) (bool, error) {
	res := r.write.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).Delete(&entity.AIConversation{})
	return res.RowsAffected > 0, res.Error
}

func (r *aiRepository) AppendMessage(ctx context.Context, m *entity.AIMessage) error {
	return r.write.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(m).Error; err != nil {
			return err
		}
		return tx.Model(&entity.AIConversation{}).Where("id = ?", m.ConversationID).Update("updated_at", time.Now()).Error
	})
}

func (r *aiRepository) RecentMessages(ctx context.Context, conversationID string, limit int) ([]*entity.AIMessage, error) {
	var out []*entity.AIMessage
	err := r.write.WithContext(ctx).Raw(
		"SELECT * FROM (SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?) m ORDER BY id ASC",
		conversationID, limit).Scan(&out).Error
	return out, err
}

func (r *aiRepository) SetFeedback(ctx context.Context, messageID, userID uint, rating int, comment string) (bool, error) {
	res := r.write.WithContext(ctx).Exec(
		"UPDATE ai_messages SET rating = ?, feedback_comment = ? WHERE id = ? AND role = 'assistant' AND conversation_id IN (SELECT id FROM ai_conversations WHERE user_id = ?)",
		rating, comment, messageID, userID)
	return res.RowsAffected > 0, res.Error
}

const docsCTE = `
WITH RECURSIVE sec AS (
  SELECT id, course_id AS root FROM sections WHERE course_id IS NOT NULL AND deleted_at IS NULL
  UNION ALL
  SELECT s.id, sec.root FROM sections s JOIN sec ON s.parent_section_id = sec.id WHERE s.deleted_at IS NULL
), course_stamp AS (
  SELECT c.id, GREATEST(c.updated_at, COALESCE(MAX(l.updated_at), c.updated_at)) AS stamp
  FROM courses c
  LEFT JOIN sec ON sec.root = c.id
  LEFT JOIN lessons l ON l.section_id = sec.id AND l.deleted_at IS NULL
  WHERE c.status = 'PUBLISHED' AND c.deleted_at IS NULL
  GROUP BY c.id
), docs AS (
  SELECT 'article' AS content_type, id, updated_at AS stamp FROM articles WHERE status = 'PUBLISHED' AND deleted_at IS NULL
  UNION ALL
  SELECT 'course' AS content_type, id, stamp FROM course_stamp
)`

func (r *aiRepository) StaleContent(ctx context.Context) ([]repository.ChunkContentRef, error) {
	var out []repository.ChunkContentRef
	err := r.write.WithContext(ctx).Raw(docsCTE + `,
idx AS (SELECT content_type, content_id, MAX(source_stamp) AS stamp FROM content_chunks GROUP BY 1, 2)
SELECT d.content_type AS content_type, d.id AS content_id, d.stamp AS stamp
FROM docs d LEFT JOIN idx ON idx.content_type = d.content_type AND idx.content_id = d.id
WHERE idx.stamp IS NULL OR idx.stamp < d.stamp
ORDER BY d.stamp DESC LIMIT 500`).Scan(&out).Error
	return out, err
}

type chaptersLesson struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

type chaptersSection struct {
	Lessons       []chaptersLesson  `json:"lessons"`
	ChildSections []chaptersSection `json:"childSections"`
}

func flattenLessons(secs []chaptersSection) []repository.IndexLesson {
	var out []repository.IndexLesson
	for _, s := range secs {
		for _, l := range s.Lessons {
			out = append(out, repository.IndexLesson{Title: l.Title, Content: l.Content})
		}
		out = append(out, flattenLessons(s.ChildSections)...)
	}
	return out
}

func (r *aiRepository) LoadIndexDoc(ctx context.Context, contentType string, id uint) (*repository.IndexDoc, error) {
	db := r.write.WithContext(ctx)
	var stamp time.Time
	if err := db.Raw(docsCTE+" SELECT stamp FROM docs WHERE content_type = ? AND id = ?", contentType, id).Scan(&stamp).Error; err != nil || stamp.IsZero() {
		return nil, err
	}
	doc := &repository.IndexDoc{ContentType: contentType, ContentID: id, Stamp: stamp}
	if contentType == "article" {
		var a entity.Article
		if err := db.First(&a, id).Error; err != nil {
			return nil, err
		}
		doc.Title, doc.Body = a.Title, derefStr(a.Body)
		if a.HasPendingDraft {
			doc.Title, doc.Body = a.PublishedTitle, derefStr(a.PublishedBody)
		}
		return doc, nil
	}
	var c entity.Course
	if err := db.First(&c, id).Error; err != nil {
		return nil, err
	}
	doc.Title, doc.Body = c.Title, derefStr(c.Body)
	if c.HasPendingDraft {
		doc.Title, doc.Body = c.PublishedTitle, derefStr(c.PublishedBody)
		if c.PublishedChaptersSnapshot != nil {
			var secs []chaptersSection
			if err := json.Unmarshal([]byte(*c.PublishedChaptersSnapshot), &secs); err == nil {
				doc.Lessons = flattenLessons(secs)
				return doc, nil
			}
		}
	}
	var rows []struct {
		Title   string
		Content *string
	}
	err := db.Raw(`WITH RECURSIVE sec AS (
  SELECT id, course_id AS root FROM sections WHERE course_id IS NOT NULL AND deleted_at IS NULL
  UNION ALL
  SELECT s.id, sec.root FROM sections s JOIN sec ON s.parent_section_id = sec.id WHERE s.deleted_at IS NULL
)
SELECT l.title AS title, l.content AS content FROM lessons l
JOIN sec ON l.section_id = sec.id JOIN sections s ON s.id = sec.id
WHERE sec.root = ? AND l.deleted_at IS NULL ORDER BY s."order", l."order", l.id`, id).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		doc.Lessons = append(doc.Lessons, repository.IndexLesson{Title: row.Title, Content: derefStr(row.Content)})
	}
	return doc, nil
}

func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func (r *aiRepository) ReplaceChunks(ctx context.Context, contentType string, id uint, chunks []entity.ContentChunk) error {
	return r.write.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("content_type = ? AND content_id = ?", contentType, id).Delete(&entity.ContentChunk{}).Error; err != nil {
			return err
		}
		if len(chunks) == 0 {
			return nil
		}
		return tx.CreateInBatches(chunks, 100).Error
	})
}

func (r *aiRepository) PruneUnpublished(ctx context.Context) error {
	return r.write.WithContext(ctx).Exec(docsCTE + ` DELETE FROM content_chunks c
WHERE NOT EXISTS (SELECT 1 FROM docs d WHERE d.content_type = c.content_type AND d.id = c.content_id)`).Error
}

func (r *aiRepository) SearchChunks(ctx context.Context, tsQuery, contentType string, contentID uint, limit int) ([]entity.ContentChunk, error) {
	if tsQuery == "" {
		return nil, nil
	}
	var out []entity.ContentChunk
	err := r.read.WithContext(ctx).Raw(`SELECT * FROM content_chunks
WHERE content_type = ? AND content_id = ? AND ordinal >= 0 AND tsv @@ to_tsquery('english', ?)
ORDER BY ts_rank_cd(tsv, to_tsquery('english', ?)) DESC, ordinal ASC LIMIT ?`, contentType, contentID, tsQuery, tsQuery, limit).Scan(&out).Error
	return out, err
}

func (r *aiRepository) PublishedDoc(ctx context.Context, contentType string, id uint) (*repository.PublishedDoc, error) {
	table := "articles"
	if contentType == "course" {
		table = "courses"
	}
	var d repository.PublishedDoc
	res := r.read.WithContext(ctx).Raw("SELECT id AS content_id, public_id, slug, title FROM "+table+" WHERE id = ? AND status = 'PUBLISHED' AND deleted_at IS NULL", id).Scan(&d)
	if res.Error != nil || res.RowsAffected == 0 {
		return nil, res.Error
	}
	d.ContentType = contentType
	return &d, nil
}

func (r *aiRepository) taxa(ctx context.Context, query string) ([]repository.AITaxon, error) {
	var rows []struct {
		ID   uint
		Name string
	}
	if err := r.read.WithContext(ctx).Raw(query).Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]repository.AITaxon, len(rows))
	for i, row := range rows {
		out[i] = repository.AITaxon{ID: row.ID, Name: row.Name}
	}
	return out, nil
}

func (r *aiRepository) Tags(ctx context.Context) ([]repository.AITaxon, error) {
	return r.taxa(ctx, "SELECT id, name FROM tags ORDER BY name")
}

func (r *aiRepository) Topics(ctx context.Context) ([]repository.AITaxon, error) {
	return r.taxa(ctx, "SELECT id, name FROM topics WHERE status = 'ACTIVE' AND merged_into_topic_id IS NULL ORDER BY name")
}

func (r *aiRepository) Categories(ctx context.Context) ([]repository.AITaxon, error) {
	return r.taxa(ctx, "SELECT id, name FROM categories WHERE deleted_at IS NULL AND is_virtual = false ORDER BY name")
}

func (r *aiRepository) catalog(ctx context.Context, query string, limit int) ([]repository.AICatalogItem, error) {
	var rows []struct {
		ID          uint
		Title       string
		Description *string
	}
	if err := r.read.WithContext(ctx).Raw(query, limit).Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]repository.AICatalogItem, len(rows))
	for i, row := range rows {
		out[i] = repository.AICatalogItem{ID: row.ID, Title: row.Title, Description: derefStr(row.Description)}
	}
	return out, nil
}

func (r *aiRepository) PublishedCourses(ctx context.Context, limit int) ([]repository.AICatalogItem, error) {
	return r.catalog(ctx, "SELECT id, title, description FROM courses WHERE status = 'PUBLISHED' AND deleted_at IS NULL ORDER BY published_at DESC NULLS LAST LIMIT ?", limit)
}

func (r *aiRepository) LearningPaths(ctx context.Context, limit int) ([]repository.AICatalogItem, error) {
	return r.catalog(ctx, "SELECT id, title, description FROM learning_paths ORDER BY id DESC LIMIT ?", limit)
}

func (r *aiRepository) ContentExists(ctx context.Context, ref string) (bool, error) {
	id, _ := strconv.ParseUint(ref, 10, 64)
	var n int64
	err := r.read.WithContext(ctx).Raw(`SELECT
  (SELECT COUNT(*) FROM articles WHERE status = 'PUBLISHED' AND deleted_at IS NULL AND (slug = ? OR public_id = ? OR id = ?)) +
  (SELECT COUNT(*) FROM courses WHERE status = 'PUBLISHED' AND deleted_at IS NULL AND (slug = ? OR public_id = ? OR id = ?))`,
		ref, ref, id, ref, ref, id).Scan(&n).Error
	return n > 0, err
}

func (r *aiRepository) UpsertModeration(ctx context.Context, m *entity.AIModerationItem) error {
	return r.write.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "comment_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"reasons", "source", "status", "excerpt"}),
	}).Create(m).Error
}

func (r *aiRepository) HiddenCommentIDs(ctx context.Context, ids []string) (map[string]bool, error) {
	var found []string
	if err := r.read.WithContext(ctx).Model(&entity.AIModerationItem{}).
		Where("comment_id IN ? AND status IN ('pending_review', 'rejected')", ids).Pluck("comment_id", &found).Error; err != nil {
		return nil, err
	}
	out := make(map[string]bool, len(found))
	for _, id := range found {
		out[id] = true
	}
	return out, nil
}

func (r *aiRepository) ListModeration(ctx context.Context, status string, page, size int) ([]*entity.AIModerationItem, int64, error) {
	if size <= 0 || size > 100 {
		size = 20
	}
	if page < 0 {
		page = 0
	}
	q := r.read.WithContext(ctx).Model(&entity.AIModerationItem{}).Where("status = ?", status)
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var out []*entity.AIModerationItem
	err := q.Order("created_at DESC").Offset(page * size).Limit(size).Find(&out).Error
	return out, total, err
}

func (r *aiRepository) ResolveModeration(ctx context.Context, id uint, status string, reviewerID uint) (bool, error) {
	res := r.write.WithContext(ctx).Model(&entity.AIModerationItem{}).Where("id = ?", id).
		Updates(map[string]interface{}{"status": status, "reviewed_by_id": reviewerID, "reviewed_at": time.Now()})
	return res.RowsAffected > 0, res.Error
}
