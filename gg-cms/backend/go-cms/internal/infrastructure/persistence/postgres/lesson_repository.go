package postgres

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

type lessonRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewLessonRepository(write, read *gorm.DB) repository.LessonRepository {
	return &lessonRepository{write: write, read: read}
}

func (r *lessonRepository) Create(ctx context.Context, lesson *entity.Lesson) error {
	return r.write.WithContext(ctx).Create(lesson).Error
}

func (r *lessonRepository) Update(ctx context.Context, lesson *entity.Lesson) error {
	return r.write.WithContext(ctx).Save(lesson).Error
}

func (r *lessonRepository) Delete(ctx context.Context, id uint) error {
	return r.write.WithContext(ctx).Delete(&entity.Lesson{}, id).Error
}

func (r *lessonRepository) FindByID(ctx context.Context, id uint) (*entity.Lesson, error) {
	var lesson entity.Lesson
	err := r.read.WithContext(ctx).First(&lesson, id).Error
	if err != nil {
		return nil, fmt.Errorf("lesson not found: %w", err)
	}
	return &lesson, nil
}

func (r *lessonRepository) FindBySectionID(ctx context.Context, sectionID uint) ([]*entity.Lesson, error) {
	var lessons []*entity.Lesson
	err := r.read.WithContext(ctx).
		Where("section_id = ?", sectionID).
		Order(`"order" ASC`).
		Find(&lessons).Error
	return lessons, err
}
