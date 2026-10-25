package ai

import (
	"context"

	commentsvc "github.com/serenya/go-cms/internal/application/comment"
)

type commentScreener struct{ svc Service }

func NewCommentScreener(svc Service) commentsvc.Screener { return &commentScreener{svc: svc} }

func (c *commentScreener) Screen(ctx context.Context, commentID, contentType, contentID string, authorID uint, text string) bool {
	out := c.svc.Screen(ctx, ModerationInput{CommentID: commentID, ContentType: contentType, ContentID: contentID, AuthorID: authorID, Text: text})
	return out.Status == StatusPending
}

func (c *commentScreener) HiddenIDs(ctx context.Context, ids []string) map[string]bool {
	return c.svc.HiddenComments(ctx, ids)
}
