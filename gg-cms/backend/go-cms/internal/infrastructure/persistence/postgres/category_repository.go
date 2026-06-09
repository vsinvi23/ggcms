package postgres

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

type categoryRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewCategoryRepository(write, read *gorm.DB) repository.CategoryRepository {
	return &categoryRepository{write: write, read: read}
}

func (r *categoryRepository) Create(ctx context.Context, category *entity.Category) error {
	return r.write.WithContext(ctx).Create(category).Error
}

func (r *categoryRepository) Update(ctx context.Context, category *entity.Category) error {
	return r.write.WithContext(ctx).Save(category).Error
}

func (r *categoryRepository) Delete(ctx context.Context, id uint) error {
	return r.write.WithContext(ctx).Delete(&entity.Category{}, id).Error
}

func (r *categoryRepository) FindByID(ctx context.Context, id uint) (*entity.Category, error) {
	var cat entity.Category
	err := r.read.WithContext(ctx).Preload("Children").First(&cat, id).Error
	if err != nil {
		return nil, fmt.Errorf("category not found: %w", err)
	}
	return &cat, nil
}

func (r *categoryRepository) FindBySlug(ctx context.Context, slug string) (*entity.Category, error) {
	var cat entity.Category
	err := r.read.WithContext(ctx).Where("slug = ?", slug).First(&cat).Error
	if err != nil {
		return nil, fmt.Errorf("category not found: %w", err)
	}
	return &cat, nil
}

func (r *categoryRepository) FindAll(ctx context.Context, page, size int) ([]*entity.Category, int64, error) {
	var cats []*entity.Category
	var total int64

	// Exclude virtual categories (e.g. the "geek" root) from regular listings.
	db := r.read.WithContext(ctx).Model(&entity.Category{}).Where("is_virtual = false")
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := db.Offset(page * size).Limit(size).Order("name ASC").Find(&cats).Error
	return cats, total, err
}

func (r *categoryRepository) ExistsByNameAndParent(ctx context.Context, name string, parentID *uint, excludeID *uint) (bool, error) {
	db := r.read.WithContext(ctx).Model(&entity.Category{}).Where("LOWER(name) = LOWER(?)", name)
	if parentID == nil {
		db = db.Where("parent_id IS NULL")
	} else {
		db = db.Where("parent_id = ?", *parentID)
	}
	if excludeID != nil {
		db = db.Where("id != ?", *excludeID)
	}
	var count int64
	err := db.Count(&count).Error
	return count > 0, err
}

func (r *categoryRepository) FindReviewerGroups(ctx context.Context, categoryID uint) ([]entity.Group, error) {
	var cat entity.Category
	err := r.read.WithContext(ctx).Preload("ReviewerGroups").First(&cat, categoryID).Error
	if err != nil {
		return nil, fmt.Errorf("category not found: %w", err)
	}
	return cat.ReviewerGroups, nil
}

func (r *categoryRepository) AddReviewerGroup(ctx context.Context, categoryID, groupID uint) error {
	return r.write.WithContext(ctx).Exec(
		"INSERT INTO category_reviewer_groups (category_id, group_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
		categoryID, groupID,
	).Error
}

func (r *categoryRepository) RemoveReviewerGroup(ctx context.Context, categoryID, groupID uint) error {
	return r.write.WithContext(ctx).Exec(
		"DELETE FROM category_reviewer_groups WHERE category_id = ? AND group_id = ?",
		categoryID, groupID,
	).Error
}

func (r *categoryRepository) FindTree(ctx context.Context, includeVirtual bool) ([]*entity.Category, error) {
	var roots []*entity.Category
	// Load root categories (no parent) and preload 3 levels of non-virtual children.
	err := r.read.WithContext(ctx).
		Where("parent_id IS NULL").
		Preload("Children", "is_virtual = false").
		Preload("Children.Children", "is_virtual = false").
		Preload("Children.Children.Children", "is_virtual = false").
		Order("name ASC").
		Find(&roots).Error
	if err != nil {
		return nil, err
	}

	if includeVirtual {
		return roots, nil
	}

	// Strip virtual roots and surface their children as top-level nodes.
	// This makes the "geek" root transparent to all regular consumers.
	var result []*entity.Category
	for i := range roots {
		if roots[i].IsVirtual {
			for j := range roots[i].Children {
				result = append(result, &roots[i].Children[j])
			}
		} else {
			result = append(result, roots[i])
		}
	}
	return result, nil
}

func (r *categoryRepository) FindVirtualRoot(ctx context.Context) (*entity.Category, error) {
	var cat entity.Category
	err := r.read.WithContext(ctx).
		Where("is_virtual = true AND parent_id IS NULL").
		First(&cat).Error
	if err != nil {
		return nil, fmt.Errorf("virtual root not found: %w", err)
	}
	return &cat, nil
}

func (r *categoryRepository) FindByReviewerGroupID(ctx context.Context, groupID uint) ([]*entity.Category, error) {
	var cats []*entity.Category
	err := r.read.WithContext(ctx).
		Joins("JOIN category_reviewer_groups crg ON crg.category_id = categories.id").
		Where("crg.group_id = ? AND categories.is_virtual = false", groupID).
		Order("categories.name ASC").
		Find(&cats).Error
	return cats, err
}
