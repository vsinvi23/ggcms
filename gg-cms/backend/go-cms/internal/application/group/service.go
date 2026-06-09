package group

import (
	"context"
	"fmt"
	"os"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type Service interface {
	GetAll(ctx context.Context, page, size int) ([]*entity.Group, int64, error)
	GetByID(ctx context.Context, id uint) (*entity.Group, error)
	Create(ctx context.Context, name, role string, permissions *entity.GroupPermissions) (*entity.Group, error)
	Update(ctx context.Context, id uint, name, role string, permissions *entity.GroupPermissions) (*entity.Group, error)
	Delete(ctx context.Context, id uint) error
	GetMembers(ctx context.Context, groupID uint) ([]*entity.User, error)
	AddMember(ctx context.Context, groupID, userID uint) error
	RemoveMember(ctx context.Context, groupID, userID uint) error
}

type service struct {
	groupRepo repository.GroupRepository
	userRepo  repository.UserRepository
}

func NewService(groupRepo repository.GroupRepository, userRepo repository.UserRepository) Service {
	return &service{groupRepo: groupRepo, userRepo: userRepo}
}

func (s *service) GetAll(ctx context.Context, page, size int) ([]*entity.Group, int64, error) {
	return s.groupRepo.FindAll(ctx, page, size)
}

func (s *service) GetByID(ctx context.Context, id uint) (*entity.Group, error) {
	return s.groupRepo.FindByID(ctx, id)
}

func (s *service) Create(ctx context.Context, name, role string, permissions *entity.GroupPermissions) (*entity.Group, error) {
	if role == "" {
		role = "viewer"
	}
	perms := entity.RolePreset(role)
	if permissions != nil {
		perms = *permissions
	}
	group := &entity.Group{Name: name, Role: role, Permissions: perms}
	if err := s.groupRepo.Create(ctx, group); err != nil {
		return nil, fmt.Errorf("failed to create group: %w", err)
	}

	// After group creation succeeds, add admin user if userRepo available
	adminEmail := os.Getenv("ADMIN_EMAIL")
	if adminEmail != "" && s.userRepo != nil {
		adminUser, err := s.userRepo.FindByEmail(ctx, adminEmail)
		if err == nil {
			_ = s.groupRepo.AddMember(ctx, group.ID, adminUser.ID)
		}
	}

	return group, nil
}

func (s *service) Update(ctx context.Context, id uint, name, role string, permissions *entity.GroupPermissions) (*entity.Group, error) {
	group, err := s.groupRepo.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("group not found: %w", err)
	}
	if name != "" {
		group.Name = name
	}
	if role != "" {
		group.Role = role
		if permissions == nil {
			group.Permissions = entity.RolePreset(role)
		}
	}
	if permissions != nil {
		group.Permissions = *permissions
	}
	if err := s.groupRepo.Update(ctx, group); err != nil {
		return nil, fmt.Errorf("failed to update group: %w", err)
	}
	return group, nil
}

func (s *service) Delete(ctx context.Context, id uint) error {
	return s.groupRepo.Delete(ctx, id)
}

func (s *service) GetMembers(ctx context.Context, groupID uint) ([]*entity.User, error) {
	return s.groupRepo.FindMembers(ctx, groupID)
}

func (s *service) AddMember(ctx context.Context, groupID, userID uint) error {
	return s.groupRepo.AddMember(ctx, groupID, userID)
}

func (s *service) RemoveMember(ctx context.Context, groupID, userID uint) error {
	members, err := s.groupRepo.FindMembers(ctx, groupID)
	if err != nil {
		return fmt.Errorf("failed to fetch group members: %w", err)
	}
	if len(members) <= 1 {
		return fmt.Errorf("cannot remove last member — a group must have at least one user")
	}
	return s.groupRepo.RemoveMember(ctx, groupID, userID)
}
