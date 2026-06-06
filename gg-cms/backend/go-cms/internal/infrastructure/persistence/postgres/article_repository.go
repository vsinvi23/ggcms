package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/pkg/slugify"
	"gorm.io/gorm"
)

type articleRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewArticleRepository(write, read *gorm.DB) repository.ArticleRepository {
	return &articleRepository{write: write, read: read}
}

func (r *articleRepository) Create(ctx context.Context, article *entity.Article) error {
	if article.PublicID == "" {
		article.PublicID = uuid.New().String()
	}
	if article.Slug == "" {
		article.Slug = r.uniqueSlug(ctx, slugify.Slug(article.Title), 0)
	}
	return r.write.WithContext(ctx).Create(article).Error
}

func (r *articleRepository) Update(ctx context.Context, article *entity.Article) error {
	if article.Slug == "" {
		article.Slug = r.uniqueSlug(ctx, slugify.Slug(article.Title), article.ID)
	}
	return r.write.WithContext(ctx).Save(article).Error
}

// uniqueSlug returns a slug that does not already exist in the articles table,
// appending "-2", "-3", etc. when necessary. excludeID skips the current row
// (for updates — the slug may already belong to this article).
func (r *articleRepository) uniqueSlug(ctx context.Context, base string, excludeID uint) string {
	candidate := base
	for i := 2; ; i++ {
		var count int64
		q := r.read.WithContext(ctx).Model(&entity.Article{}).Where("slug = ?", candidate)
		if excludeID > 0 {
			q = q.Where("id != ?", excludeID)
		}
		q.Count(&count)
		if count == 0 {
			return candidate
		}
		candidate = fmt.Sprintf("%s-%d", base, i)
	}
}

func (r *articleRepository) Delete(ctx context.Context, id uint) error {
	return r.write.WithContext(ctx).Delete(&entity.Article{}, id).Error
}

func (r *articleRepository) FindByID(ctx context.Context, id uint) (*entity.Article, error) {
	var article entity.Article
	err := r.read.WithContext(ctx).
		Preload("Category").
		Preload("CreatedBy").
		Preload("Reviewer").
		Preload("Attachments").
		First(&article, id).Error
	if err != nil {
		return nil, fmt.Errorf("article not found: %w", err)
	}
	return &article, nil
}

func (r *articleRepository) FindByPublicID(ctx context.Context, publicID string) (*entity.Article, error) {
	var article entity.Article
	err := r.read.WithContext(ctx).
		Preload("Category").
		Preload("CreatedBy").
		Preload("Reviewer").
		Preload("Attachments").
		Where("public_id = ?", publicID).
		First(&article).Error
	if err != nil {
		return nil, fmt.Errorf("article not found: %w", err)
	}
	return &article, nil
}

func (r *articleRepository) FindBySlug(ctx context.Context, slug string) (*entity.Article, error) {
	var article entity.Article
	err := r.read.WithContext(ctx).
		Preload("Category").
		Preload("CreatedBy").
		Preload("Reviewer").
		Preload("Attachments").
		Where("slug = ?", slug).
		First(&article).Error
	if err != nil {
		return nil, fmt.Errorf("article not found: %w", err)
	}
	return &article, nil
}

func (r *articleRepository) FindAll(ctx context.Context, filter repository.ArticleFilter, page, size int) ([]*entity.Article, int64, error) {
	var articles []*entity.Article
	var total int64

	db := r.read.WithContext(ctx).Model(&entity.Article{})
	db = applyArticleFilter(db, filter)

	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := db.Preload("Category").Preload("CreatedBy").Preload("Reviewer").Preload("Attachments").
		Offset(page * size).Limit(size).Order("created_at DESC").Find(&articles).Error
	return articles, total, err
}

func (r *articleRepository) FindPublished(ctx context.Context, page, size int) ([]*entity.Article, int64, error) {
	var articles []*entity.Article
	var total int64

	db := r.read.WithContext(ctx).Model(&entity.Article{}).Where("status = ?", entity.CMSStatusPublished)
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := db.Preload("Category").Preload("Attachments").
		Offset(page * size).Limit(size).Order("published_at DESC").Find(&articles).Error
	return articles, total, err
}

