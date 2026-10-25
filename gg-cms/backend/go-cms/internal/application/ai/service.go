package ai

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type Analytics interface {
	TrackEvent(ctx context.Context, eventType string, userID *uint, contentID, contentType *string, metadata map[string]interface{}) error
}

type Actor struct {
	UserID uint
	Admin  bool
}

type Service interface {
	Status(ctx context.Context) StatusInfo

	SuggestTags(ctx context.Context, actor Actor, contentType string, contentID uint) (*TagSuggestions, error)
	Summarise(ctx context.Context, actor Actor, contentType string, contentID uint) (*SummaryResult, error)
	SuggestSEO(ctx context.Context, actor Actor, contentType string, contentID uint) (*SEOResult, error)
	QualityCheck(ctx context.Context, actor Actor, contentType string, contentID uint) (*QualityResult, error)
	GenerateQuiz(ctx context.Context, actor Actor, contentType string, contentID uint, count int, difficulty string) (*QuizResult, error)
	ListDrafts(ctx context.Context, actor Actor, contentType string, contentID uint, kind string) ([]*entity.AIDraft, error)
	ResolveDraft(ctx context.Context, actor Actor, draftID string, accept bool) (*entity.AIDraft, error)

	Ask(ctx context.Context, actor Actor, in AskInput) (*AskResult, error)
	ListConversations(ctx context.Context, userID uint) ([]*entity.AIConversation, error)
	GetConversation(ctx context.Context, userID uint, id string) (*ConversationView, error)
	DeleteConversation(ctx context.Context, userID uint, id string) error
	Feedback(ctx context.Context, userID, messageID uint, rating int, comment string) error
	StudyPlan(ctx context.Context, userID uint, goals, level string) (*StudyPlanResult, error)

	Screen(ctx context.Context, in ModerationInput) ModerationOutcome
	HiddenComments(ctx context.Context, commentIDs []string) map[string]bool
	ModerationQueue(ctx context.Context, status string, page, size int) ([]*entity.AIModerationItem, int64, error)
	ResolveModeration(ctx context.Context, id uint, approve bool, reviewerID uint) error

	Usage(ctx context.Context, from, to time.Time) (*repository.AIUsageReport, error)
	GetSettings(ctx context.Context) SettingsView
	UpdateSettings(ctx context.Context, updates map[string]string) (SettingsView, error)
	Reindex(ctx context.Context) (int, error)
}

type Deps struct {
	Gateway    *Gateway
	Content    ContentReader
	Catalog    repository.AICatalogRepository
	Drafts     repository.AIDraftRepository
	Chunks     repository.AIChunkRepository
	Convos     repository.AIConversationRepository
	Moderation repository.AIModerationRepository
	UsageRepo  repository.AIUsageRepository
	Settings   SettingsStore
	Analytics  Analytics
}

type service struct {
	Deps
}

func NewService(d Deps) Service { return &service{Deps: d} }

type StatusInfo struct {
	Enabled    bool            `json:"enabled"`
	Configured bool            `json:"configured"`
	Features   map[string]bool `json:"features"`
}

func (s *service) Status(ctx context.Context) StatusInfo {
	st := s.Gateway.Settings(ctx)
	on := st.Enabled && s.Gateway.Configured()
	return StatusInfo{
		Enabled:    st.Enabled,
		Configured: s.Gateway.Configured(),
		Features: map[string]bool{
			"editorial":  on && st.Editorial,
			"moderation": on && st.Moderation,
			"tutor":      on && st.Tutor,
			"quiz":       on && st.Quiz,
			"studyPlan":  on && st.StudyPlan,
		},
	}
}

func (s *service) loadEditable(ctx context.Context, actor Actor, contentType string, id uint) (*ContentDoc, error) {
	t, ok := ParseContentType(contentType)
	if !ok || id == 0 {
		return nil, invalid("contentType must be article or course and contentId is required")
	}
	doc, err := s.Content.Get(ctx, t, id)
	if err != nil {
		return nil, ErrNotFound
	}
	if !canEdit(doc, actor.UserID, actor.Admin) {
		return nil, ErrNotFound
	}
	return doc, nil
}

func (s *service) saveDraft(ctx context.Context, kind string, doc *ContentDoc, actor Actor, payload string) string {
	d := &entity.AIDraft{
		ID:          uuid.NewString(),
		Kind:        kind,
		ContentType: string(doc.Type),
		ContentID:   doc.ID,
		Payload:     payload,
		Status:      "draft",
		CreatedByID: &actor.UserID,
	}
	if err := s.Drafts.CreateDraft(ctx, d); err != nil {
		return ""
	}
	return d.ID
}

func (s *service) ListDrafts(ctx context.Context, actor Actor, contentType string, contentID uint, kind string) ([]*entity.AIDraft, error) {
	doc, err := s.loadEditable(ctx, actor, contentType, contentID)
	if err != nil {
		return nil, err
	}
	return s.Drafts.ListDrafts(ctx, string(doc.Type), doc.ID, kind)
}

func (s *service) ResolveDraft(ctx context.Context, actor Actor, draftID string, accept bool) (*entity.AIDraft, error) {
	d, err := s.Drafts.GetDraft(ctx, draftID)
	if err != nil || d == nil {
		return nil, ErrNotFound
	}
	if _, err := s.loadEditable(ctx, actor, d.ContentType, d.ContentID); err != nil {
		return nil, err
	}
	if d.Status != "draft" {
		return nil, invalid("draft already resolved")
	}
	status := "rejected"
	if accept {
		status = "accepted"
	}
	if err := s.Drafts.SetDraftStatus(ctx, d.ID, status, actor.UserID); err != nil {
		return nil, err
	}
	d.Status = status
	d.ReviewedByID = &actor.UserID
	return d, nil
}
