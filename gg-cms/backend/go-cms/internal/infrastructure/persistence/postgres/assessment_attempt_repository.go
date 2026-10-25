package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

type assessmentAttemptRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewAssessmentAttemptRepository(write, read *gorm.DB) repository.AssessmentAttemptRepository {
	return &assessmentAttemptRepository{write: write, read: read}
}

func (r *assessmentAttemptRepository) Create(ctx context.Context, a *entity.AssessmentAttempt) error {
	return r.write.WithContext(ctx).Create(a).Error
}

func (r *assessmentAttemptRepository) FindByID(ctx context.Context, id uint) (*entity.AssessmentAttempt, error) {
	var a entity.AssessmentAttempt
	if err := r.write.WithContext(ctx).First(&a, id).Error; err != nil {
		return nil, fmt.Errorf("attempt not found: %w", err)
	}
	return &a, nil
}

func (r *assessmentAttemptRepository) FindOpen(ctx context.Context, userID, assessmentID uint) (*entity.AssessmentAttempt, error) {
	var a entity.AssessmentAttempt
	err := r.write.WithContext(ctx).
		Where("user_id = ? AND assessment_id = ? AND status = ?", userID, assessmentID, entity.AttemptStatusInProgress).
		First(&a).Error
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *assessmentAttemptRepository) ListByUser(ctx context.Context, userID, assessmentID uint, limit int) ([]*entity.AssessmentAttempt, error) {
	var out []*entity.AssessmentAttempt
	err := r.write.WithContext(ctx).
		Where("user_id = ? AND assessment_id = ?", userID, assessmentID).
		Order("started_at DESC").Limit(limit).Find(&out).Error
	return out, err
}

func (r *assessmentAttemptRepository) CountByUser(ctx context.Context, userID, assessmentID uint) (int64, error) {
	var n int64
	err := r.write.WithContext(ctx).Model(&entity.AssessmentAttempt{}).
		Where("user_id = ? AND assessment_id = ?", userID, assessmentID).Count(&n).Error
	return n, err
}

func (r *assessmentAttemptRepository) Submit(ctx context.Context, a *entity.AssessmentAttempt) (bool, error) {
	res := r.write.WithContext(ctx).Model(&entity.AssessmentAttempt{}).
		Where("id = ? AND status = ?", a.ID, entity.AttemptStatusInProgress).
		Updates(map[string]interface{}{
			"status":           entity.AttemptStatusSubmitted,
			"answers":          a.Answers,
			"score":            a.Score,
			"correct_count":    a.CorrectCount,
			"total_questions":  a.TotalQuestions,
			"pass_mark":        a.PassMark,
			"passed":           a.Passed,
			"submitted_at":     a.SubmittedAt,
			"duration_seconds": a.DurationSeconds,
		})
	return res.RowsAffected > 0, res.Error
}

func (r *assessmentAttemptRepository) BestScore(ctx context.Context, userID, assessmentID uint) (*float64, bool, error) {
	var row struct {
		Best   sql.NullFloat64
		Passed sql.NullBool
	}
	err := r.write.WithContext(ctx).Model(&entity.AssessmentAttempt{}).
		Select("MAX(score) AS best, BOOL_OR(passed) AS passed").
		Where("user_id = ? AND assessment_id = ? AND status = ?", userID, assessmentID, entity.AttemptStatusSubmitted).
		Scan(&row).Error
	if err != nil {
		return nil, false, err
	}
	var best *float64
	if row.Best.Valid {
		v := row.Best.Float64
		best = &v
	}
	return best, row.Passed.Valid && row.Passed.Bool, nil
}

func (r *assessmentAttemptRepository) CoursesRequiring(ctx context.Context, assessmentID uint) ([]uint, error) {
	var ids []uint
	err := r.read.WithContext(ctx).Model(&entity.Course{}).
		Where("assessment_id = ? AND require_assessment_pass = true", assessmentID).Pluck("id", &ids).Error
	return ids, err
}

func (r *assessmentAttemptRepository) FindAssessment(ctx context.Context, id uint) (*entity.Course, error) {
	var c entity.Course
	err := r.read.WithContext(ctx).
		Select("id", "title", "status", "course_type", "interactive_metadata").
		First(&c, id).Error
	if err != nil {
		return nil, fmt.Errorf("assessment not found: %w", err)
	}
	return &c, nil
}

func (r *assessmentAttemptRepository) SetCourseRequirement(ctx context.Context, courseID uint, assessmentID *uint, required bool) error {
	res := r.write.WithContext(ctx).Model(&entity.Course{}).Where("id = ?", courseID).
		Updates(map[string]interface{}{"assessment_id": assessmentID, "require_assessment_pass": required})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
