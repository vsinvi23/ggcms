package postgres

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

type sectionRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewSectionRepository(write, read *gorm.DB) repository.SectionRepository {
	return &sectionRepository{write: write, read: read}
}

func (r *sectionRepository) Create(ctx context.Context, section *entity.Section) error {
	return r.write.WithContext(ctx).Create(section).Error
}

func (r *sectionRepository) Update(ctx context.Context, section *entity.Section) error {
	return r.write.WithContext(ctx).Save(section).Error
}

func (r *sectionRepository) Delete(ctx context.Context, id uint) error {
	return r.write.WithContext(ctx).Delete(&entity.Section{}, id).Error
}

func (r *sectionRepository) FindByID(ctx context.Context, id uint) (*entity.Section, error) {
	var section entity.Section
	err := r.read.WithContext(ctx).
		Preload("ChildSections").
		Preload("Lessons", func(db *gorm.DB) *gorm.DB { return db.Order(`"order" ASC`) }).
		First(&section, id).Error
	if err != nil {
		return nil, fmt.Errorf("section not found: %w", err)
	}
	return &section, nil
}

func (r *sectionRepository) FindByCourseID(ctx context.Context, courseID uint) ([]*entity.Section, error) {
	var sections []*entity.Section
	err := r.read.WithContext(ctx).
		Where("course_id = ? AND parent_section_id IS NULL", courseID).
		Preload("ChildSections", func(db *gorm.DB) *gorm.DB { return db.Order(`"order" ASC`) }).
		Preload("ChildSections.Lessons", func(db *gorm.DB) *gorm.DB { return db.Order(`"order" ASC`) }).
		Preload("Lessons", func(db *gorm.DB) *gorm.DB { return db.Order(`"order" ASC`) }).
		Order(`"order" ASC`).
		Find(&sections).Error
	return sections, err
}
