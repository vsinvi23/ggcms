package postgres

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

type enrollmentRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewEnrollmentRepository(write, read *gorm.DB) repository.EnrollmentRepository {
	return &enrollmentRepository{write: write, read: read}
}

func (r *enrollmentRepository) Create(ctx context.Context, enrollment *entity.Enrollment) error {
	return r.write.WithContext(ctx).Create(enrollment).Error
}

func (r *enrollmentRepository) Update(ctx context.Context, enrollment *entity.Enrollment) error {
	return r.write.WithContext(ctx).Save(enrollment).Error
}

func (r *enrollmentRepository) FindByID(ctx context.Context, id uint) (*entity.Enrollment, error) {
	var enrollment entity.Enrollment
	err := r.read.WithContext(ctx).
		Preload("Course").
		Preload("CompletedLessons").
		First(&enrollment, id).Error
	if err != nil {
		return nil, fmt.Errorf("enrollment not found: %w", err)
	}
	return &enrollment, nil
}

func (r *enrollmentRepository) FindByUserAndCourse(ctx context.Context, userID, courseID uint) (*entity.Enrollment, error) {
	var enrollment entity.Enrollment
	err := r.read.WithContext(ctx).
		Preload("Course").
		Preload("CompletedLessons").
		Where("user_id = ? AND course_id = ?", userID, courseID).
		First(&enrollment).Error
	if err != nil {
		return nil, fmt.Errorf("enrollment not found: %w", err)
	}
	return &enrollment, nil
}

func (r *enrollmentRepository) FindByUserID(ctx context.Context, userID uint) ([]*entity.Enrollment, error) {
	var enrollments []*entity.Enrollment
	err := r.read.WithContext(ctx).
		Preload("Course").
		Preload("CompletedLessons").
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Find(&enrollments).Error
	return enrollments, err
}

func (r *enrollmentRepository) AddCompletedLesson(ctx context.Context, enrollmentID, lessonID uint) error {
	enrollment := &entity.Enrollment{}
	enrollment.ID = enrollmentID
	lesson := &entity.Lesson{}
	lesson.ID = lessonID
	return r.write.WithContext(ctx).Model(enrollment).Association("CompletedLessons").Append(lesson)
}
