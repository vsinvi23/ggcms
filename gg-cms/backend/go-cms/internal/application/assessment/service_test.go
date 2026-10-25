package assessment

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

const meta = `{"passMark":60,"revealAnswers":false,"questions":[
 {"question":"Q1","options":["a","b","c"],"correctIndex":1,"explanation":"secret-expl"},
 {"id":"multi","question":"Q2","options":["a","b","c"],"correctIndexes":[0,2]},
 {"question":"Q3","options":["x","y"],"answer":0}
]}`

type fakeRepo struct {
	repository.AssessmentAttemptRepository
	course   *entity.Course
	attempts map[uint]*entity.AssessmentAttempt
	next     uint
}

func newFake(m string) *fakeRepo {
	return &fakeRepo{
		course:   &entity.Course{ID: 7, Title: "Quiz", Status: entity.CMSStatusPublished, CourseType: entity.CourseTypeAssessment, InteractiveMetadata: &m},
		attempts: map[uint]*entity.AssessmentAttempt{},
	}
}

func (f *fakeRepo) FindAssessment(context.Context, uint) (*entity.Course, error) { return f.course, nil }
func (f *fakeRepo) Create(_ context.Context, a *entity.AssessmentAttempt) error {
	f.next++
	a.ID = f.next
	cp := *a
	f.attempts[a.ID] = &cp
	return nil
}
func (f *fakeRepo) FindByID(_ context.Context, id uint) (*entity.AssessmentAttempt, error) {
	a, ok := f.attempts[id]
	if !ok {
		return nil, errors.New("nf")
	}
	cp := *a
	return &cp, nil
}
func (f *fakeRepo) FindOpen(_ context.Context, u, _ uint) (*entity.AssessmentAttempt, error) {
	for _, a := range f.attempts {
		if a.UserID == u && a.Status == entity.AttemptStatusInProgress {
			cp := *a
			return &cp, nil
		}
	}
	return nil, errors.New("nf")
}
func (f *fakeRepo) CountByUser(_ context.Context, u, _ uint) (int64, error) {
	var n int64
	for _, a := range f.attempts {
		if a.UserID == u {
			n++
		}
	}
	return n, nil
}
func (f *fakeRepo) Submit(_ context.Context, a *entity.AssessmentAttempt) (bool, error) {
	cur := f.attempts[a.ID]
	if cur.Status != entity.AttemptStatusInProgress {
		return false, nil
	}
	cp := *a
	f.attempts[a.ID] = &cp
	return true, nil
}
func (f *fakeRepo) CoursesRequiring(context.Context, uint) ([]uint, error) { return []uint{3}, nil }

type recheck struct{ calls []uint }

func (r *recheck) Recheck(_ context.Context, _ uint, c uint) error {
	r.calls = append(r.calls, c)
	return nil
}

func answers(q0, q1, q2 []int) []Answer {
	return []Answer{{"0", q0}, {"multi", q1}, {"2", q2}}
}

func TestScoringServerSide(t *testing.T) {
	rc := &recheck{}
	svc := NewService(newFake(meta), Deps{Completion: rc})
	ctx := context.Background()
	st, err := svc.Start(ctx, 1, 7)
	if err != nil {
		t.Fatal(err)
	}
	res, err := svc.Submit(ctx, 1, 7, st.Attempt.ID, answers([]int{1}, []int{2, 0}, []int{1}))
	if err != nil {
		t.Fatal(err)
	}
	a := res.Attempt
	if a.CorrectCount != 2 || *a.Score != 66.67 || !a.Passed {
		t.Fatalf("scoring wrong: %+v score=%v", a, *a.Score)
	}
	if !res.Results[0].Correct || !res.Results[1].Correct || res.Results[2].Correct {
		t.Fatalf("per-question results wrong: %+v", res.Results)
	}
	for _, r := range res.Results {
		if r.CorrectIndexes != nil || r.Explanation != "" {
			t.Fatal("answer key must not be revealed when revealAnswers is false")
		}
	}
	if len(rc.calls) != 1 || rc.calls[0] != 3 {
		t.Fatalf("passing must trigger completion recheck: %v", rc.calls)
	}
}

