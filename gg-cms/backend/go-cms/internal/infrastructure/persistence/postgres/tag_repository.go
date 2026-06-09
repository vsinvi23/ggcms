package postgres

import (
	"context"
	"fmt"
	"strings"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

type tagRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewTagRepository(write, read *gorm.DB) repository.TagRepository {
	return &tagRepository{write: write, read: read}
}

func (r *tagRepository) Create(ctx context.Context, tag *entity.Tag) error {
	tag.Name = strings.ToLower(strings.TrimSpace(tag.Name))
	return r.write.WithContext(ctx).Create(tag).Error
}

func (r *tagRepository) FindAll(ctx context.Context) ([]*entity.Tag, error) {
	var tags []*entity.Tag
	err := r.read.WithContext(ctx).Order("name ASC").Find(&tags).Error
	return tags, err
}

func (r *tagRepository) FindByID(ctx context.Context, id uint) (*entity.Tag, error) {
	var tag entity.Tag
	err := r.read.WithContext(ctx).First(&tag, id).Error
	if err != nil {
		return nil, fmt.Errorf("tag not found: %w", err)
	}
	return &tag, nil
}

func (r *tagRepository) FindByName(ctx context.Context, name string) (*entity.Tag, error) {
	var tag entity.Tag
	err := r.read.WithContext(ctx).Where("name = ?", strings.ToLower(name)).First(&tag).Error
	if err != nil {
		return nil, err
	}
	return &tag, nil
}

func (r *tagRepository) Delete(ctx context.Context, id uint) error {
	return r.write.WithContext(ctx).Delete(&entity.Tag{}, id).Error
}

func (r *tagRepository) SetCategoryTags(ctx context.Context, categoryID uint, tagIDs []uint) error {
	cat := &entity.Category{}
	cat.ID = categoryID

	tags := make([]entity.Tag, len(tagIDs))
	for i, id := range tagIDs {
		tags[i].ID = id
	}

	// Replace all associations
	return r.write.WithContext(ctx).Model(cat).Association("Tags").Replace(tags)
}

func (r *tagRepository) GetCategoryTags(ctx context.Context, categoryID uint) ([]*entity.Tag, error) {
	cat := &entity.Category{}
	cat.ID = categoryID

	var tags []*entity.Tag
	err := r.read.WithContext(ctx).Model(cat).Association("Tags").Find(&tags)
	return tags, err
}
