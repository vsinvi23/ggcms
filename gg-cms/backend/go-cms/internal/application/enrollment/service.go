package enrollment

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/serenya/go-cms/internal/application/learnevents"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

const (
	MaxSyncCourses          = 50
	MaxSyncLessonsPerCourse = 1000
	MaxSyncTotalLessons     = 5000
)

var (
	ErrCourseNotFound    = errors.New("course not found")
	ErrNotEnrolled       = errors.New("not enrolled in this course")
	ErrLessonNotInCourse = errors.New("lesson does not belong to this course")
	ErrInvalidStatus     = errors.New("invalid enrollment status")
	ErrSyncTooLarge      = errors.New("sync batch too large")
	ErrPathNotFound      = errors.New("learning path not found")
)

type CertificateIssuer interface {
	Issue(ctx context.Context, userID, courseID, enrollmentID uint, score *float64) error
}

type AttemptChecker interface {
	BestScore(ctx context.Context, userID, assessmentID uint) (best *float64, passed bool, err error)
}

type Deps struct {
	Attempts     AttemptChecker
	Certificates CertificateIssuer
	Paths        repository.LearningPathRepository
	Tracker      learnevents.Tracker
	Notifier     learnevents.Notifier
}

type UpdateRequest struct {
	Status           *entity.EnrollmentStatus
	CompletedLessons []uint
	LastLessonID     *uint
}

type Resume struct {
	EnrollmentID       uint
	CourseID           uint
	Status             entity.EnrollmentStatus
	Progress           float64
	TotalLessons       int
	CompletedCount     int
	CompletedLessonIDs []uint
	LastLessonID       *uint
	NextLesson         *entity.Lesson
	AwaitingAssessment bool
	AssessmentID       *uint
}

type SyncItem struct {
	CourseID           uint
	CompletedLessonIDs []uint
}

type SyncResult struct {
	CourseID uint
	Accepted int
	Rejected int
	Progress float64
	Status   string
	Error    string
}

type PathCourseProgress struct {
	CourseID    uint
	Title       string
	SortOrder   int
	Enrolled    bool
	Status      string
	Progress    float64
	CompletedAt *time.Time
}

type PathProgress struct {
	PathID           uint
	Title            string
	TotalCourses     int
	CompletedCourses int
	Progress         float64
	NextCourseID     *uint
	Courses          []PathCourseProgress
}

type Service interface {
	Enroll(ctx context.Context, userID, courseID uint) (*entity.Enrollment, error)
	UpdateProgress(ctx context.Context, enrollmentID uint, req UpdateRequest) (*entity.Enrollment, error)
	GetByUserAndCourse(ctx context.Context, userID, courseID uint) (*entity.Enrollment, error)
	GetByUserID(ctx context.Context, userID uint) ([]*entity.Enrollment, error)
	GetByID(ctx context.Context, id uint) (*entity.Enrollment, error)
	GetResume(ctx context.Context, userID, courseID uint) (*Resume, error)
	SyncLocal(ctx context.Context, userID uint, items []SyncItem) ([]SyncResult, error)
	Recheck(ctx context.Context, userID, courseID uint) error
	GetPathProgress(ctx context.Context, userID uint, idOrSlug string) (*PathProgress, error)
}

type service struct {
	repo repository.EnrollmentProgressRepository
	deps Deps
}

func NewService(repo repository.EnrollmentProgressRepository, deps Deps) Service {
	if deps.Tracker == nil {
		deps.Tracker = learnevents.NopTracker{}
	}
	if deps.Notifier == nil {
		deps.Notifier = learnevents.NopNotifier{}
	}
	return &service{repo: repo, deps: deps}
}

func (s *service) Enroll(ctx context.Context, userID, courseID uint) (*entity.Enrollment, error) {
	course, err := s.repo.FindCourseMeta(ctx, courseID)
	if err != nil {
		return nil, ErrCourseNotFound
	}

	existing, _ := s.repo.FindByUserAndCourse(ctx, userID, courseID)
	if existing != nil {
		if existing.Status != entity.EnrollmentStatusDropped {
			return existing, nil
		}
		now := time.Now()
		existing.Status = entity.EnrollmentStatusActive
		existing.EnrolledAt = &now
		existing.CompletedAt = nil
		if err := s.repo.Update(ctx, existing); err != nil {
			return nil, fmt.Errorf("failed to re-enroll: %w", err)
		}
		if err := s.recompute(ctx, existing.ID, userID, course, nil, time.Time{}); err != nil {
			return nil, err
		}
		s.track(ctx, learnevents.EventCourseEnrolled, userID, courseID, map[string]interface{}{"reenroll": true})
		return s.repo.FindByID(ctx, existing.ID)
	}

	now := time.Now()
	enrollment := &entity.Enrollment{
		UserID:     userID,
		CourseID:   courseID,
		Status:     entity.EnrollmentStatusActive,
		Progress:   0,
		EnrolledAt: &now,
	}
	if err := s.repo.Create(ctx, enrollment); err != nil {
		if again, findErr := s.repo.FindByUserAndCourse(ctx, userID, courseID); findErr == nil {
			return again, nil
		}
		return nil, fmt.Errorf("failed to enroll: %w", err)
	}
	s.track(ctx, learnevents.EventCourseEnrolled, userID, courseID, nil)
	return enrollment, nil
}

