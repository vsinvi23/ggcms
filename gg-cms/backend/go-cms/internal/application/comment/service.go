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
	GetByID(ctx context.Context, id string) (*entity.ReviewComment, error)
	ListReplies(ctx context.Context, parentID string, page, size int) ([]*entity.ReviewComment, int64, error)
	Create(ctx context.Context, req CreateRequest) (*entity.ReviewComment, error)
	Delete(ctx context.Context, id string, requesterID uint, isAdmin bool) error
}

type Screener interface {
	Screen(ctx context.Context, commentID, contentType, contentID string, authorID uint, text string) (pendingReview bool)
	HiddenIDs(ctx context.Context, ids []string) map[string]bool
}

type service struct {
	commentRepo repository.CommentRepository
	screener    Screener
}

func NewService(commentRepo repository.CommentRepository) Service {
	return &service{commentRepo: commentRepo}
}

func NewServiceWithScreener(commentRepo repository.CommentRepository, screener Screener) Service {
	return &service{commentRepo: commentRepo, screener: screener}
}

func collectIDs(comments []*entity.ReviewComment, ids []string) []string {
	for _, c := range comments {
		ids = append(ids, c.ID.Hex())
		for i := range c.Replies {
			ids = collectIDs([]*entity.ReviewComment{&c.Replies[i]}, ids)
		}
	}
	return ids
}

func (s *service) visible(ctx context.Context, comments []*entity.ReviewComment) []*entity.ReviewComment {
	if s.screener == nil || len(comments) == 0 {
		return comments
	}
	hidden := s.screener.HiddenIDs(ctx, collectIDs(comments, nil))
	if len(hidden) == 0 {
		return comments
	}
	return filterHidden(comments, hidden)
}

func filterHidden(comments []*entity.ReviewComment, hidden map[string]bool) []*entity.ReviewComment {
	out := make([]*entity.ReviewComment, 0, len(comments))
	for _, c := range comments {
		if hidden[c.ID.Hex()] {
			continue
		}
		kept := c.Replies[:0:0]
		for i := range c.Replies {
			if !hidden[c.Replies[i].ID.Hex()] {
				kept = append(kept, c.Replies[i])
			}
		}
		cp := *c
		cp.Replies = kept
		out = append(out, &cp)
	}
	return out
}

func (s *service) GetByContent(ctx context.Context, contentType, contentID string) ([]*entity.ReviewComment, error) {
	comments, err := s.commentRepo.FindByContentTypeAndID(ctx, contentType, contentID)
	if err != nil {
		return nil, err
	}
	return s.visible(ctx, comments), nil
}

func (s *service) GetByID(ctx context.Context, id string) (*entity.ReviewComment, error) {
	return s.commentRepo.FindByID(ctx, id)
}

func (s *service) ListReplies(ctx context.Context, parentID string, page, size int) ([]*entity.ReviewComment, int64, error) {
	if size <= 0 {
		size = 10
	}
	if page < 0 {
		page = 0
	}
	replies, total, err := s.commentRepo.FindReplies(ctx, parentID, page*size, size)
	if err != nil {
		return nil, 0, err
	}
	return s.visible(ctx, replies), total, nil
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
		s.screen(ctx, reply)
		return reply, nil
	}

	if err := s.commentRepo.Create(ctx, &comment); err != nil {
		return nil, fmt.Errorf("failed to create comment: %w", err)
	}
	s.screen(ctx, &comment)
	return &comment, nil
}

func (s *service) screen(ctx context.Context, c *entity.ReviewComment) {
	if s.screener == nil {
		return
	}
	if s.screener.Screen(ctx, c.ID.Hex(), c.ContentType, c.ContentID, c.AuthorID, c.Content) {
		c.ModerationStatus = "pending_review"
	}
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
