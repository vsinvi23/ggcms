package enrollment

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type fakeRepo struct {
	repository.EnrollmentProgressRepository
	mu          sync.Mutex
	enrollments map[uint]*entity.Enrollment
	done        map[uint]map[uint]bool
	courses     map[uint]*entity.Course
	lessons     map[uint][]entity.Lesson
	nextID      uint
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		enrollments: map[uint]*entity.Enrollment{},
		done:        map[uint]map[uint]bool{},
		courses:     map[uint]*entity.Course{},
		lessons:     map[uint][]entity.Lesson{},
	}
}

func (f *fakeRepo) addCourse(id uint, lessonIDs ...uint) {
	f.courses[id] = &entity.Course{ID: id, Title: "Course", Status: entity.CMSStatusPublished}
	for _, l := range lessonIDs {
		f.lessons[id] = append(f.lessons[id], entity.Lesson{ID: l})
	}
}

func (f *fakeRepo) Create(_ context.Context, e *entity.Enrollment) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.nextID++
	e.ID = f.nextID
	cp := *e
	f.enrollments[e.ID] = &cp
	f.done[e.ID] = map[uint]bool{}
	return nil
}
func (f *fakeRepo) Update(_ context.Context, e *entity.Enrollment) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	cp := *e
	f.enrollments[e.ID] = &cp
	return nil
}
func (f *fakeRepo) FindByID(_ context.Context, id uint) (*entity.Enrollment, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	e, ok := f.enrollments[id]
	if !ok {
		return nil, errors.New("nf")
	}
	cp := *e
	return &cp, nil
}
func (f *fakeRepo) FindByUserAndCourse(_ context.Context, u, c uint) (*entity.Enrollment, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, e := range f.enrollments {
		if e.UserID == u && e.CourseID == c {
			cp := *e
			return &cp, nil
		}
	}
	return nil, errors.New("nf")
}
func (f *fakeRepo) CourseLessons(_ context.Context, id uint) ([]entity.Lesson, error) {
	return f.lessons[id], nil
}
func (f *fakeRepo) CompletedLessonIDs(_ context.Context, id uint) ([]uint, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []uint
	for l := range f.done[id] {
		out = append(out, l)
	}
	return out, nil
}
func (f *fakeRepo) AddCompletedLessons(_ context.Context, id uint, ids []uint) ([]uint, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var added []uint
	for _, l := range ids {
		if !f.done[id][l] {
			f.done[id][l] = true
			added = append(added, l)
		}
	}
	return added, nil
}
func (f *fakeRepo) UpdateProgressFields(_ context.Context, id uint, p float64, last *uint, at time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	e := f.enrollments[id]
	e.Progress = p
	if last != nil {
		e.LastLessonID = last
	}
	if !at.IsZero() {
		e.LastAccessedAt = &at
	}
	return nil
}
func (f *fakeRepo) MarkCompleted(_ context.Context, id uint, p float64, at time.Time) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	e := f.enrollments[id]
	if e.CompletedAt != nil {
		return false, nil
	}
	e.Status, e.Progress, e.CompletedAt = entity.EnrollmentStatusCompleted, p, &at
	return true, nil
}
func (f *fakeRepo) SetStatus(_ context.Context, id uint, s entity.EnrollmentStatus) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.enrollments[id].Status = s
	return nil
}
func (f *fakeRepo) FindCourseMeta(_ context.Context, id uint) (*entity.Course, error) {
	c, ok := f.courses[id]
	if !ok {
		return nil, errors.New("nf")
	}
	cp := *c
	return &cp, nil
}

type fakeCerts struct{ calls int }

func (f *fakeCerts) Issue(context.Context, uint, uint, uint, *float64) error { f.calls++; return nil }

type fakeAttempts struct {
	best   float64
	passed bool
}

func (f fakeAttempts) BestScore(context.Context, uint, uint) (*float64, bool, error) {
	return &f.best, f.passed, nil
}

type recTracker struct{ events []string }

func (r *recTracker) TrackEvent(_ context.Context, e string, _ *uint, _, _ *string, _ map[string]interface{}) error {
	r.events = append(r.events, e)
	return nil
}

