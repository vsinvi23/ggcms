package comment

import (
	"context"
	"errors"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type CreateRequest struct {
	Content     string
	ContentType string
	ContentID   string
	AuthorID    uint
	AuthorName  string
	AuthorEmail string
	ParentID    *string // hex ObjectID string, nil for top-level
}

type Service interface {
	GetByContent(ctx context.Context, contentType, contentID string) ([]*entity.ReviewComment, error)
	ListReplies(ctx context.Context, parentID string, page, size int) ([]*entity.ReviewComment, int64, error)
	Create(ctx context.Context, req CreateRequest) (*entity.ReviewComment, error)
	Delete(ctx context.Context, id string, requesterID uint, isAdmin bool) error
}

type service struct {
	commentRepo repository.CommentRepository
}

func NewService(commentRepo repository.CommentRepository) Service {
	return &service{commentRepo: commentRepo}
}

func (s *service) GetByContent(ctx context.Context, contentType, contentID string) ([]*entity.ReviewComment, error) {
	return s.commentRepo.FindByContentTypeAndID(ctx, contentType, contentID)
}

func (s *service) ListReplies(ctx context.Context, parentID string, page, size int) ([]*entity.ReviewComment, int64, error) {
	if size <= 0 {
		size = 10
	}
	if page < 0 {
		page = 0
	}
	return s.commentRepo.FindReplies(ctx, parentID, page*size, size)
}

func (s *service) Create(ctx context.Context, req CreateRequest) (*entity.ReviewComment, error) {
	comment := entity.ReviewComment{
		Content:     req.Content,
		ContentType: req.ContentType,
		ContentID:   req.ContentID,
		AuthorID:    req.AuthorID,
		AuthorName:  req.AuthorName,
		AuthorEmail: req.AuthorEmail,
	}

	if req.ParentID != nil {
		// Delegate ID assignment and ParentID wiring to the repository.
		reply, err := s.commentRepo.AddReply(ctx, *req.ParentID, comment)
		if err != nil {
			return nil, fmt.Errorf("failed to add reply: %w", err)
		}
		return reply, nil
	}

	if err := s.commentRepo.Create(ctx, &comment); err != nil {
		return nil, fmt.Errorf("failed to create comment: %w", err)
	}
	return &comment, nil
}

func (s *service) Delete(ctx context.Context, id string, requesterID uint, isAdmin bool) error {
	comment, err := s.commentRepo.FindByID(ctx, id)
	if err != nil {
		return fmt.Errorf("comment not found: %w", err)
	}

	if !isAdmin && comment.AuthorID != requesterID {
		return errors.New("not authorized to delete this comment")
	}

	return s.commentRepo.Delete(ctx, id)
}
