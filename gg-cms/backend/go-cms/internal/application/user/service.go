package user

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/pkg/password"
)

type Service interface {
	GetAll(ctx context.Context, page, size int) ([]*entity.User, int64, error)
	GetByID(ctx context.Context, id uint) (*entity.User, error)
	CreateUser(ctx context.Context, email, pass, name string, groupID *uint) (*entity.User, error)
	Update(ctx context.Context, id uint, name string, mobileNo *string, status *string, groupID *uint) (*entity.User, error)
	Delete(ctx context.Context, id uint) error
	Activate(ctx context.Context, id uint) error
	Deactivate(ctx context.Context, id uint) error
	GetGroups(ctx context.Context, userID uint) ([]entity.Group, error)
}

type service struct {
	userRepo  repository.UserRepository
	groupRepo repository.GroupRepository
}

func NewService(userRepo repository.UserRepository, groupRepo repository.GroupRepository) Service {
	return &service{userRepo: userRepo, groupRepo: groupRepo}
}

func (s *service) GetAll(ctx context.Context, page, size int) ([]*entity.User, int64, error) {
	return s.userRepo.FindAll(ctx, page, size)
}

func (s *service) GetByID(ctx context.Context, id uint) (*entity.User, error) {
	return s.userRepo.FindByID(ctx, id)
}

func (s *service) CreateUser(ctx context.Context, email, pass, name string, groupID *uint) (*entity.User, error) {
	hash, err := password.Hash(pass)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}
	user := &entity.User{
		Email:        email,
		PasswordHash: hash,
		Name:         name,
		Status:       entity.UserStatusActive,
	}
	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}
	if groupID != nil && *groupID > 0 {
		if err := s.groupRepo.AddMember(ctx, *groupID, user.ID); err != nil {
			// non-fatal — user created, group assignment failed
			_ = err
		}
		// Reload to get groups populated
		if loaded, err := s.userRepo.FindByID(ctx, user.ID); err == nil {
			user = loaded
		}
	}
	return user, nil
}

func (s *service) Update(ctx context.Context, id uint, name string, mobileNo *string, status *string, groupID *uint) (*entity.User, error) {
	user, err := s.userRepo.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	if name != "" {
		user.Name = name
	}
	user.MobileNo = mobileNo

	if err := s.userRepo.Update(ctx, user); err != nil {
		return nil, fmt.Errorf("failed to update user: %w", err)
	}

	// Apply status change if provided
	if status != nil {
		switch entity.UserStatus(*status) {
		case entity.UserStatusActive:
			_ = s.userRepo.SetStatus(ctx, id, entity.UserStatusActive)
		case entity.UserStatusDeactivated:
			_ = s.userRepo.SetStatus(ctx, id, entity.UserStatusDeactivated)
		}
	}

	// Re-assign group if provided: remove from all current groups, add to new one
	if groupID != nil && *groupID > 0 {
		currentGroups, _ := s.groupRepo.FindByUserID(ctx, id)
		for _, g := range currentGroups {
			_ = s.groupRepo.RemoveMember(ctx, g.ID, id)
		}
		_ = s.groupRepo.AddMember(ctx, *groupID, id)
	}

	// Reload to reflect any status/group changes
	updated, err := s.userRepo.FindByID(ctx, id)
	if err != nil {
		return user, nil
	}
	return updated, nil
}

func (s *service) Delete(ctx context.Context, id uint) error {
	return s.userRepo.Delete(ctx, id)
}

func (s *service) Activate(ctx context.Context, id uint) error {
	return s.userRepo.SetStatus(ctx, id, entity.UserStatusActive)
}

func (s *service) Deactivate(ctx context.Context, id uint) error {
	return s.userRepo.SetStatus(ctx, id, entity.UserStatusDeactivated)
}

func (s *service) GetGroups(ctx context.Context, userID uint) ([]entity.Group, error) {
	return s.groupRepo.FindByUserID(ctx, userID)
}
