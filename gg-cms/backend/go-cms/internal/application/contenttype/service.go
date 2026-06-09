package contenttype

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type CreateRequest struct {
	Kind        string
	Value       string
	Label       string
	Description string
	SortOrder   int
}

type UpdateRequest struct {
	Label       *string
	Description *string
	SortOrder   *int
}

type Service interface {
	List(ctx context.Context, kind string) ([]*entity.ContentType, error)
	Create(ctx context.Context, req CreateRequest) (*entity.ContentType, error)
	Update(ctx context.Context, id uint, req UpdateRequest) (*entity.ContentType, error)
	Delete(ctx context.Context, id uint) error
}

type service struct {
	repo repository.ContentTypeRepository
}

func NewService(repo repository.ContentTypeRepository) Service {
	return &service{repo: repo}
}

func (s *service) List(ctx context.Context, kind string) ([]*entity.ContentType, error) {
	return s.repo.FindByKind(ctx, kind)
}

func (s *service) Create(ctx context.Context, req CreateRequest) (*entity.ContentType, error) {
	ct := &entity.ContentType{
		Kind:        req.Kind,
		Value:       req.Value,
		Label:       req.Label,
		Description: req.Description,
		SortOrder:   req.SortOrder,
	}
	if err := s.repo.Create(ctx, ct); err != nil {
		return nil, fmt.Errorf("failed to create content type: %w", err)
	}
	return ct, nil
}

func (s *service) Update(ctx context.Context, id uint, req UpdateRequest) (*entity.ContentType, error) {
	ct, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if req.Label != nil {
		ct.Label = *req.Label
	}
	if req.Description != nil {
		ct.Description = *req.Description
	}
	if req.SortOrder != nil {
		ct.SortOrder = *req.SortOrder
	}
	if err := s.repo.Update(ctx, ct); err != nil {
		return nil, fmt.Errorf("failed to update content type: %w", err)
	}
	return ct, nil
}

func (s *service) Delete(ctx context.Context, id uint) error {
	return s.repo.Delete(ctx, id)
}
