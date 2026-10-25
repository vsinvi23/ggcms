package assessment

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/serenya/go-cms/internal/application/learnevents"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

const historyLimit = 50

var (
	ErrAssessmentNotFound = errors.New("assessment not found")
	ErrInvalidAssessment  = errors.New("assessment definition is invalid")
	ErrAttemptNotFound    = errors.New("attempt not found")
	ErrAlreadySubmitted   = errors.New("attempt already submitted")
	ErrMaxAttempts        = errors.New("maximum attempts reached")
	ErrInvalidAnswers     = errors.New("invalid answers")
	ErrInvalidRequirement = errors.New("invalid completion requirement")
	ErrCourseNotFound     = errors.New("course not found")
)

type CompletionRechecker interface {
	Recheck(ctx context.Context, userID, courseID uint) error
}

type Deps struct {
	Completion CompletionRechecker
	Tracker    learnevents.Tracker
}

type PublicQuestion struct {
	ID       string
	Text     string
	Options  []string
	Multiple bool
}

type Definition struct {
	AssessmentID  uint
	Title         string
	PassMark      float64
	QuestionCount int
	MaxAttempts   int
	Questions     []PublicQuestion
}

type Answer struct {
	QuestionID string
	Selected   []int
}

type QuestionResult struct {
	QuestionID     string
	Correct        bool
	CorrectIndexes []int
	Explanation    string
}

type AttemptResult struct {
	Attempt *entity.AssessmentAttempt
	Results []QuestionResult
}

type StartResult struct {
	Attempt    *entity.AssessmentAttempt
	Definition *Definition
}

type History struct {
	AssessmentID uint
	Attempts     []*entity.AssessmentAttempt
	AttemptsUsed int
	BestScore    *float64
	Passed       bool
	PassMark     float64
}

type Service interface {
	GetDefinition(ctx context.Context, assessmentID uint) (*Definition, error)
	Start(ctx context.Context, userID, assessmentID uint) (*StartResult, error)
	Submit(ctx context.Context, userID, assessmentID, attemptID uint, answers []Answer) (*AttemptResult, error)
	History(ctx context.Context, userID, assessmentID uint) (*History, error)
	SetCourseRequirement(ctx context.Context, courseID uint, assessmentID *uint, required bool) error
}

type service struct {
	repo repository.AssessmentAttemptRepository
	deps Deps
}

func NewService(repo repository.AssessmentAttemptRepository, deps Deps) Service {
	if deps.Tracker == nil {
		deps.Tracker = learnevents.NopTracker{}
	}
	return &service{repo: repo, deps: deps}
}

func (s *service) load(ctx context.Context, assessmentID uint) (*entity.Course, *parsed, error) {
	course, err := s.repo.FindAssessment(ctx, assessmentID)
	if err != nil || course.CourseType != entity.CourseTypeAssessment || course.Status != entity.CMSStatusPublished {
		return nil, nil, ErrAssessmentNotFound
	}
	p, err := parseMetadata(course.InteractiveMetadata)
	if err != nil {
		return nil, nil, err
	}
	return course, p, nil
}

func definition(course *entity.Course, p *parsed) *Definition {
	d := &Definition{
		AssessmentID:  course.ID,
		Title:         course.Title,
		PassMark:      p.PassMark,
		QuestionCount: len(p.Questions),
		MaxAttempts:   p.MaxAttempts,
		Questions:     make([]PublicQuestion, len(p.Questions)),
	}
	for i, q := range p.Questions {
		d.Questions[i] = PublicQuestion{ID: q.ID, Text: q.Text, Options: q.Options, Multiple: len(q.Correct) > 1}
	}
	return d
}

func (s *service) GetDefinition(ctx context.Context, assessmentID uint) (*Definition, error) {
	course, p, err := s.load(ctx, assessmentID)
	if err != nil {
		return nil, err
	}
	return definition(course, p), nil
}

func (s *service) Start(ctx context.Context, userID, assessmentID uint) (*StartResult, error) {
	course, p, err := s.load(ctx, assessmentID)
	if err != nil {
		return nil, err
	}
	def := definition(course, p)

	if open, err := s.repo.FindOpen(ctx, userID, assessmentID); err == nil && open != nil {
		return &StartResult{Attempt: open, Definition: def}, nil
	}
	if p.MaxAttempts > 0 {
		n, err := s.repo.CountByUser(ctx, userID, assessmentID)
		if err != nil {
			return nil, fmt.Errorf("failed to count attempts: %w", err)
		}
		if int(n) >= p.MaxAttempts {
			return nil, ErrMaxAttempts
		}
	}
	attempt := &entity.AssessmentAttempt{
		UserID:         userID,
		AssessmentID:   assessmentID,
		Status:         entity.AttemptStatusInProgress,
		TotalQuestions: len(p.Questions),
		PassMark:       p.PassMark,
		StartedAt:      time.Now(),
	}
	if err := s.repo.Create(ctx, attempt); err != nil {
		if open, findErr := s.repo.FindOpen(ctx, userID, assessmentID); findErr == nil && open != nil {
			return &StartResult{Attempt: open, Definition: def}, nil
		}
		return nil, fmt.Errorf("failed to start attempt: %w", err)
	}
	return &StartResult{Attempt: attempt, Definition: def}, nil
}

