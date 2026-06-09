package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type userProfileRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewUserProfileRepository(write, read *gorm.DB) repository.UserProfileRepository {
	return &userProfileRepository{write: write, read: read}
}

// Upsert uses ON CONFLICT (user_id) WHERE is_default=true to update the active profile in-place.
// The partial unique index on (user_id) WHERE is_default=true guarantees exactly one active row.
func (r *userProfileRepository) Upsert(ctx context.Context, profile *entity.UserProfile) error {
	profile.IsDefault = true
	result := r.write.WithContext(ctx).
		Clauses(clause.OnConflict{
			// The partial index idx_user_profiles_one_default covers user_id WHERE is_default=true.
			// GORM maps this via the Where clause on the conflict target.
			Where:     clause.Where{Exprs: []clause.Expression{clause.Expr{SQL: "is_default = TRUE"}}},
			Columns:   []clause.Column{{Name: "user_id"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"name", "experience_level", "role_type", "learning_goals",
				"onboarding_completed", "interested_tag_ids", "preferred_category_ids",
				"updated_at",
			}),
		}).
		Create(profile)
	if result.Error != nil {
		return fmt.Errorf("upsert user profile: %w", result.Error)
	}
	return nil
}

// Create inserts a new, non-default profile row.
func (r *userProfileRepository) Create(ctx context.Context, profile *entity.UserProfile) error {
	if err := r.write.WithContext(ctx).Create(profile).Error; err != nil {
		return fmt.Errorf("create user profile: %w", err)
	}
	return nil
}

func (r *userProfileRepository) FindDefaultByUserID(ctx context.Context, userID uint) (*entity.UserProfile, error) {
	var profile entity.UserProfile
	err := r.read.WithContext(ctx).
		Where("user_id = ? AND is_default = TRUE", userID).
		First(&profile).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("find default user profile: %w", err)
	}
	return &profile, nil
}

func (r *userProfileRepository) FindAllByUserID(ctx context.Context, userID uint) ([]*entity.UserProfile, error) {
	var profiles []*entity.UserProfile
	err := r.read.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("is_default DESC, created_at ASC").
		Find(&profiles).Error
	if err != nil {
		return nil, fmt.Errorf("find all user profiles: %w", err)
	}
	return profiles, nil
}

func (r *userProfileRepository) FindByID(ctx context.Context, id uint) (*entity.UserProfile, error) {
	var profile entity.UserProfile
	err := r.read.WithContext(ctx).First(&profile, id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("find user profile by id: %w", err)
	}
	return &profile, nil
}

// SetDefault atomically switches the active profile within a transaction.
func (r *userProfileRepository) SetDefault(ctx context.Context, userID, profileID uint) error {
	return r.write.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&entity.UserProfile{}).
			Where("user_id = ?", userID).
			Update("is_default", false).Error; err != nil {
			return fmt.Errorf("clear defaults: %w", err)
		}
		if err := tx.Model(&entity.UserProfile{}).
			Where("id = ? AND user_id = ?", profileID, userID).
			Update("is_default", true).Error; err != nil {
			return fmt.Errorf("set default: %w", err)
		}
		return nil
	})
}
