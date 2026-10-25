package learnevents

import (
	"context"
	"time"

	analyticssvc "github.com/serenya/go-cms/internal/application/analytics"
	notificationsvc "github.com/serenya/go-cms/internal/application/notification"
)

const (
	EventCourseEnrolled     = "course_enrolled"
	EventLessonCompleted    = "lesson_completed"
	EventCourseCompleted    = "course_completed"
	EventQuizAttempted      = "quiz_attempted"
	EventCertificateIssued  = "certificate_issued"
	detachedTimeout         = 5 * time.Second
)

type Tracker interface {
	TrackEvent(ctx context.Context, eventType string, userID *uint, contentID, contentType *string, metadata map[string]interface{}) error
}

type Notifier interface {
	Notify(ctx context.Context, userID uint, title, message string, link *string) error
}

type NopTracker struct{}

func (NopTracker) TrackEvent(context.Context, string, *uint, *string, *string, map[string]interface{}) error {
	return nil
}

type NopNotifier struct{}

func (NopNotifier) Notify(context.Context, uint, string, string, *string) error { return nil }

type analyticsTracker struct{ svc analyticssvc.Service }

func NewTracker(svc analyticssvc.Service) Tracker {
	if svc == nil {
		return NopTracker{}
	}
	return analyticsTracker{svc: svc}
}

func (t analyticsTracker) TrackEvent(ctx context.Context, eventType string, userID *uint, contentID, contentType *string, metadata map[string]interface{}) error {
	bg, cancel := context.WithTimeout(context.WithoutCancel(ctx), detachedTimeout)
	go func() {
		defer cancel()
		_ = t.svc.TrackEvent(bg, eventType, userID, contentID, contentType, metadata)
	}()
	return nil
}

type notificationNotifier struct{ svc notificationsvc.Service }

func NewNotifier(svc notificationsvc.Service) Notifier {
	if svc == nil {
		return NopNotifier{}
	}
	return notificationNotifier{svc: svc}
}

func (n notificationNotifier) Notify(ctx context.Context, userID uint, title, message string, link *string) error {
	bg, cancel := context.WithTimeout(context.WithoutCancel(ctx), detachedTimeout)
	go func() {
		defer cancel()
		notice := notificationsvc.Notice{UserID: userID, Type: notificationsvc.TypeGeneral, Title: title, Message: message, Link: link}
		if title == "Course completed" {
			notice.Type, notice.EmailTemplate = notificationsvc.TypeCourseCompleted, notificationsvc.TplCompletion
		}
		_ = n.svc.Notify(bg, notice)
	}()
	return nil
}
