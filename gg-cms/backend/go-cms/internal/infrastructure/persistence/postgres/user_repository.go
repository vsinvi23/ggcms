package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

type userRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewUserRepository(write, read *gorm.DB) repository.UserRepository {
	return &userRepository{write: write, read: read}
}

func (r *userRepository) Create(ctx context.Context, user *entity.User) error {
	return r.write.WithContext(ctx).Create(user).Error
}

func (r *userRepository) Update(ctx context.Context, user *entity.User) error {
	return r.write.WithContext(ctx).Save(user).Error
}

func (r *userRepository) Delete(ctx context.Context, id uint) error {
	return r.write.WithContext(ctx).Delete(&entity.User{}, id).Error
}

func (r *userRepository) UpdateLastLogin(ctx context.Context, id uint, t time.Time) error {
	return r.write.WithContext(ctx).Model(&entity.User{}).Where("id = ?", id).
		Update("last_login", t).Error
}

func (r *userRepository) SetStatus(ctx context.Context, id uint, status entity.UserStatus) error {
	return r.write.WithContext(ctx).Model(&entity.User{}).Where("id = ?", id).
		Update("status", status).Error
}

func (r *userRepository) FindByID(ctx context.Context, id uint) (*entity.User, error) {
	var user entity.User
	err := r.read.WithContext(ctx).Preload("Groups").First(&user, id).Error
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}
	return &user, nil
}

func (r *userRepository) FindByEmail(ctx context.Context, email string) (*entity.User, error) {
	var user entity.User
	err := r.read.WithContext(ctx).Where("email = ?", email).First(&user).Error
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}
	return &user, nil
}

func (r *userRepository) FindAll(ctx context.Context, page, size int) ([]*entity.User, int64, error) {
	var users []*entity.User
	var total int64

	db := r.read.WithContext(ctx).Model(&entity.User{})
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := db.Preload("Groups").Offset(page * size).Limit(size).
		Order("created_at DESC").Find(&users).Error
	return users, total, err
}

func (r *userRepository) FindByGoogleID(ctx context.Context, googleID string) (*entity.User, error) {
	var user entity.User
	err := r.read.WithContext(ctx).Preload("Groups").
		Where("google_id = ?", googleID).First(&user).Error
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}
	return &user, nil
}

func (r *userRepository) FindByGitHubID(ctx context.Context, githubID string) (*entity.User, error) {
	var user entity.User
	err := r.read.WithContext(ctx).Preload("Groups").
		Where("github_id = ?", githubID).First(&user).Error
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}
	return &user, nil
}

func (r *userRepository) UpdateOAuthID(ctx context.Context, userID uint, provider, providerID string) error {
	col := "google_id"
	if provider == "github" {
		col = "github_id"
	}
	return r.write.WithContext(ctx).Model(&entity.User{}).
		Where("id = ?", userID).Update(col, providerID).Error
}