func (r *articleRepository) FindPublishedByCategorySlug(ctx context.Context, slug string, page, size int) ([]*entity.Article, int64, error) {
	var articles []*entity.Article
	var total int64

	db := r.read.WithContext(ctx).Model(&entity.Article{}).
		Joins("JOIN categories ON categories.id = articles.category_id").
		Where("articles.status = ? AND categories.slug = ?", entity.CMSStatusPublished, slug)

	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := db.Preload("Category").Preload("Attachments").
		Offset(page * size).Limit(size).Order("articles.published_at DESC").Find(&articles).Error
	return articles, total, err
}

func (r *articleRepository) UpdateStatus(ctx context.Context, id uint, status entity.CMSStatus, reviewerID *uint, comment *string, publishedAt *time.Time) error {
	updates := map[string]interface{}{"status": status}
	if reviewerID != nil {
		updates["reviewer_id"] = reviewerID
	}
	if comment != nil {
		updates["reviewer_comment"] = comment
	}
	if publishedAt != nil {
		updates["published_at"] = publishedAt
	}
	return r.write.WithContext(ctx).Model(&entity.Article{}).Where("id = ?", id).Updates(updates).Error
}

func (r *articleRepository) SaveSnapshot(ctx context.Context, id uint, a *entity.Article) error {
	v := a.Version
	return r.write.WithContext(ctx).Model(&entity.Article{}).Where("id = ?", id).
		Updates(map[string]interface{}{
			"has_pending_draft":    true,
			"published_version":    v,
			"published_title":      a.Title,
			"published_description": a.Description,
			"published_body":       a.Body,
		}).Error
}

func (r *articleRepository) ClearSnapshot(ctx context.Context, id uint) error {
	return r.write.WithContext(ctx).Model(&entity.Article{}).Where("id = ?", id).
		Updates(map[string]interface{}{
			"has_pending_draft":    false,
			"published_version":    nil,
			"published_title":      "",
			"published_description": nil,
			"published_body":       nil,
		}).Error
}

func (r *articleRepository) SaveReviewBaseline(ctx context.Context, id uint, title string, description *string, body *string) error {
	return r.write.WithContext(ctx).Model(&entity.Article{}).Where("id = ?", id).
		Updates(map[string]interface{}{
			"review_baseline_title":       title,
			"review_baseline_description": description,
			"review_baseline_body":        body,
		}).Error
}

func (r *articleRepository) SetReviewer(ctx context.Context, id uint, reviewerID *uint) error {
	return r.write.WithContext(ctx).Model(&entity.Article{}).Where("id = ?", id).
		Update("reviewer_id", reviewerID).Error
}

func applyArticleFilter(db *gorm.DB, f repository.ArticleFilter) *gorm.DB {
	if f.AvailableForUserID != nil {
		// Return REVIEW items with no reviewer assigned whose category is in a reviewer group
		// that the given user belongs to.
		db = db.Where(
			`status = 'REVIEW' AND reviewer_id IS NULL
			 AND category_id IN (
			     SELECT crg.category_id FROM category_reviewer_groups crg
			     JOIN user_groups ug ON crg.group_id = ug.group_id
			     WHERE ug.user_id = ?
			 )`, *f.AvailableForUserID,
		)
		return db
	}
	if f.PubliclyVisible {
		// Return items that are published OR have a pending draft (old published version still visible).
		db = db.Where("status = ? OR has_pending_draft = true", entity.CMSStatusPublished)
	} else if f.Status != nil {
		db = db.Where("status = ?", *f.Status)
	}
	if f.CreatedBy != nil {
		db = db.Where("created_by_id = ?", *f.CreatedBy)
	}
	if f.ReviewerID != nil {
		db = db.Where("reviewer_id = ?", *f.ReviewerID)
	}
	if f.CategoryID != nil {
		db = db.Where("category_id = ?", *f.CategoryID)
	}
	if f.Search != nil && *f.Search != "" {
		q := "%" + *f.Search + "%"
		db = db.Where("title ILIKE ? OR description ILIKE ? OR body ILIKE ?", q, q, q)
	}
	return db
}