func (s *service) Submit(ctx context.Context, userID, assessmentID, attemptID uint, answers []Answer) (*AttemptResult, error) {
	attempt, err := s.repo.FindByID(ctx, attemptID)
	if err != nil || attempt.UserID != userID || attempt.AssessmentID != assessmentID {
		return nil, ErrAttemptNotFound
	}
	if attempt.Status != entity.AttemptStatusInProgress {
		return nil, ErrAlreadySubmitted
	}
	_, p, err := s.load(ctx, assessmentID)
	if err != nil {
		return nil, err
	}

	byID := make(map[string]question, len(p.Questions))
	for _, q := range p.Questions {
		byID[q.ID] = q
	}
	given := make(map[string][]int, len(answers))
	for _, a := range answers {
		q, ok := byID[a.QuestionID]
		if !ok {
			return nil, ErrInvalidAnswers
		}
		if _, dup := given[a.QuestionID]; dup {
			return nil, ErrInvalidAnswers
		}
		sel := normalize(a.Selected, len(q.Options))
		if sel == nil && len(a.Selected) > 0 {
			return nil, ErrInvalidAnswers
		}
		given[a.QuestionID] = sel
	}

	correct := 0
	results := make([]QuestionResult, len(p.Questions))
	for i, q := range p.Questions {
		ok := sameSet(given[q.ID], q.Correct)
		if ok {
			correct++
		}
		results[i] = QuestionResult{QuestionID: q.ID, Correct: ok}
		if p.RevealAnswers {
			results[i].CorrectIndexes = q.Correct
			results[i].Explanation = q.Explanation
		}
	}
	score := round2(float64(correct) / float64(len(p.Questions)) * 100)
	now := time.Now()
	stored, _ := json.Marshal(given)
	storedStr := string(stored)

	attempt.Answers = &storedStr
	attempt.Score = &score
	attempt.CorrectCount = correct
	attempt.TotalQuestions = len(p.Questions)
	attempt.PassMark = p.PassMark
	attempt.Passed = score >= p.PassMark
	attempt.SubmittedAt = &now
	attempt.DurationSeconds = int(now.Sub(attempt.StartedAt).Seconds())
	attempt.Status = entity.AttemptStatusSubmitted

	won, err := s.repo.Submit(ctx, attempt)
	if err != nil {
		return nil, fmt.Errorf("failed to submit attempt: %w", err)
	}
	if !won {
		return nil, ErrAlreadySubmitted
	}

	aid := fmt.Sprintf("%d", assessmentID)
	ct := "ASSESSMENT"
	_ = s.deps.Tracker.TrackEvent(ctx, learnevents.EventQuizAttempted, &userID, &aid, &ct, map[string]interface{}{
		"score": score, "passed": attempt.Passed, "attemptId": attempt.ID,
	})

	if attempt.Passed && s.deps.Completion != nil {
		courseIDs, err := s.repo.CoursesRequiring(ctx, assessmentID)
		if err == nil {
			for _, courseID := range courseIDs {
				_ = s.deps.Completion.Recheck(ctx, userID, courseID)
			}
		}
	}
	return &AttemptResult{Attempt: attempt, Results: results}, nil
}

func (s *service) History(ctx context.Context, userID, assessmentID uint) (*History, error) {
	_, p, err := s.load(ctx, assessmentID)
	if err != nil {
		return nil, err
	}
	attempts, err := s.repo.ListByUser(ctx, userID, assessmentID, historyLimit)
	if err != nil {
		return nil, fmt.Errorf("failed to list attempts: %w", err)
	}
	best, passed, err := s.repo.BestScore(ctx, userID, assessmentID)
	if err != nil {
		return nil, fmt.Errorf("failed to compute best score: %w", err)
	}
	n, err := s.repo.CountByUser(ctx, userID, assessmentID)
	if err != nil {
		return nil, fmt.Errorf("failed to count attempts: %w", err)
	}
	return &History{AssessmentID: assessmentID, Attempts: attempts, AttemptsUsed: int(n), BestScore: best, Passed: passed, PassMark: p.PassMark}, nil
}

func (s *service) SetCourseRequirement(ctx context.Context, courseID uint, assessmentID *uint, required bool) error {
	if required && assessmentID == nil {
		return ErrInvalidRequirement
	}
	if assessmentID != nil {
		if *assessmentID == courseID {
			return ErrInvalidRequirement
		}
		a, err := s.repo.FindAssessment(ctx, *assessmentID)
		if err != nil || a.CourseType != entity.CourseTypeAssessment {
			return ErrInvalidRequirement
		}
	}
	if err := s.repo.SetCourseRequirement(ctx, courseID, assessmentID, required); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrCourseNotFound
		}
		return fmt.Errorf("failed to set requirement: %w", err)
	}
	return nil
}
