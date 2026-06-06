package postgres

import (
	"context"

	"github.com/serenya/go-cms/internal/domain/entity"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type contentReviewRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewContentReviewRepository(write, read *gorm.DB) *contentReviewRepository {
	return &contentReviewRepository{write: write, read: read}
}

func (r *contentReviewRepository) Upsert(ctx context.Context, contentID uint, contentType string, reviewerID uint) error {
	row := entity.ContentReview{
		ContentID:   contentID,
		ContentType: contentType,
		ReviewerID:  reviewerID,
	}
	return r.write.WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&row).Error
}

func (r *contentReviewRepository) Count(ctx context.Context, contentID uint, contentType string) (int, error) {
	var count int64
	err := r.read.WithContext(ctx).Model(&entity.ContentReview{}).
		Where("content_id = ? AND content_type = ?", contentID, contentType).
		Count(&count).Error
	return int(count), err
}

func (r *contentReviewRepository) CountBatch(ctx context.Context, contentType string, contentIDs []uint) (map[uint]int, error) {
	type row struct {
		ContentID uint
		Count     int
	}
	var rows []row
	err := r.read.WithContext(ctx).
		Model(&entity.ContentReview{}).
		Select("content_id, COUNT(*) as count").
		Where("content_type = ? AND content_id IN ?", contentType, contentIDs).
		Group("content_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	result := make(map[uint]int, len(rows))
	for _, r := range rows {
		result[r.ContentID] = r.Count
	}
	return result, nil
}

func (r *contentReviewRepository) DeleteByContent(ctx context.Context, contentID uint, contentType string) error {
	return r.write.WithContext(ctx).
		Where("content_id = ? AND content_type = ?", contentID, contentType).
		Delete(&entity.ContentReview{}).Error
}
