package category

import (
	"context"
	"errors"
	"fmt"

	"github.com/gosimple/slug"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

var ErrDuplicateCategoryName = errors.New("a category with this name already exists at this level")

type Service interface {
	GetAll(ctx context.Context, page, size int) ([]*entity.Category, int64, error)
	GetByID(ctx context.Context, id uint) (*entity.Category, error)
	// GetTree returns the category tree. Virtual roots are stripped unless includeVirtual is true.
	GetTree(ctx context.Context, includeVirtual bool) ([]*entity.Category, error)
	Create(ctx context.Context, name string, parentID *uint) (*entity.Category, error)
	Update(ctx context.Context, id uint, name string, parentID *uint, requiredApprovals int) (*entity.Category, error)
	Delete(ctx context.Context, id uint) error
	// GetReviewerGroups returns all reviewer groups linked to a category.
	GetReviewerGroups(ctx context.Context, categoryID uint) ([]entity.Group, error)
	// AddReviewerGroup links a group to a category (idempotent).
	AddReviewerGroup(ctx context.Context, categoryID, groupID uint) error
	// RemoveReviewerGroup unlinks a group from a category.
	RemoveReviewerGroup(ctx context.Context, categoryID, groupID uint) error
	// GetReviewers returns all users from every reviewer group linked to the category (deduped).
	GetReviewers(ctx context.Context, categoryID uint) ([]*entity.User, error)
	// GetGroupCategories returns all non-virtual categories where the given group is a reviewer.
	GetGroupCategories(ctx context.Context, groupID uint) ([]*entity.Category, error)
}

type service struct {
	categoryRepo repository.CategoryRepository
	groupRepo    repository.GroupRepository
}

func NewService(categoryRepo repository.CategoryRepository, groupRepo repository.GroupRepository) Service {
	return &service{categoryRepo: categoryRepo, groupRepo: groupRepo}
}

func (s *service) GetAll(ctx context.Context, page, size int) ([]*entity.Category, int64, error) {
	return s.categoryRepo.FindAll(ctx, page, size)
}

func (s *service) GetByID(ctx context.Context, id uint) (*entity.Category, error) {
	return s.categoryRepo.FindByID(ctx, id)
}

func (s *service) GetTree(ctx context.Context, includeVirtual bool) ([]*entity.Category, error) {
	return s.categoryRepo.FindTree(ctx, includeVirtual)
}

func (s *service) Create(ctx context.Context, name string, parentID *uint) (*entity.Category, error) {
	// Auto-parent to the virtual root ("geek") when no explicit parent is given.
	// This ensures every user-created category is a child of the virtual root,
	// so assigning a reviewer group to "geek" covers all categories.
	if parentID == nil {
		root, rootErr := s.categoryRepo.FindVirtualRoot(ctx)
		if rootErr == nil && root != nil {
			parentID = &root.ID
		}
	}

	exists, err := s.categoryRepo.ExistsByNameAndParent(ctx, name, parentID, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to check category name: %w", err)
	}
	if exists {
		return nil, ErrDuplicateCategoryName
	}
	slugStr := s.uniqueSlug(ctx, slug.Make(name))
	cat := &entity.Category{
		Name:     name,
		Slug:     slugStr,
		ParentID: parentID,
	}
	if err := s.categoryRepo.Create(ctx, cat); err != nil {
		return nil, fmt.Errorf("failed to create category: %w", err)
	}
	return cat, nil
}

func (s *service) Update(ctx context.Context, id uint, name string, parentID *uint, requiredApprovals int) (*entity.Category, error) {
	cat, err := s.categoryRepo.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("category not found: %w", err)
	}

	exists, err := s.categoryRepo.ExistsByNameAndParent(ctx, name, parentID, &id)
	if err != nil {
		return nil, fmt.Errorf("failed to check category name: %w", err)
	}
	if exists {
		return nil, ErrDuplicateCategoryName
	}

	if cat.Name != name {
		cat.Slug = s.uniqueSlug(ctx, slug.Make(name))
	}
	cat.Name = name
	cat.ParentID = parentID
	if requiredApprovals >= 1 {
		cat.RequiredApprovals = requiredApprovals
	}

	if err := s.categoryRepo.Update(ctx, cat); err != nil {
		return nil, fmt.Errorf("failed to update category: %w", err)
	}
	return cat, nil
}

func (s *service) Delete(ctx context.Context, id uint) error {
	return s.categoryRepo.Delete(ctx, id)
}

func (s *service) GetReviewerGroups(ctx context.Context, categoryID uint) ([]entity.Group, error) {
	return s.categoryRepo.FindReviewerGroups(ctx, categoryID)
}

func (s *service) AddReviewerGroup(ctx context.Context, categoryID, groupID uint) error {
	return s.categoryRepo.AddReviewerGroup(ctx, categoryID, groupID)
}

func (s *service) RemoveReviewerGroup(ctx context.Context, categoryID, groupID uint) error {
	return s.categoryRepo.RemoveReviewerGroup(ctx, categoryID, groupID)
}

func (s *service) GetReviewers(ctx context.Context, categoryID uint) ([]*entity.User, error) {
	groups, err := s.categoryRepo.FindReviewerGroups(ctx, categoryID)
	if err != nil {
		return nil, err
	}
	seen := make(map[uint]struct{})
	var users []*entity.User
	for _, g := range groups {
		members, err := s.groupRepo.FindMembers(ctx, g.ID)
		if err != nil {
			continue
		}
		for _, u := range members {
			if _, exists := seen[u.ID]; !exists {
				seen[u.ID] = struct{}{}
				users = append(users, u)
			}
		}
	}
	return users, nil
}

func (s *service) GetGroupCategories(ctx context.Context, groupID uint) ([]*entity.Category, error) {
	return s.categoryRepo.FindByReviewerGroupID(ctx, groupID)
}

// uniqueSlug ensures slug uniqueness by appending a counter if needed.
func (s *service) uniqueSlug(ctx context.Context, base string) string {
	candidate := base
	for i := 1; ; i++ {
		existing, _ := s.categoryRepo.FindBySlug(ctx, candidate)
		if existing == nil {
			return candidate
		}
		candidate = fmt.Sprintf("%s-%d", base, i)
	}
}
