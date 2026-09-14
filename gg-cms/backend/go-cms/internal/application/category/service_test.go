package category

import (
	"context"
	"testing"

	"github.com/serenya/go-cms/internal/domain/entity"
)

type mockCategoryRepo struct {
	categories []*entity.Category
}

func (m *mockCategoryRepo) Create(ctx context.Context, category *entity.Category) error {
	category.ID = uint(len(m.categories) + 1)
	m.categories = append(m.categories, category)
	return nil
}

func (m *mockCategoryRepo) Update(ctx context.Context, category *entity.Category) error { return nil }
func (m *mockCategoryRepo) Delete(ctx context.Context, id uint) error                    { return nil }
func (m *mockCategoryRepo) FindByID(ctx context.Context, id uint) (*entity.Category, error) {
	for _, c := range m.categories {
		if c.ID == id {
			return c, nil
		}
	}
	return nil, ErrDuplicateCategoryName
}

func (m *mockCategoryRepo) FindBySlug(ctx context.Context, slug string) (*entity.Category, error) {
	for _, c := range m.categories {
		if c.Slug == slug {
			return c, nil
		}
	}
	return nil, nil
}

func (m *mockCategoryRepo) FindAll(ctx context.Context, page, size int) ([]*entity.Category, int64, error) {
	return m.categories, int64(len(m.categories)), nil
}

func (m *mockCategoryRepo) FindTree(ctx context.Context, includeVirtual bool) ([]*entity.Category, error) {
	return m.categories, nil
}

func (m *mockCategoryRepo) ExistsByNameAndParent(ctx context.Context, name string, parentID *uint, excludeID *uint) (bool, error) {
	for _, c := range m.categories {
		if c.Name == name {
			return true, nil
		}
	}
	return false, nil
}

func (m *mockCategoryRepo) FindByNameOrSlug(ctx context.Context, nameOrSlug string) (*entity.Category, error) {
	clean := nameOrSlug
	for _, c := range m.categories {
		if c.Name == clean || c.Slug == clean {
			return c, nil
		}
	}
	return nil, nil
}

func (m *mockCategoryRepo) FindVirtualRoot(ctx context.Context) (*entity.Category, error) {
	return &entity.Category{ID: 1, Name: "geek", Slug: "geek", IsVirtual: true}, nil
}

func (m *mockCategoryRepo) FindByReviewerGroupID(ctx context.Context, groupID uint) ([]*entity.Category, error) {
	return nil, nil
}

func (m *mockCategoryRepo) FindReviewerGroups(ctx context.Context, categoryID uint) ([]entity.Group, error) {
	return nil, nil
}

func (m *mockCategoryRepo) AddReviewerGroup(ctx context.Context, categoryID, groupID uint) error {
	return nil
}

func (m *mockCategoryRepo) RemoveReviewerGroup(ctx context.Context, categoryID, groupID uint) error {
	return nil
}

func (m *mockCategoryRepo) GetContentCategories(ctx context.Context, contentID uint, contentType string) ([]*entity.ContentCategory, error) {
	return nil, nil
}

func (m *mockCategoryRepo) SetContentCategories(ctx context.Context, contentID uint, contentType string, categories []entity.ContentCategory) error {
	return nil
}

func TestCategoryServiceDeduplication(t *testing.T) {
	repo := &mockCategoryRepo{
		categories: []*entity.Category{
			{ID: 10, Name: "PKI & Cryptography", Slug: "pki-cryptography"},
		},
	}
	svc := NewService(repo, nil, nil)
	ctx := context.Background()

	// 1. Creating unique category succeeds
	created, err := svc.Create(ctx, "Zero Trust Architecture", nil)
	if err != nil {
		t.Fatalf("expected successful creation, got: %v", err)
	}
	if created.Name != "Zero Trust Architecture" {
		t.Fatalf("unexpected category name: %s", created.Name)
	}

	// 2. Creating system-wide duplicate slug or name fails with deduplication error
	_, dupErr := svc.Create(ctx, "PKI & Cryptography", nil)
	if dupErr == nil {
		t.Fatalf("expected duplicate error when creating existing category name, got nil")
	}
}
