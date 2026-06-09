package engagement

import (
	"context"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

// HighlightService manages user text highlights within content bodies.
type HighlightService interface {
	Create(ctx context.Context, userID uint, contentType string, contentID uint, text string, startOffset, endOffset int, color, note, contentTitle, contentSlug string) (*entity.Highlight, error)
	List(ctx context.Context, userID uint, contentType string, contentID uint) ([]*entity.Highlight, error)
	// ListUserHighlights returns all highlights across all content for a user, for My Learning.
	ListUserHighlights(ctx context.Context, userID uint, page, size int) ([]*entity.Highlight, int64, error)
	// Update updates the note and/or color of an existing highlight.
	Update(ctx context.Context, id string, userID uint, note string, color string) error
	Delete(ctx context.Context, id string, userID uint) error
}

type highlightService struct {
	highlightRepo repository.HighlightRepository
}

func NewHighlightService(highlightRepo repository.HighlightRepository) HighlightService {
	return &highlightService{highlightRepo: highlightRepo}
}

func (s *highlightService) Create(ctx context.Context, userID uint, contentType string, contentID uint, text string, startOffset, endOffset int, color, note, contentTitle, contentSlug string) (*entity.Highlight, error) {
	if color == "" {
		color = "yellow"
	}
	h := &entity.Highlight{
		UserID:       userID,
		ContentType:  contentType,
		ContentID:    contentID,
		ContentTitle: contentTitle,
		ContentSlug:  contentSlug,
		Text:         text,
		StartOffset:  startOffset,
		EndOffset:    endOffset,
		Color:        color,
		Note:         note,
	}
	if err := s.highlightRepo.Create(ctx, h); err != nil {
		return nil, err
	}
	return h, nil
}

func (s *highlightService) Update(ctx context.Context, id string, userID uint, note string, color string) error {
	return s.highlightRepo.Update(ctx, id, userID, note, color)
}

func (s *highlightService) List(ctx context.Context, userID uint, contentType string, contentID uint) ([]*entity.Highlight, error) {
	return s.highlightRepo.ListByUser(ctx, userID, contentType, contentID)
}

func (s *highlightService) ListUserHighlights(ctx context.Context, userID uint, page, size int) ([]*entity.Highlight, int64, error) {
	return s.highlightRepo.ListAllByUser(ctx, userID, page, size)
}

func (s *highlightService) Delete(ctx context.Context, id string, userID uint) error {
	return s.highlightRepo.Delete(ctx, id, userID)
}
