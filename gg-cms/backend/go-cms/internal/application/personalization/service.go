package personalization

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

// RecommendedItem is a scored content result returned by GetRecommendations.
type RecommendedItem struct {
	ID          uint    `json:"id"`
	PublicID    string  `json:"publicId"`
	Title       string  `json:"title"`
	Description *string `json:"description"`
	Thumbnail   *string `json:"thumbnailUrl"`
	CategoryID  *uint   `json:"categoryId"`
	ContentType string  `json:"contentType"` // "article" | "course"
	Score       int     `json:"score"`
}

type CreateProfileRequest struct {
	Name                 string
	ExperienceLevel      entity.ExperienceLevel
	RoleType             entity.RoleType
	LearningGoals        *string
	InterestedTagIDs     []int64
	PreferredCategoryIDs []int64
}

type UpsertProfileRequest struct {
	Name                 string
	ExperienceLevel      entity.ExperienceLevel
	RoleType             entity.RoleType
	LearningGoals        *string
	OnboardingCompleted  bool
	InterestedTagIDs     []int64
	PreferredCategoryIDs []int64
}

type Service interface {
	GetProfile(ctx context.Context, userID uint) (*entity.UserProfile, error)
	UpsertProfile(ctx context.Context, userID uint, req UpsertProfileRequest) (*entity.UserProfile, error)
	ListProfiles(ctx context.Context, userID uint) ([]*entity.UserProfile, error)
	CreateProfile(ctx context.Context, userID uint, req CreateProfileRequest) (*entity.UserProfile, error)
	SetActiveProfile(ctx context.Context, userID, profileID uint) (*entity.UserProfile, error)
	GetRecommendations(ctx context.Context, userID uint, limit int) ([]RecommendedItem, error)
}

type service struct {
	profileRepo repository.UserProfileRepository
	articleRepo repository.ArticleRepository
	courseRepo  repository.CourseRepository
	enrollRepo  repository.EnrollmentRepository
	tagRepo     repository.TagRepository
}

func NewService(
	profileRepo repository.UserProfileRepository,
	articleRepo repository.ArticleRepository,
	courseRepo repository.CourseRepository,
	enrollRepo repository.EnrollmentRepository,
	tagRepo repository.TagRepository,
) Service {
	return &service{
		profileRepo: profileRepo,
		articleRepo: articleRepo,
		courseRepo:  courseRepo,
		enrollRepo:  enrollRepo,
		tagRepo:     tagRepo,
	}
}

func (s *service) GetProfile(ctx context.Context, userID uint) (*entity.UserProfile, error) {
	profile, err := s.profileRepo.FindDefaultByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if profile == nil {
		return &entity.UserProfile{
			UserID:               userID,
			ExperienceLevel:      entity.ExperienceBeginner,
			RoleType:             entity.RoleLearner,
			OnboardingCompleted:  false,
			InterestedTagIDs:     []int64{},
			PreferredCategoryIDs: []int64{},
		}, nil
	}
	return profile, nil
}

func (s *service) UpsertProfile(ctx context.Context, userID uint, req UpsertProfileRequest) (*entity.UserProfile, error) {
	tagIDs := req.InterestedTagIDs
	if tagIDs == nil {
		tagIDs = []int64{}
	}
	catIDs := req.PreferredCategoryIDs
	if catIDs == nil {
		catIDs = []int64{}
	}
	name := req.Name
	if name == "" {
		name = "Default"
	}
	profile := &entity.UserProfile{
		UserID:               userID,
		Name:                 name,
		ExperienceLevel:      req.ExperienceLevel,
		RoleType:             req.RoleType,
		LearningGoals:        req.LearningGoals,
		OnboardingCompleted:  req.OnboardingCompleted,
		InterestedTagIDs:     tagIDs,
		PreferredCategoryIDs: catIDs,
	}
	if err := s.profileRepo.Upsert(ctx, profile); err != nil {
		return nil, fmt.Errorf("upsert profile: %w", err)
	}
	return s.profileRepo.FindDefaultByUserID(ctx, userID)
}

func (s *service) ListProfiles(ctx context.Context, userID uint) ([]*entity.UserProfile, error) {
	return s.profileRepo.FindAllByUserID(ctx, userID)
}

func (s *service) CreateProfile(ctx context.Context, userID uint, req CreateProfileRequest) (*entity.UserProfile, error) {
	tagIDs := req.InterestedTagIDs
	if tagIDs == nil {
		tagIDs = []int64{}
	}
	catIDs := req.PreferredCategoryIDs
	if catIDs == nil {
		catIDs = []int64{}
	}
	name := req.Name
	if name == "" {
		name = "Profile"
	}
	profile := &entity.UserProfile{
		UserID:               userID,
		Name:                 name,
		IsDefault:            false,
		ExperienceLevel:      req.ExperienceLevel,
		RoleType:             req.RoleType,
		LearningGoals:        req.LearningGoals,
		OnboardingCompleted:  true,
		InterestedTagIDs:     tagIDs,
		PreferredCategoryIDs: catIDs,
	}
	if err := s.profileRepo.Create(ctx, profile); err != nil {
		return nil, fmt.Errorf("create profile: %w", err)
	}
	return profile, nil
}

