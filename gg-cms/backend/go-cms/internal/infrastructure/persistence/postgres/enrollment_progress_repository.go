package postgres

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

type enrollmentProgressRepository struct {
	*enrollmentRepository
}

func NewEnrollmentProgressRepository(write, read *gorm.DB) repository.EnrollmentProgressRepository {
	return &enrollmentProgressRepository{enrollmentRepository: &enrollmentRepository{write: write, read: read}}
}

func (r *enrollmentProgressRepository) CourseLessons(ctx context.Context, courseID uint) ([]entity.Lesson, error) {
	var lessons []entity.Lesson
	err := r.read.WithContext(ctx).
		Table("lessons AS l").
		Select("l.*").
		Joins("JOIN sections s ON s.id = l.section_id AND s.deleted_at IS NULL").
		Joins("LEFT JOIN sections p ON p.id = s.parent_section_id AND p.deleted_at IS NULL").
		Where("l.deleted_at IS NULL AND (s.course_id = ? OR p.course_id = ?)", courseID, courseID).
		Order(`COALESCE(p."order", s."order"), COALESCE(p.id, s.id), (s.parent_section_id IS NOT NULL), s."order", s.id, l."order", l.id`).
		Scan(&lessons).Error
	return lessons, err
}

func (r *enrollmentProgressRepository) CompletedLessonIDs(ctx context.Context, enrollmentID uint) ([]uint, error) {
	var ids []uint
	err := r.write.WithContext(ctx).Table("enrollment_lessons").Where("enrollment_id = ?", enrollmentID).Pluck("lesson_id", &ids).Error
	return ids, err
}

func (r *enrollmentProgressRepository) AddCompletedLessons(ctx context.Context, enrollmentID uint, lessonIDs []uint) ([]uint, error) {
	if len(lessonIDs) == 0 {
		return nil, nil
	}
	placeholders := make([]string, len(lessonIDs))
	args := make([]interface{}, 0, len(lessonIDs)*2)
	for i, id := range lessonIDs {
		placeholders[i] = "(?, ?)"
		args = append(args, enrollmentID, id)
	}
	var added []uint
	q := fmt.Sprintf("INSERT INTO enrollment_lessons (enrollment_id, lesson_id) VALUES %s ON CONFLICT DO NOTHING RETURNING lesson_id", strings.Join(placeholders, ","))
	if err := r.write.WithContext(ctx).Raw(q, args...).Scan(&added).Error; err != nil {
		return nil, err
	}
	return added, nil
}

func (r *enrollmentProgressRepository) UpdateProgressFields(ctx context.Context, enrollmentID uint, progress float64, lastLessonID *uint, accessedAt time.Time) error {
	updates := map[string]interface{}{"progress": progress}
	if !accessedAt.IsZero() {
		updates["last_accessed_at"] = accessedAt
	}
	if lastLessonID != nil {
		updates["last_lesson_id"] = *lastLessonID
	}
	return r.write.WithContext(ctx).Model(&entity.Enrollment{}).Where("id = ?", enrollmentID).Updates(updates).Error
}

func (r *enrollmentProgressRepository) MarkCompleted(ctx context.Context, enrollmentID uint, progress float64, at time.Time) (bool, error) {
	res := r.write.WithContext(ctx).Model(&entity.Enrollment{}).
		Where("id = ? AND completed_at IS NULL", enrollmentID).
		Updates(map[string]interface{}{"status": entity.EnrollmentStatusCompleted, "progress": progress, "completed_at": at})
	return res.RowsAffected > 0, res.Error
}

func (r *enrollmentProgressRepository) SetStatus(ctx context.Context, enrollmentID uint, status entity.EnrollmentStatus) error {
	return r.write.WithContext(ctx).Model(&entity.Enrollment{}).Where("id = ?", enrollmentID).Update("status", status).Error
}

func (r *enrollmentProgressRepository) FindByUserAndCourseIDs(ctx context.Context, userID uint, courseIDs []uint) ([]*entity.Enrollment, error) {
	var out []*entity.Enrollment
	if len(courseIDs) == 0 {
		return out, nil
	}
	err := r.read.WithContext(ctx).Where("user_id = ? AND course_id IN ?", userID, courseIDs).Find(&out).Error
	return out, err
}

func (r *enrollmentProgressRepository) FindCourseMeta(ctx context.Context, courseID uint) (*entity.Course, error) {
	var c entity.Course
	err := r.read.WithContext(ctx).
		Select("id", "title", "status", "course_type", "assessment_id", "require_assessment_pass").
		First(&c, courseID).Error
	if err != nil {
		return nil, fmt.Errorf("course not found: %w", err)
	}
	return &c, nil
}
