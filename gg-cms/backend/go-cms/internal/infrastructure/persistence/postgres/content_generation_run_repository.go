package postgres

import (
	"context"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

type contentGenerationRunRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewContentGenerationRunRepository(write, read *gorm.DB) repository.ContentGenerationRunRepository {
	return &contentGenerationRunRepository{write: write, read: read}
}

func (r *contentGenerationRunRepository) Create(ctx context.Context, run *entity.ContentGenerationRun) error {
	return r.write.WithContext(ctx).Create(run).Error
}

func (r *contentGenerationRunRepository) FindByContent(ctx context.Context, contentID uint, contentType string) ([]*entity.ContentGenerationRun, error) {
	var runs []*entity.ContentGenerationRun
	err := r.read.WithContext(ctx).
		Where("content_id = ? AND content_type = ?", contentID, contentType).
		Order("created_at DESC").
		Find(&runs).Error
	return runs, err
}
