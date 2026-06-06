package engagement

import (
	"context"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

// NoteService manages user-editable notes per content item.
type NoteService interface {
	Upsert(ctx context.Context, userID uint, contentType string, contentID uint, body string) (*entity.Note, error)
	Get(ctx context.Context, userID uint, contentType string, contentID uint) (*entity.Note, error)
	ListUserNotes(ctx context.Context, userID uint, page, size int) ([]*entity.Note, int64, error)
	// Delete accepts the MongoDB ObjectID hex string and the owning user's ID.
	Delete(ctx context.Context, id string, userID uint) error
}

type noteService struct {
	noteRepo repository.NoteRepository
}

func NewNoteService(noteRepo repository.NoteRepository) NoteService {
	return &noteService{noteRepo: noteRepo}
}

func (s *noteService) Upsert(ctx context.Context, userID uint, contentType string, contentID uint, body string) (*entity.Note, error) {
	n := &entity.Note{
		UserID:      userID,
		ContentType: contentType,
		ContentID:   contentID,
		Body:        body,
	}
	if err := s.noteRepo.Upsert(ctx, n); err != nil {
		return nil, err
	}
	return n, nil
}

func (s *noteService) Get(ctx context.Context, userID uint, contentType string, contentID uint) (*entity.Note, error) {
	return s.noteRepo.FindByUser(ctx, userID, contentType, contentID)
}

func (s *noteService) ListUserNotes(ctx context.Context, userID uint, page, size int) ([]*entity.Note, int64, error) {
	return s.noteRepo.ListByUser(ctx, userID, page, size)
}

func (s *noteService) Delete(ctx context.Context, id string, userID uint) error {
	return s.noteRepo.Delete(ctx, id, userID)
}
