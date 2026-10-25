package notification

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/pkg/logger"
	"go.uber.org/zap"
)

// Notice describes one notification. The in-app row is created when the user's in-app
// preference for Type is on; an email is queued when EmailTemplate is set, the user's
// email preference for Type is on, the user has not unsubscribed and the address is verified.
type Notice struct {
	UserID        uint
	Type          string
	Title         string
	Message       string
	Link          *string
	EmailTemplate string
	EmailData     map[string]interface{}
	DedupeKey     string
}

// Notifier is the narrow interface other modules (enrollment, assessment, ...) depend on.
type Notifier interface {
	Notify(ctx context.Context, n Notice) error
}

type Service interface {
	Notifier
	GetByUserID(ctx context.Context, userID uint, page, size int) ([]*entity.Notification, int64, error)
	MarkAsRead(ctx context.Context, id, userID uint) error
	MarkAllAsRead(ctx context.Context, userID uint) error
	// Create stores an in-app notification of type "general" unconditionally.
	Create(ctx context.Context, userID uint, title, message string, link *string) (*entity.Notification, error)

	GetPreferences(ctx context.Context, userID uint) (*Preferences, error)
	UpdatePreferences(ctx context.Context, userID uint, u PreferencesUpdate) (*Preferences, error)
	// UnsubscribeByToken turns off all email for the owner of the token.
	UnsubscribeByToken(ctx context.Context, token string) error
	UnsubscribeURL(ctx context.Context, userID uint) (string, error)
	QueueEmail(ctx context.Context, userID *uint, to, template, subject string, data map[string]interface{}, dedupeKey string) (bool, error)
}

type Options struct {
	AppURL     string
	APIURL     string
	MaxAttempt int
}

type service struct {
	notifRepo repository.NotificationRepository
	prefs     repository.UserPreferencesRepository
	queue     repository.EmailQueueRepository
	users     repository.UserRepository
	opts      Options
}

func NewService(notifRepo repository.NotificationRepository, prefs repository.UserPreferencesRepository, queue repository.EmailQueueRepository, users repository.UserRepository, opts Options) Service {
	if opts.MaxAttempt <= 0 {
		opts.MaxAttempt = 6
	}
	opts.AppURL = strings.TrimRight(opts.AppURL, "/")
	opts.APIURL = strings.TrimRight(opts.APIURL, "/")
	return &service{notifRepo: notifRepo, prefs: prefs, queue: queue, users: users, opts: opts}
}

func (s *service) GetByUserID(ctx context.Context, userID uint, page, size int) ([]*entity.Notification, int64, error) {
	return s.notifRepo.FindByUserID(ctx, userID, page, size)
}

func (s *service) MarkAsRead(ctx context.Context, id, userID uint) error {
	return s.notifRepo.MarkAsRead(ctx, id, userID)
}

func (s *service) MarkAllAsRead(ctx context.Context, userID uint) error {
	return s.notifRepo.MarkAllAsRead(ctx, userID)
}

func (s *service) Create(ctx context.Context, userID uint, title, message string, link *string) (*entity.Notification, error) {
	n := &entity.Notification{UserID: userID, Type: TypeGeneral, Title: title, Message: message, Read: false, Link: link}
	if err := s.notifRepo.Create(ctx, n); err != nil {
		return nil, fmt.Errorf("failed to create notification: %w", err)
	}
	return n, nil
}

func (s *service) loadPrefs(ctx context.Context, userID uint) *entity.UserPreferences {
	p, err := s.prefs.Find(ctx, userID)
	if err != nil {
		return DefaultPreferences(userID)
	}
	return p
}