func (s *service) SetActiveProfile(ctx context.Context, userID, profileID uint) (*entity.UserProfile, error) {
	if err := s.profileRepo.SetDefault(ctx, userID, profileID); err != nil {
		return nil, fmt.Errorf("set active profile: %w", err)
	}
	return s.profileRepo.FindDefaultByUserID(ctx, userID)
}

// GetRecommendations returns top-N content items ranked by profile affinity.
//
// Scoring (additive):
//
//	+4 per matching preferred category
//	+3 per matching interested tag (via category → tags join)
//	-10 if already enrolled (deprioritise content already being studied)
func (s *service) GetRecommendations(ctx context.Context, userID uint, limit int) ([]RecommendedItem, error) {
	if limit <= 0 {
		limit = 10
	}

	profile, err := s.GetProfile(ctx, userID)
	if err != nil {
		return nil, err
	}

	published := entity.CMSStatusPublished
	articles, _, err := s.articleRepo.FindAll(ctx, repository.ArticleFilter{Status: &published}, 0, 200)
	if err != nil {
		return nil, fmt.Errorf("fetch articles: %w", err)
	}
	courses, _, err := s.courseRepo.FindAll(ctx, repository.CourseFilter{Status: &published}, 0, 200)
	if err != nil {
		return nil, fmt.Errorf("fetch courses: %w", err)
	}

	preferredCatSet := toSet(profile.PreferredCategoryIDs)
	interestedTagSet := toSet(profile.InterestedTagIDs)
	catTagMap, err := s.buildCategoryTagMap(ctx, articles, courses)
	if err != nil {
		return nil, err
	}
	enrolledSet, err := s.enrolledCourseIDs(ctx, userID)
	if err != nil {
		return nil, err
	}

	candidates := make([]RecommendedItem, 0, len(articles)+len(courses))

	for _, a := range articles {
		score := scoreItem(a.CategoryID, preferredCatSet, interestedTagSet, catTagMap, 0)
		candidates = append(candidates, RecommendedItem{
			ID:          a.ID,
			PublicID:    a.PublicID,
			Title:       a.Title,
			Description: a.Description,
			Thumbnail:   a.ThumbnailURL,
			CategoryID:  a.CategoryID,
			ContentType: "article",
			Score:       score,
		})
	}

	for _, c := range courses {
		penalty := 0
		if _, enrolled := enrolledSet[c.ID]; enrolled {
			penalty = -10
		}
		score := scoreItem(c.CategoryID, preferredCatSet, interestedTagSet, catTagMap, penalty)
		candidates = append(candidates, RecommendedItem{
			ID:          c.ID,
			PublicID:    c.PublicID,
			Title:       c.Title,
			Description: c.Description,
			Thumbnail:   c.ThumbnailURL,
			CategoryID:  c.CategoryID,
			ContentType: "course",
			Score:       score,
		})
	}

	sortByScore(candidates)

	if limit > len(candidates) {
		limit = len(candidates)
	}
	return candidates[:limit], nil
}

func scoreItem(
	categoryID *uint,
	preferredCats map[int64]struct{},
	interestedTags map[int64]struct{},
	catTagMap map[uint]map[int64]struct{},
	penalty int,
) int {
	total := penalty
	if categoryID == nil {
		return total
	}
	if _, ok := preferredCats[int64(*categoryID)]; ok {
		total += 4
	}
	if tagSet, ok := catTagMap[*categoryID]; ok {
		for tagID := range interestedTags {
			if _, hasTag := tagSet[tagID]; hasTag {
				total += 3
			}
		}
	}
	return total
}

func (s *service) buildCategoryTagMap(ctx context.Context, articles []*entity.Article, courses []*entity.Course) (map[uint]map[int64]struct{}, error) {
	catIDSet := make(map[uint]struct{})
	for _, a := range articles {
		if a.CategoryID != nil {
			catIDSet[*a.CategoryID] = struct{}{}
		}
	}
	for _, c := range courses {
		if c.CategoryID != nil {
			catIDSet[*c.CategoryID] = struct{}{}
		}
	}

	result := make(map[uint]map[int64]struct{}, len(catIDSet))
	for catID := range catIDSet {
		tags, err := s.tagRepo.GetCategoryTags(ctx, catID)
		if err != nil {
			return nil, fmt.Errorf("fetch category tags for %d: %w", catID, err)
		}
		tagSet := make(map[int64]struct{}, len(tags))
		for _, t := range tags {
			tagSet[int64(t.ID)] = struct{}{}
		}
		result[catID] = tagSet
	}
	return result, nil
}

func (s *service) enrolledCourseIDs(ctx context.Context, userID uint) (map[uint]struct{}, error) {
	enrollments, err := s.enrollRepo.FindByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("fetch enrollments: %w", err)
	}
	set := make(map[uint]struct{}, len(enrollments))
	for _, e := range enrollments {
		set[e.CourseID] = struct{}{}
	}
	return set, nil
}

func toSet(ids []int64) map[int64]struct{} {
	s := make(map[int64]struct{}, len(ids))
	for _, id := range ids {
		s[id] = struct{}{}
	}
	return s
}

// sortByScore sorts items descending by Score (insertion sort — list is small, ≤400).
func sortByScore(items []RecommendedItem) {
	for i := 1; i < len(items); i++ {
		key := items[i]
		j := i - 1
		for j >= 0 && items[j].Score < key.Score {
			items[j+1] = items[j]
			j--
		}
		items[j+1] = key
	}
}
