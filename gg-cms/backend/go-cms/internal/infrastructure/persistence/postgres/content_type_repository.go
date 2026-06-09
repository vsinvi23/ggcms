package postgres

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

type contentTypeRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewContentTypeRepository(write, read *gorm.DB) repository.ContentTypeRepository {
	return &contentTypeRepository{write: write, read: read}
}

func (r *contentTypeRepository) Create(ctx context.Context, ct *entity.ContentType) error {
	return r.write.WithContext(ctx).Create(ct).Error
}

func (r *contentTypeRepository) Update(ctx context.Context, ct *entity.ContentType) error {
	return r.write.WithContext(ctx).Save(ct).Error
}

func (r *contentTypeRepository) Delete(ctx context.Context, id uint) error {
	return r.write.WithContext(ctx).Delete(&entity.ContentType{}, id).Error
}

func (r *contentTypeRepository) FindByID(ctx context.Context, id uint) (*entity.ContentType, error) {
	var ct entity.ContentType
	if err := r.read.WithContext(ctx).First(&ct, id).Error; err != nil {
		return nil, fmt.Errorf("content type not found: %w", err)
	}
	return &ct, nil
}

func (r *contentTypeRepository) FindByKind(ctx context.Context, kind string) ([]*entity.ContentType, error) {
	var types []*entity.ContentType
	err := r.read.WithContext(ctx).
		Where("kind = ?", kind).
		Order("sort_order ASC, id ASC").
		Find(&types).Error
	return types, err
}