func setup(t *testing.T) (*fakeRepo, *fakeCerts, *recTracker, Service) {
	t.Helper()
	repo := newFakeRepo()
	repo.addCourse(1, 10, 11, 12, 13)
	repo.addCourse(2, 20, 21)
	certs := &fakeCerts{}
	tr := &recTracker{}
	return repo, certs, tr, NewService(repo, Deps{Certificates: certs, Tracker: tr})
}

func TestProgressComputedServerSideIgnoringClient(t *testing.T) {
	_, _, _, svc := setup(t)
	e, err := svc.Enroll(context.Background(), 5, 1)
	if err != nil {
		t.Fatal(err)
	}
	completed := entity.EnrollmentStatusCompleted
	out, err := svc.UpdateProgress(context.Background(), e.ID, UpdateRequest{Status: &completed, CompletedLessons: []uint{10}})
	if err != nil {
		t.Fatal(err)
	}
	if out.Progress != 25 || out.Status != entity.EnrollmentStatusActive || out.CompletedAt != nil {
		t.Fatalf("client must not inflate progress/status: %+v", out)
	}
}

func TestLessonFromOtherCourseRejected(t *testing.T) {
	repo, _, _, svc := setup(t)
	e, _ := svc.Enroll(context.Background(), 5, 1)
	_, err := svc.UpdateProgress(context.Background(), e.ID, UpdateRequest{CompletedLessons: []uint{10, 20}})
	if !errors.Is(err, ErrLessonNotInCourse) {
		t.Fatalf("want ErrLessonNotInCourse, got %v", err)
	}
	if len(repo.done[e.ID]) != 0 {
		t.Fatal("nothing must be persisted when a lesson is invalid")
	}
	_, err = svc.UpdateProgress(context.Background(), e.ID, UpdateRequest{LastLessonID: ptr(uint(20))})
	if !errors.Is(err, ErrLessonNotInCourse) {
		t.Fatalf("last lesson from other course must be rejected, got %v", err)
	}
}

func TestCompletionIdempotentAndCertificateOnce(t *testing.T) {
	_, certs, tr, svc := setup(t)
	ctx := context.Background()
	e, _ := svc.Enroll(ctx, 5, 1)
	req := UpdateRequest{CompletedLessons: []uint{10, 11, 12, 13}}
	out, err := svc.UpdateProgress(ctx, e.ID, req)
	if err != nil {
		t.Fatal(err)
	}
	if out.Status != entity.EnrollmentStatusCompleted || out.Progress != 100 || out.CompletedAt == nil {
		t.Fatalf("expected completed: %+v", out)
	}
	if _, err := svc.UpdateProgress(ctx, e.ID, req); err != nil {
		t.Fatal(err)
	}
	count := func(name string) int {
		n := 0
		for _, ev := range tr.events {
			if ev == name {
				n++
			}
		}
		return n
	}
	if count("lesson_completed") != 4 {
		t.Fatalf("lesson_completed must fire once per lesson, got %d", count("lesson_completed"))
	}
	if count("course_completed") != 1 || count("course_enrolled") != 1 {
		t.Fatalf("events: %v", tr.events)
	}
	if certs.calls < 1 {
		t.Fatal("certificate must be requested on completion")
	}
}

func TestAssessmentGateBlocksCompletion(t *testing.T) {
	repo := newFakeRepo()
	repo.addCourse(1, 10)
	aid := uint(99)
	repo.courses[1].AssessmentID = &aid
	repo.courses[1].RequireAssessmentPass = true
	certs := &fakeCerts{}
	att := fakeAttempts{}
	svc := NewService(repo, Deps{Certificates: certs, Attempts: &att})
	ctx := context.Background()
	e, _ := svc.Enroll(ctx, 5, 1)
	out, _ := svc.UpdateProgress(ctx, e.ID, UpdateRequest{CompletedLessons: []uint{10}})
	if out.Status == entity.EnrollmentStatusCompleted || certs.calls != 0 {
		t.Fatal("must not complete before assessment passed")
	}
	r, _ := svc.GetResume(ctx, 5, 1)
	if !r.AwaitingAssessment || r.AssessmentID == nil || *r.AssessmentID != 99 || r.NextLesson != nil {
		t.Fatalf("resume should flag awaiting assessment: %+v", r)
	}
	att.best, att.passed = 80, true
	svc = NewService(repo, Deps{Certificates: certs, Attempts: &att})
	if err := svc.Recheck(ctx, 5, 1); err != nil {
		t.Fatal(err)
	}
	got, _ := svc.GetByID(ctx, e.ID)
	if got.Status != entity.EnrollmentStatusCompleted || certs.calls != 1 {
		t.Fatalf("recheck after pass should complete: %+v calls=%d", got, certs.calls)
	}
}

