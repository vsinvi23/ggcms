package enrollment

import (
	"context"
	"fmt"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type Service interface {
	Enroll(ctx context.Context, userID, courseID uint) (*entity.Enrollment, error)
	UpdateProgress(ctx context.Context, enrollmentID uint, progress float64, status *entity.EnrollmentStatus, completedLessons []uint) (*entity.Enrollment, error)
	GetByUserAndCourse(ctx context.Context, userID, courseID uint) (*entity.Enrollment, error)
	GetByUserID(ctx context.Context, userID uint) ([]*entity.Enrollment, error)
	GetByID(ctx context.Context, id uint) (*entity.Enrollment, error)
}

type service struct {
	enrollmentRepo repository.EnrollmentRepository
}

func NewService(enrollmentRepo repository.EnrollmentRepository) Service {
	return &service{enrollmentRepo: enrollmentRepo}
}

func (s *service) Enroll(ctx context.Context, userID, courseID uint) (*entity.Enrollment, error) {
	existing, _ := s.enrollmentRepo.FindByUserAndCourse(ctx, userID, courseID)
	if existing != nil {
		if existing.Status == entity.EnrollmentStatusDropped {
			// Re-enroll: reactivate
			now := time.Now()
			existing.Status = entity.EnrollmentStatusActive
			existing.EnrolledAt = &now
			existing.Progress = 0
			existing.CompletedAt = nil
			if err := s.enrollmentRepo.Update(ctx, existing); err != nil {
				return nil, fmt.Errorf("failed to re-enroll: %w", err)
			}
			return existing, nil
		}
		return existing, nil // already enrolled
	}

	now := time.Now()
	enrollment := &entity.Enrollment{
		UserID:     userID,
		CourseID:   courseID,
		Status:     entity.EnrollmentStatusActive,
		Progress:   0,
		EnrolledAt: &now,
	}
	if err := s.enrollmentRepo.Create(ctx, enrollment); err != nil {
		return nil, fmt.Errorf("failed to enroll: %w", err)
	}
	return enrollment, nil
}

func (s *service) UpdateProgress(ctx context.Context, enrollmentID uint, progress float64, status *entity.EnrollmentStatus, completedLessons []uint) (*entity.Enrollment, error) {
	enrollment, err := s.enrollmentRepo.FindByID(ctx, enrollmentID)
	if err != nil {
		return nil, fmt.Errorf("enrollment not found: %w", err)
	}

	enrollment.Progress = progress
	if status != nil {
		enrollment.Status = *status
		if *status == entity.EnrollmentStatusCompleted {
			now := time.Now()
			enrollment.CompletedAt = &now
		}
	}
	now := time.Now()
	enrollment.LastAccessedAt = &now

	if err := s.enrollmentRepo.Update(ctx, enrollment); err != nil {
		return nil, fmt.Errorf("failed to update enrollment: %w", err)
	}

	// Add completed lessons
	for _, lessonID := range completedLessons {
		s.enrollmentRepo.AddCompletedLesson(ctx, enrollmentID, lessonID)
	}

	return enrollment, nil
}

func (s *service) GetByUserAndCourse(ctx context.Context, userID, courseID uint) (*entity.Enrollment, error) {
	return s.enrollmentRepo.FindByUserAndCourse(ctx, userID, courseID)
}

func (s *service) GetByUserID(ctx context.Context, userID uint) ([]*entity.Enrollment, error) {
	return s.enrollmentRepo.FindByUserID(ctx, userID)
}

func (s *service) GetByID(ctx context.Context, id uint) (*entity.Enrollment, error) {
	return s.enrollmentRepo.FindByID(ctx, id)
}