func (s *service) UpdateProgress(ctx context.Context, enrollmentID uint, req UpdateRequest) (*entity.Enrollment, error) {
	enrollment, err := s.repo.FindByID(ctx, enrollmentID)
	if err != nil {
		return nil, fmt.Errorf("enrollment not found: %w", err)
	}

	if req.Status != nil {
		switch *req.Status {
		case entity.EnrollmentStatusActive, entity.EnrollmentStatusDropped:
		case entity.EnrollmentStatusCompleted:
			req.Status = nil
		default:
			return nil, ErrInvalidStatus
		}
	}

	course, err := s.repo.FindCourseMeta(ctx, enrollment.CourseID)
	if err != nil {
		return nil, ErrCourseNotFound
	}
	lessons, err := s.repo.CourseLessons(ctx, enrollment.CourseID)
	if err != nil {
		return nil, fmt.Errorf("failed to load course lessons: %w", err)
	}
	valid := lessonSet(lessons)

	toAdd := make([]uint, 0, len(req.CompletedLessons))
	seen := make(map[uint]bool, len(req.CompletedLessons))
	for _, id := range req.CompletedLessons {
		if !valid[id] {
			return nil, ErrLessonNotInCourse
		}
		if !seen[id] {
			seen[id] = true
			toAdd = append(toAdd, id)
		}
	}
	if req.LastLessonID != nil && !valid[*req.LastLessonID] {
		return nil, ErrLessonNotInCourse
	}

	if req.Status != nil && *req.Status != enrollment.Status {
		if err := s.repo.SetStatus(ctx, enrollmentID, *req.Status); err != nil {
			return nil, fmt.Errorf("failed to update status: %w", err)
		}
		enrollment.Status = *req.Status
	}
	if enrollment.Status == entity.EnrollmentStatusDropped {
		return s.repo.FindByID(ctx, enrollmentID)
	}

	added, err := s.repo.AddCompletedLessons(ctx, enrollmentID, toAdd)
	if err != nil {
		return nil, fmt.Errorf("failed to record completed lessons: %w", err)
	}
	for _, id := range added {
		s.track(ctx, learnevents.EventLessonCompleted, enrollment.UserID, enrollment.CourseID, map[string]interface{}{"lessonId": id})
	}

	last := req.LastLessonID
	if last == nil && len(toAdd) > 0 {
		last = &toAdd[len(toAdd)-1]
	}
	if err := s.recomputeWith(ctx, enrollment, course, lessons, last, time.Now()); err != nil {
		return nil, err
	}
	return s.repo.FindByID(ctx, enrollmentID)
}

func (s *service) Recheck(ctx context.Context, userID, courseID uint) error {
	enrollment, err := s.repo.FindByUserAndCourse(ctx, userID, courseID)
	if err != nil || enrollment == nil || enrollment.Status == entity.EnrollmentStatusDropped {
		return nil
	}
	course, err := s.repo.FindCourseMeta(ctx, courseID)
	if err != nil {
		return nil
	}
	return s.recompute(ctx, enrollment.ID, userID, course, nil, time.Time{})
}

func (s *service) recompute(ctx context.Context, enrollmentID, userID uint, course *entity.Course, last *uint, touch time.Time) error {
	enrollment, err := s.repo.FindByID(ctx, enrollmentID)
	if err != nil {
		return err
	}
	lessons, err := s.repo.CourseLessons(ctx, course.ID)
	if err != nil {
		return fmt.Errorf("failed to load course lessons: %w", err)
	}
	return s.recomputeWith(ctx, enrollment, course, lessons, last, touch)
}

