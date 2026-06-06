package handler

import (
	"github.com/gin-gonic/gin"
	notificationsvc "github.com/serenya/go-cms/internal/application/notification"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/pagination"
	"github.com/serenya/go-cms/pkg/response"
)

type NotificationHandler struct {
	service notificationsvc.Service
}

func NewNotificationHandler(svc notificationsvc.Service) *NotificationHandler {
	return &NotificationHandler{service: svc}
}

// GET /api/notifications
func (h *NotificationHandler) GetAll(c *gin.Context) {
	userID := middleware.GetUserID(c)
	p := pagination.FromStrapiQuery(c)

	notifs, total, err := h.service.GetByUserID(c.Request.Context(), userID, p.Page, p.Size)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	items := make([]dto.NotificationResponse, len(notifs))
	for i, n := range notifs {
		items[i] = mapNotifToDTO(n)
	}
	response.StrapiPaged(c, items, total, p.Page, p.Size)
}

// PATCH /api/notifications/:id/read
func (h *NotificationHandler) MarkAsRead(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid notification ID")
		return
	}
	if err := h.service.MarkAsRead(c.Request.Context(), id); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "marked as read"})
}

// PATCH /api/notifications/read-all
func (h *NotificationHandler) MarkAllAsRead(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if err := h.service.MarkAllAsRead(c.Request.Context(), userID); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "all notifications marked as read"})
}

func mapNotifToDTO(n *entity.Notification) dto.NotificationResponse {
	return dto.NotificationResponse{
		ID:        n.ID,
		Title:     n.Title,
		Message:   n.Message,
		Read:      n.Read,
		Link:      n.Link,
		CreatedAt: n.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}
