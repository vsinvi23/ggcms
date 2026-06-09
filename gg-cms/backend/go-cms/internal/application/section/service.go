package section

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type CreateRequest struct {
	Title           string
	Order           int
	CourseID        *uint
	ParentSectionID *uint
}

type UpdateRequest struct {
	Title       *string
	Description *string
	Order       *int
}

type Service interface {
	Create(ctx context.Context, req CreateRequest) (*entity.Section, error)
	Update(ctx context.Context, id uint, req UpdateRequest) (*entity.Section, error)
	Delete(ctx context.Context, id uint) error
	GetByID(ctx context.Context, id uint) (*entity.Section, error)
	GetByCourseID(ctx context.Context, courseID uint) ([]*entity.Section, error)
}

type service struct {
	sectionRepo repository.SectionRepository
}

func NewService(sectionRepo repository.SectionRepository) Service {
	return &service{sectionRepo: sectionRepo}
}

func (s *service) Create(ctx context.Context, req CreateRequest) (*entity.Section, error) {
	section := &entity.Section{
		Title:           req.Title,
		Order:           req.Order,
		CourseID:        req.CourseID,
		ParentSectionID: req.ParentSectionID,
	}
	if err := s.sectionRepo.Create(ctx, section); err != nil {
		return nil, fmt.Errorf("failed to create section: %w", err)
	}
	return section, nil
}

func (s *service) Update(ctx context.Context, id uint, req UpdateRequest) (*entity.Section, error) {
	sec, err := s.sectionRepo.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("section not found: %w", err)
	}
	if req.Title != nil {
		sec.Title = *req.Title
	}
	if req.Description != nil {
		sec.Description = req.Description
	}
	if req.Order != nil {
		sec.Order = *req.Order
	}
	if err := s.sectionRepo.Update(ctx, sec); err != nil {
		return nil, fmt.Errorf("failed to update section: %w", err)
	}
	return sec, nil
}

func (s *service) Delete(ctx context.Context, id uint) error {
	return s.sectionRepo.Delete(ctx, id)
}

func (s *service) GetByID(ctx context.Context, id uint) (*entity.Section, error) {
	return s.sectionRepo.FindByID(ctx, id)
}

func (s *service) GetByCourseID(ctx context.Context, courseID uint) ([]*entity.Section, error) {
	return s.sectionRepo.FindByCourseID(ctx, courseID)
}