func (s *service) recomputeWith(ctx context.Context, enrollment *entity.Enrollment, course *entity.Course, lessons []entity.Lesson, last *uint, touch time.Time) error {
	valid := lessonSet(lessons)
	completedIDs, err := s.repo.CompletedLessonIDs(ctx, enrollment.ID)
	if err != nil {
		return fmt.Errorf("failed to load completed lessons: %w", err)
	}
	done := 0
	for _, id := range completedIDs {
		if valid[id] {
			done++
		}
	}
	progress := 0.0
	if len(valid) > 0 {
		progress = math.Round(float64(done)/float64(len(valid))*10000) / 100
	}
	if err := s.repo.UpdateProgressFields(ctx, enrollment.ID, progress, last, touch); err != nil {
		return fmt.Errorf("failed to update progress: %w", err)
	}
	if len(valid) == 0 || done < len(valid) || enrollment.Status == entity.EnrollmentStatusDropped {
		return nil
	}

	var score *float64
	if course.RequireAssessmentPass && course.AssessmentID != nil && s.deps.Attempts != nil {
		best, passed, err := s.deps.Attempts.BestScore(ctx, enrollment.UserID, *course.AssessmentID)
		if err != nil {
			return fmt.Errorf("failed to check assessment: %w", err)
		}
		if !passed {
			return nil
		}
		score = best
	}

	completed, err := s.repo.MarkCompleted(ctx, enrollment.ID, 100, time.Now())
	if err != nil {
		return fmt.Errorf("failed to complete enrollment: %w", err)
	}
	if !completed {
		if enrollment.Status == entity.EnrollmentStatusCompleted && s.deps.Certificates != nil {
			return s.deps.Certificates.Issue(ctx, enrollment.UserID, enrollment.CourseID, enrollment.ID, score)
		}
		return nil
	}
	s.track(ctx, learnevents.EventCourseCompleted, enrollment.UserID, enrollment.CourseID, nil)
	link := "/certificates"
	_ = s.deps.Notifier.Notify(ctx, enrollment.UserID, "Course completed", fmt.Sprintf("You completed %q.", course.Title), &link)
	if s.deps.Certificates != nil {
		if err := s.deps.Certificates.Issue(ctx, enrollment.UserID, enrollment.CourseID, enrollment.ID, score); err != nil {
			return fmt.Errorf("failed to issue certificate: %w", err)
		}
	}
	return nil
}

func (s *service) GetResume(ctx context.Context, userID, courseID uint) (*Resume, error) {
	enrollment, err := s.repo.FindByUserAndCourse(ctx, userID, courseID)
	if err != nil || enrollment == nil {
		return nil, ErrNotEnrolled
	}
	course, err := s.repo.FindCourseMeta(ctx, courseID)
	if err != nil {
		return nil, ErrCourseNotFound
	}
	lessons, err := s.repo.CourseLessons(ctx, courseID)
	if err != nil {
		return nil, fmt.Errorf("failed to load course lessons: %w", err)
	}
	valid := lessonSet(lessons)
	completedIDs, err := s.repo.CompletedLessonIDs(ctx, enrollment.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to load completed lessons: %w", err)
	}
	completed := make(map[uint]bool, len(completedIDs))
	ids := make([]uint, 0, len(completedIDs))
	for _, id := range completedIDs {
		if valid[id] && !completed[id] {
			completed[id] = true
			ids = append(ids, id)
		}
	}

	r := &Resume{
		EnrollmentID:       enrollment.ID,
		CourseID:           courseID,
		Status:             enrollment.Status,
		Progress:           enrollment.Progress,
		TotalLessons:       len(lessons),
		CompletedCount:     len(ids),
		CompletedLessonIDs: ids,
		LastLessonID:       enrollment.LastLessonID,
	}
	start := 0
	if enrollment.LastLessonID != nil {
		for i, l := range lessons {
			if l.ID == *enrollment.LastLessonID {
				start = i + 1
				break
			}
		}
	}
	for i := 0; i < len(lessons); i++ {
		l := lessons[(start+i)%len(lessons)]
		if !completed[l.ID] {
			next := l
			r.NextLesson = &next
			break
		}
	}
	if r.NextLesson == nil && course.RequireAssessmentPass && enrollment.Status != entity.EnrollmentStatusCompleted && len(lessons) > 0 {
		r.AwaitingAssessment = true
		r.AssessmentID = course.AssessmentID
	}
	return r, nil
}

func (s *service) SyncLocal(ctx context.Context, userID uint, items []SyncItem) ([]SyncResult, error) {
	if len(items) > MaxSyncCourses {
		return nil, ErrSyncTooLarge
	}
	total := 0
	merged := make(map[uint][]uint, len(items))
	order := make([]uint, 0, len(items))
	for _, it := range items {
		if len(it.CompletedLessonIDs) > MaxSyncLessonsPerCourse {
			return nil, ErrSyncTooLarge
		}
		total += len(it.CompletedLessonIDs)
		if total > MaxSyncTotalLessons {
			return nil, ErrSyncTooLarge
		}
		if _, ok := merged[it.CourseID]; !ok {
			order = append(order, it.CourseID)
		}
		merged[it.CourseID] = append(merged[it.CourseID], it.CompletedLessonIDs...)
	}

	results := make([]SyncResult, 0, len(order))
	for _, courseID := range order {
		results = append(results, s.syncCourse(ctx, userID, courseID, merged[courseID]))
	}
	return results, nil
}

