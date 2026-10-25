package repository

import (
	"context"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
)

type EnrollmentProgressRepository interface {
	EnrollmentRepository
	CourseLessons(ctx context.Context, courseID uint) ([]entity.Lesson, error)
	CompletedLessonIDs(ctx context.Context, enrollmentID uint) ([]uint, error)
	AddCompletedLessons(ctx context.Context, enrollmentID uint, lessonIDs []uint) (added []uint, err error)
	UpdateProgressFields(ctx context.Context, enrollmentID uint, progress float64, lastLessonID *uint, accessedAt time.Time) error
	MarkCompleted(ctx context.Context, enrollmentID uint, progress float64, at time.Time) (bool, error)
	SetStatus(ctx context.Context, enrollmentID uint, status entity.EnrollmentStatus) error
	FindByUserAndCourseIDs(ctx context.Context, userID uint, courseIDs []uint) ([]*entity.Enrollment, error)
	FindCourseMeta(ctx context.Context, courseID uint) (*entity.Course, error)
}

type AssessmentAttemptRepository interface {
	Create(ctx context.Context, attempt *entity.AssessmentAttempt) error
	FindByID(ctx context.Context, id uint) (*entity.AssessmentAttempt, error)
	FindOpen(ctx context.Context, userID, assessmentID uint) (*entity.AssessmentAttempt, error)
	ListByUser(ctx context.Context, userID, assessmentID uint, limit int) ([]*entity.AssessmentAttempt, error)
	CountByUser(ctx context.Context, userID, assessmentID uint) (int64, error)
	Submit(ctx context.Context, attempt *entity.AssessmentAttempt) (bool, error)
	BestScore(ctx context.Context, userID, assessmentID uint) (best *float64, passed bool, err error)
	CoursesRequiring(ctx context.Context, assessmentID uint) ([]uint, error)
	FindAssessment(ctx context.Context, id uint) (*entity.Course, error)
	SetCourseRequirement(ctx context.Context, courseID uint, assessmentID *uint, required bool) error
}

type CertificateRepository interface {
	CreateIfAbsent(ctx context.Context, cert *entity.Certificate) (created bool, existing *entity.Certificate, err error)
	FindByCode(ctx context.Context, code string) (*entity.Certificate, error)
	FindByUserAndCourse(ctx context.Context, userID, courseID uint) (*entity.Certificate, error)
	ListByUser(ctx context.Context, userID uint) ([]*entity.Certificate, error)
	Revoke(ctx context.Context, code string, byUserID uint, reason string, at time.Time) (bool, error)
}