func TestResumePointsToNextLesson(t *testing.T) {
	_, _, _, svc := setup(t)
	ctx := context.Background()
	e, _ := svc.Enroll(ctx, 5, 1)
	if _, err := svc.UpdateProgress(ctx, e.ID, UpdateRequest{CompletedLessons: []uint{10, 12}, LastLessonID: ptr(uint(12))}); err != nil {
		t.Fatal(err)
	}
	r, err := svc.GetResume(ctx, 5, 1)
	if err != nil {
		t.Fatal(err)
	}
	if r.NextLesson == nil || r.NextLesson.ID != 13 || r.CompletedCount != 2 || r.TotalLessons != 4 {
		t.Fatalf("unexpected resume: %+v", r)
	}
	if _, err := svc.GetResume(ctx, 6, 1); !errors.Is(err, ErrNotEnrolled) {
		t.Fatalf("want ErrNotEnrolled, got %v", err)
	}
}

func TestSyncLocalMergesUnionAndRejectsForeignLessons(t *testing.T) {
	_, _, _, svc := setup(t)
	ctx := context.Background()
	e, _ := svc.Enroll(ctx, 5, 1)
	if _, err := svc.UpdateProgress(ctx, e.ID, UpdateRequest{CompletedLessons: []uint{10}}); err != nil {
		t.Fatal(err)
	}
	res, err := svc.SyncLocal(ctx, 5, []SyncItem{
		{CourseID: 1, CompletedLessonIDs: []uint{10, 11, 11, 20, 9999}},
		{CourseID: 777, CompletedLessonIDs: []uint{1}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if res[0].Accepted != 1 || res[0].Rejected != 2 || res[0].Progress != 50 {
		t.Fatalf("union merge wrong: %+v", res[0])
	}
	if res[1].Error != "course_not_found" {
		t.Fatalf("unknown course must be reported: %+v", res[1])
	}
}

func TestSyncLocalBounds(t *testing.T) {
	_, _, _, svc := setup(t)
	items := make([]SyncItem, MaxSyncCourses+1)
	if _, err := svc.SyncLocal(context.Background(), 5, items); !errors.Is(err, ErrSyncTooLarge) {
		t.Fatalf("too many courses: %v", err)
	}
	if _, err := svc.SyncLocal(context.Background(), 5, []SyncItem{{CourseID: 1, CompletedLessonIDs: make([]uint, MaxSyncLessonsPerCourse+1)}}); !errors.Is(err, ErrSyncTooLarge) {
		t.Fatalf("too many lessons: %v", err)
	}
	many := make([]SyncItem, 0, 10)
	for i := 0; i < 10; i++ {
		many = append(many, SyncItem{CourseID: uint(i + 1), CompletedLessonIDs: make([]uint, 600)})
	}
	if _, err := svc.SyncLocal(context.Background(), 5, many); !errors.Is(err, ErrSyncTooLarge) {
		t.Fatalf("total lesson cap: %v", err)
	}
}

func TestInvalidStatusRejected(t *testing.T) {
	_, _, _, svc := setup(t)
	e, _ := svc.Enroll(context.Background(), 5, 1)
	bad := entity.EnrollmentStatus("hacked")
	if _, err := svc.UpdateProgress(context.Background(), e.ID, UpdateRequest{Status: &bad}); !errors.Is(err, ErrInvalidStatus) {
		t.Fatalf("got %v", err)
	}
}

func ptr[T any](v T) *T { return &v }
