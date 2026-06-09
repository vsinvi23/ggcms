package engagement

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

// ReactionSummary is the read model returned to the frontend.
type ReactionSummary struct {
	Likes    int64  `json:"likes"`
	Dislikes int64  `json:"dislikes"`
	UserVote string `json:"userVote"` // "like" | "dislike" | ""
}

// ReactionService manages per-user like/dislike reactions.
type ReactionService interface {
	React(ctx context.Context, userID uint, contentType string, contentID uint, value string) error
	Unreact(ctx context.Context, userID uint, contentType string, contentID uint) error
	GetSummary(ctx context.Context, userID uint, contentType string, contentID uint) (*ReactionSummary, error)
}

type reactionService struct {
	reactionRepo  repository.ReactionRepository
	analyticsRepo repository.AnalyticsRepository
}

func NewReactionService(reactionRepo repository.ReactionRepository, analyticsRepo repository.AnalyticsRepository) ReactionService {
	return &reactionService{
		reactionRepo:  reactionRepo,
		analyticsRepo: analyticsRepo,
	}
}

func (s *reactionService) React(ctx context.Context, userID uint, contentType string, contentID uint, value string) error {
	if value != "like" && value != "dislike" {
		return fmt.Errorf("invalid reaction value: %s", value)
	}

	r := &entity.Reaction{
		UserID:      userID,
		ContentType: contentType,
		ContentID:   contentID,
		Value:       value,
	}
	if err := s.reactionRepo.Upsert(ctx, r); err != nil {
		return err
	}

	// Track analytics event (best-effort — do not block on failure)
	contentIDStr := fmt.Sprintf("%d", contentID)
	contentTypeStr := contentType
	_ = s.analyticsRepo.TrackEvent(ctx, &entity.AnalyticsEvent{
		EventType:   "reaction",
		UserID:      &userID,
		ContentID:   &contentIDStr,
		ContentType: &contentTypeStr,
		Metadata:    map[string]interface{}{"value": value},
	})
	return nil
}

func (s *reactionService) Unreact(ctx context.Context, userID uint, contentType string, contentID uint) error {
	return s.reactionRepo.Delete(ctx, userID, contentType, contentID)
}

func (s *reactionService) GetSummary(ctx context.Context, userID uint, contentType string, contentID uint) (*ReactionSummary, error) {
	likes, dislikes, err := s.reactionRepo.CountBySentiment(ctx, contentType, contentID)
	if err != nil {
		return nil, err
	}

	userVote := ""
	if userID > 0 {
		existing, err := s.reactionRepo.FindByUser(ctx, userID, contentType, contentID)
		if err != nil {
			return nil, err
		}
		if existing != nil {
			userVote = existing.Value
		}
	}

	return &ReactionSummary{
		Likes:    likes,
		Dislikes: dislikes,
		UserVote: userVote,
	}, nil
}