func (s *service) Notify(ctx context.Context, n Notice) error {
	if n.UserID == 0 {
		return nil
	}
	if n.Type == "" {
		n.Type = TypeGeneral
	}
	prefs := s.loadPrefs(ctx, n.UserID)
	var firstErr error
	if inAppEnabled(prefs, n.Type) {
		row := &entity.Notification{UserID: n.UserID, Type: n.Type, Title: n.Title, Message: n.Message, Link: n.Link}
		if err := s.notifRepo.Create(ctx, row); err != nil {
			firstErr = fmt.Errorf("failed to create notification: %w", err)
		}
	}
	if n.EmailTemplate != "" && emailEnabled(prefs, n.Type) {
		if err := s.queueForUser(ctx, prefs, n); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func (s *service) queueForUser(ctx context.Context, prefs *entity.UserPreferences, n Notice) error {
	u, err := s.users.FindByID(ctx, n.UserID)
	if err != nil || !u.EmailVerified || u.Status != entity.UserStatusActive {
		return nil
	}
	data := map[string]interface{}{"name": u.Name, "title": n.Title, "message": n.Message}
	if n.Link != nil {
		data["link"] = s.absolute(*n.Link)
	}
	for k, v := range n.EmailData {
		data[k] = v
	}
	if url, err := s.unsubscribeURL(ctx, prefs); err == nil {
		data["unsubscribe_url"] = url
	}
	uid := u.ID
	_, err = s.QueueEmail(ctx, &uid, u.Email, n.EmailTemplate, "", data, n.DedupeKey)
	return err
}

func (s *service) absolute(link string) string {
	if strings.HasPrefix(link, "/") {
		return s.opts.AppURL + link
	}
	return link
}

func (s *service) unsubscribeURL(ctx context.Context, prefs *entity.UserPreferences) (string, error) {
	if prefs.UnsubscribeToken == nil {
		b := make([]byte, 32)
		if _, err := rand.Read(b); err != nil {
			return "", err
		}
		tok := hex.EncodeToString(b)
		prefs.UnsubscribeToken = &tok
		if err := s.prefs.Save(ctx, prefs); err != nil {
			prefs.UnsubscribeToken = nil
			return "", err
		}
	}
	return s.opts.APIURL + "/api/notifications/unsubscribe?token=" + *prefs.UnsubscribeToken, nil
}

func (s *service) UnsubscribeURL(ctx context.Context, userID uint) (string, error) {
	return s.unsubscribeURL(ctx, s.loadPrefs(ctx, userID))
}

func (s *service) QueueEmail(ctx context.Context, userID *uint, to, template, subject string, data map[string]interface{}, dedupeKey string) (bool, error) {
	item := &entity.EmailQueueItem{
		UserID: userID, ToEmail: to, Template: template, Subject: subject, Data: data,
		Status: entity.EmailStatusPending, MaxAttempts: s.opts.MaxAttempt, NextAttemptAt: time.Now(),
	}
	if dedupeKey != "" {
		item.DedupeKey = &dedupeKey
	}
	return s.queue.Enqueue(ctx, item)
}

func (s *service) GetPreferences(ctx context.Context, userID uint) (*Preferences, error) {
	return toView(s.loadPrefs(ctx, userID)), nil
}

func (s *service) UpdatePreferences(ctx context.Context, userID uint, u PreferencesUpdate) (*Preferences, error) {
	p := s.loadPrefs(ctx, userID)
	if err := applyUpdate(p, u); err != nil {
		return nil, err
	}
	p.UpdatedAt = time.Now()
	if err := s.prefs.Save(ctx, p); err != nil {
		return nil, err
	}
	return toView(p), nil
}

func (s *service) UnsubscribeByToken(ctx context.Context, token string) error {
	if len(token) != 64 {
		return repository.ErrNotFound
	}
	p, err := s.prefs.FindByUnsubscribeToken(ctx, token)
	if err != nil {
		return err
	}
	p.EmailUnsubscribed = true
	p.DigestFrequency = "off"
	p.UpdatedAt = time.Now()
	if err := s.prefs.Save(ctx, p); err != nil {
		return err
	}
	logger.Info("email unsubscribe", zap.Uint("userId", p.UserID))
	return nil
}
