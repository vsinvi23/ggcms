package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	cmssvc "github.com/serenya/go-cms/internal/application/cms"
	commentsvc "github.com/serenya/go-cms/internal/application/comment"
	notificationsvc "github.com/serenya/go-cms/internal/application/notification"
	usersvc "github.com/serenya/go-cms/internal/application/user"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/logger"
	"go.uber.org/zap"
)

const maxEventBody = 64 << 10

var mentionPattern = regexp.MustCompile(`@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})`)

// NotifyEvents turns successful workflow and comment requests into notifications.
// It runs as a global middleware so it needs no changes in the CMS or comment handlers.
type NotifyEvents struct {
	notify   notificationsvc.Service
	cms      cmssvc.Service
	comments commentsvc.Service
	users    usersvc.Service
}

func NewNotifyEvents(n notificationsvc.Service, cms cmssvc.Service, comments commentsvc.Service, users usersvc.Service) *NotifyEvents {
	return &NotifyEvents{notify: n, cms: cms, comments: comments, users: users}
}

var notifyRoutes = map[string]string{
	"POST /api/cms/:id/approve":         "approved",
	"POST /api/cms/:id/send-back":       "sent_back",
	"POST /api/cms/:id/reject":          "rejected",
	"POST /api/cms/:id/publish":         "published",
	"POST /api/cms/:id/assign-reviewer": "assigned",
	"POST /api/cms/:id/submit":          "submitted",
	"POST /api/review-comments":         "comment",
}

func (h *NotifyEvents) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		kind, ok := notifyRoutes[c.Request.Method+" "+c.FullPath()]
		if !ok {
			c.Next()
			return
		}
		var body []byte
		if c.Request.Body != nil && (kind == "comment" || kind == "sent_back" || kind == "rejected") {
			body, _ = io.ReadAll(io.LimitReader(c.Request.Body, maxEventBody))
			c.Request.Body = io.NopCloser(io.MultiReader(bytes.NewReader(body), c.Request.Body))
		}
		c.Next()
		if c.Writer.Status() >= 300 {
			return
		}
		actor := middleware.GetUserID(c)
		id, _ := parseID(c, "id")
		cmsType := entity.CMSType(c.DefaultQuery("type", "ARTICLE"))
		go func() {
			defer func() { _ = recover() }()
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			if kind == "comment" {
				h.onComment(ctx, actor, body)
			} else {
				h.onWorkflow(ctx, kind, id, cmsType, actor, body)
			}
		}()
	}
}

func cmsLinks(result interface{}, cmsType entity.CMSType, id uint) (edit, public string) {
	if cmsType == entity.CMSTypeCourse {
		edit = fmt.Sprintf("/courses/%d/edit", id)
		if c, ok := result.(*entity.Course); ok && c.Slug != "" {
			public = "/course/" + c.Slug
		}
		return
	}
	edit = fmt.Sprintf("/articles/%d/edit", id)
	if a, ok := result.(*entity.Article); ok && a.Slug != "" {
		public = "/article/" + a.Slug
	}
	return
}

func (h *NotifyEvents) send(ctx context.Context, n notificationsvc.Notice) {
	if err := h.notify.Notify(ctx, n); err != nil {
		logger.Warn("notify event failed", zap.String("type", n.Type), zap.Uint("userId", n.UserID), zap.Error(err))
	}
}

func (h *NotifyEvents) onWorkflow(ctx context.Context, kind string, id uint, cmsType entity.CMSType, actor uint, body []byte) {
	result, err := h.cms.GetByID(ctx, id, cmsType)
	if err != nil {
		return
	}
	title, owner := extractCMSTitleAndOwner(result, cmsType)
	reviewer := extractCMSReviewerID(result, cmsType)
	edit, public := cmsLinks(result, cmsType, id)
	var req struct {
		Comment string `json:"comment"`
	}
	_ = json.Unmarshal(body, &req)

	switch kind {
	case "approved", "sent_back", "rejected":
		if owner == 0 || owner == actor {
			return
		}
		verb := map[string]string{"approved": "approved", "sent_back": "sent back for changes", "rejected": "rejected"}[kind]
		msg := fmt.Sprintf("%q was %s.", title, verb)
		if c := strings.TrimSpace(req.Comment); c != "" {
			msg += " Reviewer note: " + truncateRunes(c, 300)
		}
		h.send(ctx, notificationsvc.Notice{UserID: owner, Type: notificationsvc.TypeReviewDecision, Title: "Review decision: " + title, Message: msg, Link: &edit, EmailTemplate: notificationsvc.TplReviewDecision})
	case "published":
		if owner == 0 || owner == actor {
			return
		}
		link := public
		if link == "" {
			link = edit
		}
		h.send(ctx, notificationsvc.Notice{UserID: owner, Type: notificationsvc.TypeContentPublished, Title: "Published: " + title, Message: fmt.Sprintf("%q is now live.", title), Link: &link, EmailTemplate: notificationsvc.TplContentPublished})
	case "assigned", "submitted":
		if reviewer == nil || *reviewer == 0 || *reviewer == actor {
			return
		}
		h.send(ctx, notificationsvc.Notice{UserID: *reviewer, Type: notificationsvc.TypeReviewAssigned, Title: "You were assigned a review: " + title, Message: fmt.Sprintf("Please review %q.", title), Link: &edit, EmailTemplate: notificationsvc.TplReviewAssigned})
	}
}

func (h *NotifyEvents) onComment(ctx context.Context, actor uint, body []byte) {
	var req struct {
		Data struct {
			Content     string  `json:"content"`
			ContentType string  `json:"contentType"`
			ContentID   string  `json:"contentId"`
			ParentID    *string `json:"parentId"`
		} `json:"data"`
	}
	if json.Unmarshal(body, &req) != nil || req.Data.Content == "" {
		return
	}
	d := req.Data
	var link *string
	switch strings.ToLower(d.ContentType) {
	case "article":
		l := "/articles/" + d.ContentID + "/edit"
		link = &l
	case "course":
		l := "/courses/" + d.ContentID + "/edit"
		link = &l
	}
	actorName := "Someone"
	if u, err := h.users.GetByID(ctx, actor); err == nil && u.Name != "" {
		actorName = u.Name
	}
	notified := map[uint]bool{actor: true}
	snippet := truncateRunes(d.Content, 200)

	if d.ParentID != nil {
		if list, err := h.comments.GetByContent(ctx, d.ContentType, d.ContentID); err == nil {
			for _, cm := range list {
				if cm.ID.Hex() == *d.ParentID && !notified[cm.AuthorID] {
					notified[cm.AuthorID] = true
					h.send(ctx, notificationsvc.Notice{UserID: cm.AuthorID, Type: notificationsvc.TypeCommentReply, Title: actorName + " replied to your comment", Message: snippet, Link: link, EmailTemplate: notificationsvc.TplComment})
				}
			}
		}
	}
	for _, m := range mentionPattern.FindAllStringSubmatch(d.Content, 10) {
		u, err := h.users.GetByEmail(ctx, strings.ToLower(m[1]))
		if err != nil || notified[u.ID] {
			continue
		}
		notified[u.ID] = true
		h.send(ctx, notificationsvc.Notice{UserID: u.ID, Type: notificationsvc.TypeCommentMention, Title: actorName + " mentioned you in a comment", Message: snippet, Link: link, EmailTemplate: notificationsvc.TplComment})
	}
}

func truncateRunes(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n]) + "..."
	}
	return s
}
