package postgres

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

type passwordResetTokenRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewPasswordResetTokenRepository(write, read *gorm.DB) repository.PasswordResetTokenRepository {
	return &passwordResetTokenRepository{write: write, read: read}
}

func (r *passwordResetTokenRepository) Create(ctx context.Context, token *entity.PasswordResetToken) error {
	if token.ID == "" {
		token.ID = uuid.New().String()
	}
	return r.write.WithContext(ctx).Create(token).Error
}

func (r *passwordResetTokenRepository) FindValidByHash(ctx context.Context, tokenHash string) (*entity.PasswordResetToken, error) {
	var token entity.PasswordResetToken
	err := r.read.WithContext(ctx).
		Where("token_hash = ? AND used_at IS NULL AND expires_at > ?", tokenHash, time.Now()).
		First(&token).Error
	if err != nil {
		return nil, err
	}
	return &token, nil
}

func (r *passwordResetTokenRepository) MarkUsed(ctx context.Context, id string) error {
	res := r.write.WithContext(ctx).Model(&entity.PasswordResetToken{}).
		Where("id = ? AND used_at IS NULL", id).
		Update("used_at", time.Now())
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return repository.ErrNotFound
	}
	return nil
}

func (r *passwordResetTokenRepository) InvalidateForUser(ctx context.Context, userID uint) error {
	return r.write.WithContext(ctx).Model(&entity.PasswordResetToken{}).
		Where("user_id = ? AND used_at IS NULL", userID).
		Update("used_at", time.Now()).Error
}
