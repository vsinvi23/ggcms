package handler

import (
	"github.com/gin-gonic/gin"
	commentsvc "github.com/serenya/go-cms/internal/application/comment"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/pagination"
	"github.com/serenya/go-cms/pkg/response"
)

type CommentHandler struct {
	service commentsvc.Service
}

func NewCommentHandler(svc commentsvc.Service) *CommentHandler {
	return &CommentHandler{service: svc}
}

// GET /api/review-comments?filters[contentType]=article&filters[contentId]=123
// Also accepts Strapi-style: filters[contentType][$eq]=article&filters[contentId][$eq]=123
func (h *CommentHandler) GetByContent(c *gin.Context) {
	contentType := c.Query("filters[contentType]")
	if contentType == "" {
		contentType = c.Query("filters[contentType][$eq]")
	}
	contentID := c.Query("filters[contentId]")
	if contentID == "" {
		contentID = c.Query("filters[contentId][$eq]")
	}
	if contentType == "" || contentID == "" {
		response.BadRequest(c, "filters[contentType] and filters[contentId] are required")
		return
	}

	comments, err := h.service.GetByContent(c.Request.Context(), contentType, contentID)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	result := make([]dto.CommentResponse, len(comments))
	for i, cm := range comments {
		result[i] = mapCommentToDTO(cm)
	}
	response.OK(c, result)
}

// POST /api/review-comments
func (h *CommentHandler) Create(c *gin.Context) {
	var req dto.CreateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	userID := middleware.GetUserID(c)
	email := middleware.GetUserEmail(c)

	comment, err := h.service.Create(c.Request.Context(), commentsvc.CreateRequest{
		Content:     req.Data.Content,
		ContentType: req.Data.ContentType,
		ContentID:   req.Data.ContentID,
		AuthorID:    userID,
		AuthorName:  email, // fallback; ideally fetch user name
		AuthorEmail: email,
		ParentID:    req.Data.ParentID,
	})
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.Created(c, mapCommentToDTO(comment))
}

// GET /api/review-comments/:id/replies?page=0&size=10
func (h *CommentHandler) ListReplies(c *gin.Context) {
	id := c.Param("id")
	p := pagination.FromQuery(c)

	replies, total, err := h.service.ListReplies(c.Request.Context(), id, p.Page, p.Size)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	items := make([]dto.CommentResponse, len(replies))
	for i, r := range replies {
		items[i] = mapCommentToDTO(r)
	}
	response.StrapiPaged(c, items, total, p.Page, p.Size)
}

// DELETE /api/review-comments/:id
func (h *CommentHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	userID := middleware.GetUserID(c)
	isAdmin := middleware.IsAdmin(c)

	if err := h.service.Delete(c.Request.Context(), id, userID, isAdmin); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "comment deleted"})
}

func mapCommentToDTO(cm *entity.ReviewComment) dto.CommentResponse {
	r := dto.CommentResponse{
		ID:          cm.ID.Hex(),
		Content:     cm.Content,
		ContentType: cm.ContentType,
		ContentID:   cm.ContentID,
		Author: &dto.CommentAuthor{
			ID:    cm.AuthorID,
			Name:  cm.AuthorName,
			Email: cm.AuthorEmail,
		},
		CreatedAt: cm.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
	if cm.ParentID != nil {
		s := cm.ParentID.Hex()
		r.ParentID = &s
	}
	replies := make([]dto.CommentResponse, len(cm.Replies))
	for i, rep := range cm.Replies {
		replies[i] = mapCommentToDTO(&rep)
	}
	r.Replies = replies
	return r
}