func (s *service) syncCourse(ctx context.Context, userID, courseID uint, lessonIDs []uint) SyncResult {
	res := SyncResult{CourseID: courseID}
	course, err := s.repo.FindCourseMeta(ctx, courseID)
	if err != nil || course.Status != entity.CMSStatusPublished {
		res.Error = "course_not_found"
		res.Rejected = len(lessonIDs)
		return res
	}
	enrollment, err := s.Enroll(ctx, userID, courseID)
	if err != nil {
		res.Error = "enroll_failed"
		res.Rejected = len(lessonIDs)
		return res
	}
	lessons, err := s.repo.CourseLessons(ctx, courseID)
	if err != nil {
		res.Error = "lessons_unavailable"
		return res
	}
	valid := lessonSet(lessons)
	toAdd := make([]uint, 0, len(lessonIDs))
	seen := make(map[uint]bool, len(lessonIDs))
	for _, id := range lessonIDs {
		if !valid[id] {
			res.Rejected++
			continue
		}
		if !seen[id] {
			seen[id] = true
			toAdd = append(toAdd, id)
		}
	}
	added, err := s.repo.AddCompletedLessons(ctx, enrollment.ID, toAdd)
	if err != nil {
		res.Error = "sync_failed"
		return res
	}
	res.Accepted = len(added)
	if len(added) > 0 {
		s.track(ctx, learnevents.EventLessonCompleted, userID, courseID, map[string]interface{}{"count": len(added), "source": "sync"})
	}
	if err := s.recomputeWith(ctx, enrollment, course, lessons, nil, time.Time{}); err != nil {
		res.Error = "sync_failed"
		return res
	}
	if fresh, err := s.repo.FindByID(ctx, enrollment.ID); err == nil {
		res.Progress = fresh.Progress
		res.Status = string(fresh.Status)
	}
	return res
}

func (s *service) GetPathProgress(ctx context.Context, userID uint, idOrSlug string) (*PathProgress, error) {
	if s.deps.Paths == nil {
		return nil, ErrPathNotFound
	}
	lp, err := s.deps.Paths.FindByIDOrSlug(ctx, idOrSlug)
	if err != nil || lp == nil {
		return nil, ErrPathNotFound
	}
	courseIDs := make([]uint, len(lp.Courses))
	for i, c := range lp.Courses {
		courseIDs[i] = c.CourseID
	}
	enrollments, err := s.repo.FindByUserAndCourseIDs(ctx, userID, courseIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to load enrollments: %w", err)
	}
	byCourse := make(map[uint]*entity.Enrollment, len(enrollments))
	for _, e := range enrollments {
		if e.Status != entity.EnrollmentStatusDropped {
			byCourse[e.CourseID] = e
		}
	}

	out := &PathProgress{PathID: lp.ID, Title: lp.Title, TotalCourses: len(lp.Courses), Courses: make([]PathCourseProgress, 0, len(lp.Courses))}
	sum := 0.0
	for _, lpc := range lp.Courses {
		row := PathCourseProgress{CourseID: lpc.CourseID, SortOrder: lpc.SortOrder, Status: "not_started"}
		if lpc.Course != nil {
			row.Title = lpc.Course.Title
		}
		if e, ok := byCourse[lpc.CourseID]; ok {
			row.Enrolled = true
			row.Status = string(e.Status)
			row.Progress = e.Progress
			row.CompletedAt = e.CompletedAt
			sum += e.Progress
			if e.Status == entity.EnrollmentStatusCompleted {
				out.CompletedCourses++
			}
		}
		if row.Status != string(entity.EnrollmentStatusCompleted) && out.NextCourseID == nil {
			id := lpc.CourseID
			out.NextCourseID = &id
		}
		out.Courses = append(out.Courses, row)
	}
	if out.TotalCourses > 0 {
		out.Progress = math.Round(sum/float64(out.TotalCourses)*100) / 100
	}
	return out, nil
}

func (s *service) GetByUserAndCourse(ctx context.Context, userID, courseID uint) (*entity.Enrollment, error) {
	return s.repo.FindByUserAndCourse(ctx, userID, courseID)
}

func (s *service) GetByUserID(ctx context.Context, userID uint) ([]*entity.Enrollment, error) {
	return s.repo.FindByUserID(ctx, userID)
}

func (s *service) GetByID(ctx context.Context, id uint) (*entity.Enrollment, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *service) track(ctx context.Context, event string, userID, courseID uint, meta map[string]interface{}) {
	cid := fmt.Sprintf("%d", courseID)
	ct := "COURSE"
	_ = s.deps.Tracker.TrackEvent(ctx, event, &userID, &cid, &ct, meta)
}

func lessonSet(lessons []entity.Lesson) map[uint]bool {
	m := make(map[uint]bool, len(lessons))
	for _, l := range lessons {
		m[l.ID] = true
	}
	return m
}
