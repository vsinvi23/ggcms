package tag

import (
	"context"
	"fmt"
	"strings"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type Service interface {
	GetAll(ctx context.Context) ([]*entity.Tag, error)
	Create(ctx context.Context, name string) (*entity.Tag, error)
	Delete(ctx context.Context, id uint) error
	SetCategoryTags(ctx context.Context, categoryID uint, tagIDs []uint) error
	GetCategoryTags(ctx context.Context, categoryID uint) ([]*entity.Tag, error)
}

type service struct {
	tagRepo repository.TagRepository
}

func NewService(tagRepo repository.TagRepository) Service {
	return &service{tagRepo: tagRepo}
}

func (s *service) GetAll(ctx context.Context) ([]*entity.Tag, error) {
	return s.tagRepo.FindAll(ctx)
}

func (s *service) Create(ctx context.Context, name string) (*entity.Tag, error) {
	normalised := strings.ToLower(strings.TrimSpace(name))
	if normalised == "" {
		return nil, fmt.Errorf("tag name cannot be empty")
	}
	// Return existing tag if it already exists (idempotent)
	existing, err := s.tagRepo.FindByName(ctx, normalised)
	if err == nil {
		return existing, nil
	}
	tag := &entity.Tag{Name: normalised}
	if err := s.tagRepo.Create(ctx, tag); err != nil {
		return nil, err
	}
	return tag, nil
}

func (s *service) Delete(ctx context.Context, id uint) error {
	return s.tagRepo.Delete(ctx, id)
}

func (s *service) SetCategoryTags(ctx context.Context, categoryID uint, tagIDs []uint) error {
	return s.tagRepo.SetCategoryTags(ctx, categoryID, tagIDs)
}

func (s *service) GetCategoryTags(ctx context.Context, categoryID uint) ([]*entity.Tag, error) {
	return s.tagRepo.GetCategoryTags(ctx, categoryID)
}
