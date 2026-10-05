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

// ReplaceCourseStructure atomically replaces a course's sections and lessons: every existing
// section (and child section) with its lessons is soft-deleted and the supplied tree is created,
// all in one transaction. On any error nothing changes, so a failed import never leaves a course
// with a half-built or duplicated structure.
func (r *sectionRepository) ReplaceCourseStructure(ctx context.Context, courseID uint, sections []*entity.Section) error {
	return r.write.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var ids []uint
		if err := tx.Model(&entity.Section{}).Where("course_id = ?", courseID).Pluck("id", &ids).Error; err != nil {
			return fmt.Errorf("list existing sections: %w", err)
		}
		if len(ids) > 0 {
			var childIDs []uint
			if err := tx.Model(&entity.Section{}).Where("parent_section_id IN ?", ids).Pluck("id", &childIDs).Error; err != nil {
				return fmt.Errorf("list existing child sections: %w", err)
			}
			ids = append(ids, childIDs...)
			if err := tx.Where("section_id IN ?", ids).Delete(&entity.Lesson{}).Error; err != nil {
				return fmt.Errorf("delete existing lessons: %w", err)
			}
			if err := tx.Where("id IN ?", ids).Delete(&entity.Section{}).Error; err != nil {
				return fmt.Errorf("delete existing sections: %w", err)
			}
		}
		for _, s := range sections {
			s.CourseID = &courseID
			if err := tx.Create(s).Error; err != nil {
				return fmt.Errorf("create section %q: %w", s.Title, err)
			}
		}
		return nil
	})
}
