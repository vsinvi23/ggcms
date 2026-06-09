package postgres

import (
	"context"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

type notificationRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewNotificationRepository(write, read *gorm.DB) repository.NotificationRepository {
	return &notificationRepository{write: write, read: read}
}

func (r *notificationRepository) Create(ctx context.Context, notification *entity.Notification) error {
	return r.write.WithContext(ctx).Create(notification).Error
}

func (r *notificationRepository) FindByUserID(ctx context.Context, userID uint, page, size int) ([]*entity.Notification, int64, error) {
	var notifications []*entity.Notification
	var total int64

	db := r.read.WithContext(ctx).Model(&entity.Notification{}).Where("user_id = ?", userID)
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := db.Offset(page * size).Limit(size).Order("created_at DESC").Find(&notifications).Error
	return notifications, total, err
}

func (r *notificationRepository) MarkAsRead(ctx context.Context, id uint) error {
	return r.write.WithContext(ctx).Model(&entity.Notification{}).Where("id = ?", id).
		Update("read", true).Error
}

func (r *notificationRepository) MarkAllAsRead(ctx context.Context, userID uint) error {
	return r.write.WithContext(ctx).Model(&entity.Notification{}).
		Where("user_id = ? AND read = false", userID).
		Update("read", true).Error
}
