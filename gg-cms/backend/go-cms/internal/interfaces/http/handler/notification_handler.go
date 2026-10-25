package handler

import (
	"errors"
	"fmt"
	"net/url"

	"github.com/gin-gonic/gin"
	notificationsvc "github.com/serenya/go-cms/internal/application/notification"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
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
	if err := h.service.MarkAsRead(c.Request.Context(), id, middleware.GetUserID(c)); err != nil {
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
		Type:      n.Type,
		Title:     n.Title,
		Message:   n.Message,
		Read:      n.Read,
		Link:      n.Link,
		CreatedAt: n.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

const unsubscribePage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unsubscribe</title></head>
<body><h1>%s</h1>%s</body></html>`

const invalidUnsubscribe = "<p>This unsubscribe link is invalid or expired.</p>"

// GET /api/notifications/unsubscribe?token= shows a confirmation page so link prefetchers cannot unsubscribe.
func (h *NotificationHandler) UnsubscribePage(c *gin.Context) {
	token := c.Query("token")
	if len(token) != 64 {
		c.Data(404, "text/html; charset=utf-8", []byte(fmt.Sprintf(unsubscribePage, "Link not valid", invalidUnsubscribe)))
		return
	}
	form := `<p>Stop all emails from GeekGully?</p><form method="post" action="/api/notifications/unsubscribe?token=` + url.QueryEscape(token) + `"><button type="submit">Unsubscribe</button></form>`
	c.Data(200, "text/html; charset=utf-8", []byte(fmt.Sprintf(unsubscribePage, "Unsubscribe", form)))
}

// POST /api/notifications/unsubscribe?token= is also the RFC 8058 one-click target.
func (h *NotificationHandler) Unsubscribe(c *gin.Context) {
	if err := h.service.UnsubscribeByToken(c.Request.Context(), c.Query("token")); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			c.Data(404, "text/html; charset=utf-8", []byte(fmt.Sprintf(unsubscribePage, "Link not valid", invalidUnsubscribe)))
			return
		}
		response.InternalError(c, "could not unsubscribe")
		return
	}
	c.Data(200, "text/html; charset=utf-8", []byte(fmt.Sprintf(unsubscribePage, "You are unsubscribed", "<p>You will no longer receive emails from us. You can change this any time in your notification settings.</p>")))
}
