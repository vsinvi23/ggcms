package auth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	jwtpkg "github.com/serenya/go-cms/pkg/jwt"
	"github.com/serenya/go-cms/pkg/password"
)

type Service interface {
	Login(ctx context.Context, email, pwd string) (token string, user *entity.User, err error)
	Register(ctx context.Context, email, pwd, name string, mobileNo *string) (token string, user *entity.User, err error)
	GetCurrentUser(ctx context.Context, userID uint) (*entity.User, error)
}

type service struct {
	userRepo   repository.UserRepository
	groupRepo  repository.GroupRepository
	jwtManager *jwtpkg.Manager
}

func NewService(userRepo repository.UserRepository, groupRepo repository.GroupRepository, jwtManager *jwtpkg.Manager) Service {
	return &service{userRepo: userRepo, groupRepo: groupRepo, jwtManager: jwtManager}
}

func (s *service) Login(ctx context.Context, email, pwd string) (string, *entity.User, error) {
	user, err := s.userRepo.FindByEmail(ctx, email)
	if err != nil {
		return "", nil, errors.New("invalid credentials")
	}

	if !password.Compare(user.PasswordHash, pwd) {
		return "", nil, errors.New("invalid credentials")
	}

	if user.Status == entity.UserStatusDeactivated || user.Status == entity.UserStatusInactive {
		return "", nil, fmt.Errorf("account is %s", user.Status)
	}

	groups, _ := s.groupRepo.FindByUserID(ctx, user.ID)
	user.Groups = groups

	role := s.resolveRole(groups)
	token, err := s.jwtManager.Generate(user.ID, user.Email, role)
	if err != nil {
		return "", nil, fmt.Errorf("failed to generate token: %w", err)
	}

	s.userRepo.UpdateLastLogin(ctx, user.ID, time.Now())
	return token, user, nil
}

func (s *service) Register(ctx context.Context, email, pwd, name string, mobileNo *string) (string, *entity.User, error) {
	existing, _ := s.userRepo.FindByEmail(ctx, email)
	if existing != nil {
		return "", nil, errors.New("email already registered")
	}

	hash, err := password.Hash(pwd)
	if err != nil {
		return "", nil, fmt.Errorf("failed to hash password: %w", err)
	}

	user := &entity.User{
		Email:        email,
		PasswordHash: hash,
		Name:         name,
		MobileNo:     mobileNo,
		Status:       entity.UserStatusActive,
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return "", nil, fmt.Errorf("failed to create user: %w", err)
	}

	token, err := s.jwtManager.Generate(user.ID, user.Email, "user")
	if err != nil {
		return "", nil, fmt.Errorf("failed to generate token: %w", err)
	}

	return token, user, nil
}

func (s *service) GetCurrentUser(ctx context.Context, userID uint) (*entity.User, error) {
	return s.userRepo.FindByID(ctx, userID)
}

// resolveRole returns "admin" if user belongs to the Admin group, otherwise "user".
func (s *service) resolveRole(groups []entity.Group) string {
	for _, g := range groups {
		if g.Name == "Admin" {
			return "admin"
		}
	}
	return "user"
}
