package cms_test

// service_security_test.go — unit tests for reviewer-group enforcement in Approve and Reject.
//
// All tests use in-process mocks; no server or database is required.
// The central security invariant being tested:
//   - callerIsAdmin=true  → skip reviewer-group check
//   - categoryID == nil   → skip reviewer-group check (uncategorised content)
//   - categoryID != nil, no reviewer groups configured → block non-admin
//   - categoryID != nil, user not in a reviewer group  → block non-admin
//   - categoryID != nil, user IS in a reviewer group   → allow

import (
	"context"
	"strings"
	"testing"
	"time"

	cms "github.com/serenya/go-cms/internal/application/cms"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

// ─── minimal mock repositories ───────────────────────────────────────────────

// stubArticleRepo implements repository.ArticleRepository.
// Only FindByID, UpdateStatus, and SetReviewer have meaningful implementations.
type stubArticleRepo struct {
	article         *entity.Article
	findByIDErr     error
	updateStatusErr error
}

func (r *stubArticleRepo) FindByID(_ context.Context, _ uint) (*entity.Article, error) {
	if r.findByIDErr != nil {
		return nil, r.findByIDErr
	}
	if r.article != nil {
		return r.article, nil
	}
	a := &entity.Article{Status: entity.CMSStatusReview, Version: 1}
	return a, nil
}
func (r *stubArticleRepo) UpdateStatus(_ context.Context, _ uint, _ entity.CMSStatus, _ *uint, _ *string, _ *time.Time) error {
	return r.updateStatusErr
}
func (r *stubArticleRepo) SetReviewer(_ context.Context, _ uint, _ *uint) error { return nil }
func (r *stubArticleRepo) Create(_ context.Context, _ *entity.Article) error    { return nil }
func (r *stubArticleRepo) Update(_ context.Context, _ *entity.Article) error    { return nil }
func (r *stubArticleRepo) Delete(_ context.Context, _ uint) error               { return nil }
func (r *stubArticleRepo) FindByPublicID(_ context.Context, _ string) (*entity.Article, error) {
	return nil, nil
}
func (r *stubArticleRepo) FindBySlug(_ context.Context, _ string) (*entity.Article, error) {
	return nil, nil
}
func (r *stubArticleRepo) FindAll(_ context.Context, _ repository.ArticleFilter, _, _ int) ([]*entity.Article, int64, error) {
	return nil, 0, nil
}
func (r *stubArticleRepo) FindPublished(_ context.Context, _, _ int) ([]*entity.Article, int64, error) {
	return nil, 0, nil
}
func (r *stubArticleRepo) FindPublishedByCategorySlug(_ context.Context, _ string, _, _ int) ([]*entity.Article, int64, error) {
	return nil, 0, nil
}
func (r *stubArticleRepo) SaveSnapshot(_ context.Context, _ uint, _ *entity.Article) error {
	return nil
}
func (r *stubArticleRepo) ClearSnapshot(_ context.Context, _ uint) error { return nil }
func (r *stubArticleRepo) SaveReviewBaseline(_ context.Context, _ uint, _ string, _ *string, _ *string) error {
	return nil
}

// stubCategoryRepo implements repository.CategoryRepository.
// FindReviewerGroups is the only method that matters for security tests.
type stubCategoryRepo struct {
	reviewerGroups []entity.Group
	groupsErr      error
}

func (r *stubCategoryRepo) FindReviewerGroups(_ context.Context, _ uint) ([]entity.Group, error) {
	return r.reviewerGroups, r.groupsErr
}
func (r *stubCategoryRepo) Create(_ context.Context, _ *entity.Category) error { return nil }
func (r *stubCategoryRepo) Update(_ context.Context, _ *entity.Category) error { return nil }
func (r *stubCategoryRepo) Delete(_ context.Context, _ uint) error              { return nil }
func (r *stubCategoryRepo) FindByID(_ context.Context, _ uint) (*entity.Category, error) {
	return &entity.Category{RequiredApprovals: 1}, nil
}
func (r *stubCategoryRepo) FindBySlug(_ context.Context, _ string) (*entity.Category, error) {
	return nil, nil
}
func (r *stubCategoryRepo) FindAll(_ context.Context, _, _ int) ([]*entity.Category, int64, error) {
	return nil, 0, nil
}
func (r *stubCategoryRepo) FindTree(_ context.Context, _ bool) ([]*entity.Category, error) {
	return nil, nil
}
func (r *stubCategoryRepo) ExistsByNameAndParent(_ context.Context, _ string, _ *uint, _ *uint) (bool, error) {
	return false, nil
}
func (r *stubCategoryRepo) FindVirtualRoot(_ context.Context) (*entity.Category, error) {
	return nil, nil
}
func (r *stubCategoryRepo) FindByReviewerGroupID(_ context.Context, _ uint) ([]*entity.Category, error) {
	return nil, nil
}
func (r *stubCategoryRepo) AddReviewerGroup(_ context.Context, _, _ uint) error    { return nil }
func (r *stubCategoryRepo) RemoveReviewerGroup(_ context.Context, _, _ uint) error { return nil }

// stubGroupRepo implements repository.GroupRepository.
// FindByUserID is the only method that matters for security tests.
type stubGroupRepo struct {
	userGroups []entity.Group
	groupsErr  error
}

func (r *stubGroupRepo) FindByUserID(_ context.Context, _ uint) ([]entity.Group, error) {
	return r.userGroups, r.groupsErr
}
func (r *stubGroupRepo) Create(_ context.Context, _ *entity.Group) error    { return nil }
func (r *stubGroupRepo) Update(_ context.Context, _ *entity.Group) error    { return nil }
func (r *stubGroupRepo) Delete(_ context.Context, _ uint) error             { return nil }
func (r *stubGroupRepo) AddMember(_ context.Context, _, _ uint) error       { return nil }
func (r *stubGroupRepo) RemoveMember(_ context.Context, _, _ uint) error    { return nil }
func (r *stubGroupRepo) FindByID(_ context.Context, _ uint) (*entity.Group, error) { return nil, nil }
func (r *stubGroupRepo) FindByName(_ context.Context, _ string) (*entity.Group, error) {
	return nil, nil
}
func (r *stubGroupRepo) FindAll(_ context.Context, _, _ int) ([]*entity.Group, int64, error) {
	return nil, 0, nil
}
func (r *stubGroupRepo) FindMembers(_ context.Context, _ uint) ([]*entity.User, error) {
	return nil, nil
}

// stubContentReviewRepo implements repository.ContentReviewRepository.
type stubContentReviewRepo struct{}

func (r *stubContentReviewRepo) Upsert(_ context.Context, _ uint, _ string, _ uint) error {
	return nil
}
func (r *stubContentReviewRepo) Count(_ context.Context, _ uint, _ string) (int, error) {
	return 1, nil
}
func (r *stubContentReviewRepo) CountBatch(_ context.Context, _ string, _ []uint) (map[uint]int, error) {
	return nil, nil
}
func (r *stubContentReviewRepo) DeleteByContent(_ context.Context, _ uint, _ string) error {
	return nil
}

// ─── helpers ─────────────────────────────────────────────────────────────────

var catID uint = 10

// articleWithCategory returns a stub article with CategoryID set.
func articleWithCategory() *entity.Article {
	return &entity.Article{
		Status:     entity.CMSStatusReview,
		CreatedByID: 99,
		CategoryID: &catID,
		Version:    1,
	}
}

// articleNoCategory returns a stub article without a CategoryID.
func articleNoCategory() *entity.Article {
	return &entity.Article{
		Status:     entity.CMSStatusReview,
		CreatedByID: 99,
		Version:    1,
	}
}

func newService(
	artRepo repository.ArticleRepository,
	catRepo repository.CategoryRepository,
	grpRepo repository.GroupRepository,
	revRepo repository.ContentReviewRepository,
) cms.Service {
	return cms.NewService(
		artRepo,
		nil, // courseRepo
		nil, // sectionRepo
		grpRepo,
		catRepo,
		nil, // workflowEventRepo
		nil, // userRepo
		revRepo,
	)
}

// ─── Approve tests ───────────────────────────────────────────────────────────

// TestApprove_AdminBypasses verifies that callerIsAdmin=true skips the reviewer
// group check entirely even when the content is in a category with configured groups.
func TestApprove_AdminBypasses(t *testing.T) {
	groupID := uint(100)
	svc := newService(
		&stubArticleRepo{article: articleWithCategory()},
		&stubCategoryRepo{reviewerGroups: []entity.Group{{ID: groupID}}},
		&stubGroupRepo{userGroups: []entity.Group{}}, // admin is not in any group
		&stubContentReviewRepo{},
	)

	actorID := uint(1)
	err := svc.Approve(context.Background(), 1, entity.CMSTypeArticle, &actorID, true /* isAdmin */)
	if err != nil {
		t.Errorf("admin should bypass reviewer check, got error: %v", err)
	}
}

// TestApprove_NonAdmin_NoCategoryID verifies that content without a CategoryID
// can be approved by any authenticated user (no group restriction applies).
func TestApprove_NonAdmin_NoCategoryID(t *testing.T) {
	svc := newService(
		&stubArticleRepo{article: articleNoCategory()},
		&stubCategoryRepo{},
		&stubGroupRepo{userGroups: []entity.Group{}},
		&stubContentReviewRepo{},
	)

	actorID := uint(42)
	err := svc.Approve(context.Background(), 1, entity.CMSTypeArticle, &actorID, false)
	if err != nil {
		t.Errorf("content without category should be approvable by any user, got: %v", err)
	}
}

// TestApprove_NonAdmin_NoReviewerGroupsConfigured verifies that content in a category
// with NO reviewer groups configured blocks non-admin approvals.
func TestApprove_NonAdmin_NoReviewerGroupsConfigured(t *testing.T) {
	svc := newService(
		&stubArticleRepo{article: articleWithCategory()},
		&stubCategoryRepo{reviewerGroups: []entity.Group{}}, // no groups configured
		&stubGroupRepo{userGroups: []entity.Group{}},
		&stubContentReviewRepo{},
	)

	actorID := uint(42)
	err := svc.Approve(context.Background(), 1, entity.CMSTypeArticle, &actorID, false)
	if err == nil {
		t.Error("expected error: no reviewer groups configured → non-admin should be blocked")
	}
	if !strings.Contains(err.Error(), "reviewer") {
		t.Errorf("expected 'reviewer' in error, got: %v", err)
	}
}

// TestApprove_NonAdmin_NotInReviewerGroup verifies that a non-admin user who is not
// a member of any category reviewer group is blocked from approving.
func TestApprove_NonAdmin_NotInReviewerGroup(t *testing.T) {
	reviewGroupID := uint(100)
	svc := newService(
		&stubArticleRepo{article: articleWithCategory()},
		&stubCategoryRepo{reviewerGroups: []entity.Group{{ID: reviewGroupID}}},
		&stubGroupRepo{userGroups: []entity.Group{{ID: 200}}}, // user is in group 200, NOT 100
		&stubContentReviewRepo{},
	)

	actorID := uint(42)
	err := svc.Approve(context.Background(), 1, entity.CMSTypeArticle, &actorID, false)
	if err == nil {
		t.Error("expected error: user not in reviewer group → should be blocked")
	}
	if !strings.Contains(err.Error(), "reviewer") {
		t.Errorf("expected 'reviewer' in error, got: %v", err)
	}
}

// TestApprove_NonAdmin_InReviewerGroup verifies that a non-admin who belongs to
// the category's reviewer group is allowed to approve.
func TestApprove_NonAdmin_InReviewerGroup(t *testing.T) {
	reviewGroupID := uint(100)
	svc := newService(
		&stubArticleRepo{article: articleWithCategory()},
		&stubCategoryRepo{reviewerGroups: []entity.Group{{ID: reviewGroupID}}},
		&stubGroupRepo{userGroups: []entity.Group{{ID: reviewGroupID}}}, // user IS in reviewer group
		&stubContentReviewRepo{},
	)

	actorID := uint(42)
	err := svc.Approve(context.Background(), 1, entity.CMSTypeArticle, &actorID, false)
	if err != nil {
		t.Errorf("user in reviewer group should be allowed to approve, got: %v", err)
	}
}

// ─── Reject tests ────────────────────────────────────────────────────────────

// TestReject_AdminBypasses verifies that callerIsAdmin=true skips the reviewer
// group check on rejection.
func TestReject_AdminBypasses(t *testing.T) {
	groupID := uint(100)
	svc := newService(
		&stubArticleRepo{article: articleWithCategory()},
		&stubCategoryRepo{reviewerGroups: []entity.Group{{ID: groupID}}},
		&stubGroupRepo{userGroups: []entity.Group{}}, // admin not in any group
		&stubContentReviewRepo{},
	)

	err := svc.Reject(context.Background(), 1, entity.CMSTypeArticle, 1, "poor quality", true)
	if err != nil {
		t.Errorf("admin should bypass reviewer check on reject, got: %v", err)
	}
}

// TestReject_NonAdmin_NotInReviewerGroup verifies that a non-admin not in the
// category's reviewer group is blocked from rejecting.
func TestReject_NonAdmin_NotInReviewerGroup(t *testing.T) {
	reviewGroupID := uint(100)
	svc := newService(
		&stubArticleRepo{article: articleWithCategory()},
		&stubCategoryRepo{reviewerGroups: []entity.Group{{ID: reviewGroupID}}},
		&stubGroupRepo{userGroups: []entity.Group{{ID: 200}}}, // user in group 200, NOT 100
		&stubContentReviewRepo{},
	)

	err := svc.Reject(context.Background(), 1, entity.CMSTypeArticle, 42, "poor quality", false)
	if err == nil {
		t.Error("expected error: user not in reviewer group → reject should be blocked")
	}
	if !strings.Contains(err.Error(), "reviewer") {
		t.Errorf("expected 'reviewer' in error, got: %v", err)
	}
}

// TestReject_NonAdmin_InReviewerGroup verifies a reviewer in the group can reject.
func TestReject_NonAdmin_InReviewerGroup(t *testing.T) {
	reviewGroupID := uint(100)
	svc := newService(
		&stubArticleRepo{article: articleWithCategory()},
		&stubCategoryRepo{reviewerGroups: []entity.Group{{ID: reviewGroupID}}},
		&stubGroupRepo{userGroups: []entity.Group{{ID: reviewGroupID}}},
		&stubContentReviewRepo{},
	)

	err := svc.Reject(context.Background(), 1, entity.CMSTypeArticle, 42, "needs work", false)
	if err != nil {
		t.Errorf("user in reviewer group should be allowed to reject, got: %v", err)
	}
}
