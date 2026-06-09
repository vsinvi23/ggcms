package notification

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type Service interface {
	GetByUserID(ctx context.Context, userID uint, page, size int) ([]*entity.Notification, int64, error)
	MarkAsRead(ctx context.Context, id uint) error
	MarkAllAsRead(ctx context.Context, userID uint) error
	Create(ctx context.Context, userID uint, title, message string, link *string) (*entity.Notification, error)
}

type service struct {
	notifRepo repository.NotificationRepository
}

func NewService(notifRepo repository.NotificationRepository) Service {
	return &service{notifRepo: notifRepo}
}

func (s *service) GetByUserID(ctx context.Context, userID uint, page, size int) ([]*entity.Notification, int64, error) {
	return s.notifRepo.FindByUserID(ctx, userID, page, size)
}

func (s *service) MarkAsRead(ctx context.Context, id uint) error {
	return s.notifRepo.MarkAsRead(ctx, id)
}

func (s *service) MarkAllAsRead(ctx context.Context, userID uint) error {
	return s.notifRepo.MarkAllAsRead(ctx, userID)
}

func (s *service) Create(ctx context.Context, userID uint, title, message string, link *string) (*entity.Notification, error) {
	n := &entity.Notification{
		UserID:  userID,
		Title:   title,
		Message: message,
		Read:    false,
		Link:    link,
	}
	if err := s.notifRepo.Create(ctx, n); err != nil {
		return nil, fmt.Errorf("failed to create notification: %w", err)
	}
	return n, nil
}