func TestPartialMultiSelectAndUnansweredAreWrong(t *testing.T) {
	svc := NewService(newFake(meta), Deps{})
	ctx := context.Background()
	st, _ := svc.Start(ctx, 1, 7)
	res, err := svc.Submit(ctx, 1, 7, st.Attempt.ID, []Answer{{"multi", []int{0}}})
	if err != nil {
		t.Fatal(err)
	}
	if res.Attempt.CorrectCount != 0 || *res.Attempt.Score != 0 || res.Attempt.Passed {
		t.Fatalf("got %+v", res.Attempt)
	}
}

func TestStartDoesNotLeakAnswerKey(t *testing.T) {
	svc := NewService(newFake(meta), Deps{})
	st, err := svc.Start(context.Background(), 1, 7)
	if err != nil {
		t.Fatal(err)
	}
	def, _ := svc.GetDefinition(context.Background(), 7)
	for _, d := range []*Definition{st.Definition, def} {
		if len(d.Questions) != 3 || !d.Questions[1].Multiple {
			t.Fatalf("definition wrong: %+v", d)
		}
	}
}

func TestSanitizeMetadataStripsAnswerKey(t *testing.T) {
	out := SanitizeMetadata(meta)
	for _, leak := range []string{"correctIndex", "correctIndexes", "answer", "secret-expl", "revealAnswers"} {
		if strings.Contains(out, leak) {
			t.Fatalf("sanitized metadata still contains %q: %s", leak, out)
		}
	}
	if !strings.Contains(out, `"options"`) || !strings.Contains(out, "passMark") {
		t.Fatalf("sanitizer removed too much: %s", out)
	}
}

func TestSubmitTwiceAndOtherUser(t *testing.T) {
	svc := NewService(newFake(meta), Deps{})
	ctx := context.Background()
	st, _ := svc.Start(ctx, 1, 7)
	if _, err := svc.Submit(ctx, 2, 7, st.Attempt.ID, nil); !errors.Is(err, ErrAttemptNotFound) {
		t.Fatalf("other user must not submit: %v", err)
	}
	if _, err := svc.Submit(ctx, 1, 7, st.Attempt.ID, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Submit(ctx, 1, 7, st.Attempt.ID, nil); !errors.Is(err, ErrAlreadySubmitted) {
		t.Fatalf("resubmit must fail: %v", err)
	}
}

func TestInvalidAnswersRejected(t *testing.T) {
	svc := NewService(newFake(meta), Deps{})
	ctx := context.Background()
	st, _ := svc.Start(ctx, 1, 7)
	for _, bad := range [][]Answer{
		{{"nope", []int{0}}},
		{{"0", []int{9}}},
		{{"0", []int{1}}, {"0", []int{1}}},
	} {
		if _, err := svc.Submit(ctx, 1, 7, st.Attempt.ID, bad); !errors.Is(err, ErrInvalidAnswers) {
			t.Fatalf("expected ErrInvalidAnswers for %+v, got %v", bad, err)
		}
	}
}

func TestMaxAttemptsAndUnpublished(t *testing.T) {
	m := `{"maxAttempts":1,"questions":[{"options":["a","b"],"correctIndex":0}]}`
	f := newFake(m)
	svc := NewService(f, Deps{})
	ctx := context.Background()
	st, _ := svc.Start(ctx, 1, 7)
	if _, err := svc.Submit(ctx, 1, 7, st.Attempt.ID, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Start(ctx, 1, 7); !errors.Is(err, ErrMaxAttempts) {
		t.Fatalf("want ErrMaxAttempts, got %v", err)
	}
	f.course.Status = entity.CMSStatusDraft
	if _, err := svc.GetDefinition(ctx, 7); !errors.Is(err, ErrAssessmentNotFound) {
		t.Fatalf("draft assessment must be hidden: %v", err)
	}
}

func TestMalformedDefinitionRejected(t *testing.T) {
	for _, m := range []string{`{`, `{"questions":[]}`, `{"questions":[{"options":["a"],"correctIndex":0}]}`, `{"questions":[{"options":["a","b"],"correctIndex":5}]}`, `{"questions":[{"options":["a","b"]}]}`} {
		m := m
		if _, err := parseMetadata(&m); !errors.Is(err, ErrInvalidAssessment) {
			t.Fatalf("expected invalid for %s, got %v", m, err)
		}
	}
}
