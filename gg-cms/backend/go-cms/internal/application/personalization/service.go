package personalization

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

// RecommendedItem is a scored content result returned by GetRecommendations.
type RecommendationMode string

const (
	ModeRelated     RecommendationMode = "related"
	ModeRecommended RecommendationMode = "recommended"
	ModeNext        RecommendationMode = "next"
)

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


type RecommendationRequest struct {
	ContentID   uint               `json:"content_id"`
	ContentType string             `json:"content_type"` // "ARTICLE" | "COURSE"
	UserID      *uint              `json:"user_id,omitempty"`
	Mode        RecommendationMode `json:"mode"`
	Limit       int                `json:"limit"`
}

type CandidateSignal struct {
	SignalType  string  `json:"signal_type"` // "TOPIC_MATCH" | "RELATIONSHIP_MATCH" | "CATEGORY_MATCH"
	SignalValue float64 `json:"signal_value"`
}

type RecommendationCandidate struct {
	ContentID   uint              `json:"content_id"`
	ContentType string            `json:"content_type"`
	Signals     []CandidateSignal `json:"signals"`
}

type RecommendationExplanation struct {
	Code    string `json:"reason_code"`
	Message string `json:"reason"`
}

type RecommendationScore struct {
	ContentID   uint                      `json:"content_id"`
	ContentType string                    `json:"content_type"`
	Title       string                    `json:"title"`
	Description *string                   `json:"description,omitempty"`
	Thumbnail   *string                   `json:"thumbnail_url,omitempty"`
	Score       float64                   `json:"score"`
	ReasonCode  string                    `json:"reason_code"`
	Reason      string                    `json:"reason"`
	Explanation RecommendationExplanation `json:"-"`
}

type RecommendationResponse struct {
	ContentID       uint                  `json:"content_id"`
	Recommendations []RecommendationScore `json:"recommendations"`
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
	GetRecommendationsByRequest(ctx context.Context, req RecommendationRequest) (RecommendationResponse, error)
	GenerateTopicCandidates(ctx context.Context, req RecommendationRequest) ([]RecommendationCandidate, error)
	GenerateRelationshipCandidates(ctx context.Context, req RecommendationRequest) ([]RecommendationCandidate, error)
	GenerateCategoryCandidates(ctx context.Context, req RecommendationRequest) ([]RecommendationCandidate, error)
	RankCandidates(ctx context.Context, candidates []RecommendationCandidate, req RecommendationRequest) ([]RecommendationScore, error)
}

type service struct {
	profileRepo repository.UserProfileRepository
	articleRepo repository.ArticleRepository
	courseRepo  repository.CourseRepository
	enrollRepo  repository.EnrollmentRepository
	tagRepo     repository.TagRepository
	topicRepo   repository.TopicRepository
}

func NewService(
	profileRepo repository.UserProfileRepository,
	articleRepo repository.ArticleRepository,
	courseRepo repository.CourseRepository,
	enrollRepo repository.EnrollmentRepository,
	tagRepo repository.TagRepository,
	topicRepo repository.TopicRepository,
) Service {
	return &service{
		profileRepo: profileRepo,
		articleRepo: articleRepo,
		courseRepo:  courseRepo,
		enrollRepo:  enrollRepo,
		tagRepo:     tagRepo,
		topicRepo:   topicRepo,
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

func (s *service) GetRecommendationsByRequest(ctx context.Context, req RecommendationRequest) (RecommendationResponse, error) {
	if req.Limit <= 0 {
		req.Limit = 10
	}
	if req.Mode == "" {
		req.Mode = ModeRelated
	}

	var allCandidates []RecommendationCandidate

	// 1. Candidate Generation
	topicCands, _ := s.GenerateTopicCandidates(ctx, req)
	allCandidates = append(allCandidates, topicCands...)

	relCands, _ := s.GenerateRelationshipCandidates(ctx, req)
	allCandidates = append(allCandidates, relCands...)

	catCands, _ := s.GenerateCategoryCandidates(ctx, req)
	allCandidates = append(allCandidates, catCands...)

	// 2. Ranking & Invariants
	ranked, err := s.RankCandidates(ctx, allCandidates, req)
	if err != nil {
		return RecommendationResponse{}, err
	}

	if len(ranked) > req.Limit {
		ranked = ranked[:req.Limit]
	}

	return RecommendationResponse{
		ContentID:       req.ContentID,
		Recommendations: ranked,
	}, nil
}

// GenerateTopicCandidates finds other content sharing at least one topic with
// req.ContentID/req.ContentType, via content_topics. The candidate's SignalValue
// is the shared topic's content_topics.weight (role/weight from §4), not a flat
// constant, so a PRIMARY-topic match scores higher than a MENTIONED one.
func (s *service) GenerateTopicCandidates(ctx context.Context, req RecommendationRequest) ([]RecommendationCandidate, error) {
	if req.ContentID == 0 || req.ContentType == "" || s.topicRepo == nil {
		return nil, nil
	}

	topics, err := s.topicRepo.GetContentTopics(ctx, req.ContentID, req.ContentType)
	if err != nil || len(topics) == 0 {
		return nil, nil
	}
	topicIDs := make([]uint, len(topics))
	for i, t := range topics {
		topicIDs[i] = t.ID
	}

	entries, err := s.topicRepo.FindContentByTopicIDs(ctx, topicIDs, req.ContentID, req.ContentType, 50)
	if err != nil {
		return nil, err
	}

	var candidates []RecommendationCandidate
	for _, e := range entries {
		candidates = append(candidates, RecommendationCandidate{
			ContentID:   e.ContentID,
			ContentType: e.ContentType,
			Signals: []CandidateSignal{
				{SignalType: "TOPIC_MATCH", SignalValue: e.Weight},
			},
		})
	}
	return candidates, nil
}

// GenerateRelationshipCandidates traverses the topic graph one-to-two hops out from
// req.ContentID's topics (via FindReachable) and returns other CONTENT tagged with
// those reachable topics — not the topics themselves. Which relationship types count
// depends on req.Mode: `next` filters to PREREQUISITE_OF/BUILDS_ON only; other modes
// (`related`, `recommended`) consider all relationship types this generator traverses.
func (s *service) GenerateRelationshipCandidates(ctx context.Context, req RecommendationRequest) ([]RecommendationCandidate, error) {
	if req.ContentID == 0 || req.ContentType == "" || s.topicRepo == nil {
		return nil, nil
	}

	topics, err := s.topicRepo.GetContentTopics(ctx, req.ContentID, req.ContentType)
	if err != nil || len(topics) == 0 {
		return nil, nil
	}

	var candidates []RecommendationCandidate
	for _, top := range topics {
		reachable, err := s.topicRepo.FindReachable(ctx, top.ID, 2)
		if err != nil {
			continue
		}
		for _, r := range reachable {
			if req.Mode == ModeNext && r.RelationshipType != "PREREQUISITE_OF" && r.RelationshipType != "BUILDS_ON" {
				continue
			}
			entries, err := s.topicRepo.FindContentByTopicIDs(ctx, []uint{r.Topic.ID}, req.ContentID, req.ContentType, 20)
			if err != nil {
				continue
			}
			for _, e := range entries {
				candidates = append(candidates, RecommendationCandidate{
					ContentID:   e.ContentID,
					ContentType: e.ContentType,
					Signals: []CandidateSignal{
						{SignalType: "RELATIONSHIP_MATCH", SignalValue: r.Weight},
					},
				})
			}
		}
	}
	return candidates, nil
}

// GenerateCategoryCandidates returns other published content in the same category as
// req.ContentID (looked up via the content's own CategoryID), across both articles and
// courses — not an unfiltered scan of all published articles.
func (s *service) GenerateCategoryCandidates(ctx context.Context, req RecommendationRequest) ([]RecommendationCandidate, error) {
	if req.ContentID == 0 || req.ContentType == "" {
		return nil, nil
	}

	var categoryID *uint
	switch req.ContentType {
	case "ARTICLE":
		a, err := s.articleRepo.FindByID(ctx, req.ContentID)
		if err != nil || a == nil {
			return nil, nil
		}
		categoryID = a.CategoryID
	case "COURSE":
		c, err := s.courseRepo.FindByID(ctx, req.ContentID)
		if err != nil || c == nil {
			return nil, nil
		}
		categoryID = c.CategoryID
	default:
		return nil, nil
	}
	if categoryID == nil {
		return nil, nil
	}

	published := entity.CMSStatusPublished
	articles, _, err := s.articleRepo.FindAll(ctx, repository.ArticleFilter{Status: &published, CategoryID: categoryID}, 0, 50)
	if err != nil {
		return nil, err
	}
	courses, _, err := s.courseRepo.FindAll(ctx, repository.CourseFilter{Status: &published, CategoryID: categoryID}, 0, 50)
	if err != nil {
		return nil, err
	}

	var candidates []RecommendationCandidate
	for _, a := range articles {
		if a.ID == req.ContentID && req.ContentType == "ARTICLE" {
			continue
		}
		candidates = append(candidates, RecommendationCandidate{
			ContentID:   a.ID,
			ContentType: "ARTICLE",
			Signals: []CandidateSignal{
				{SignalType: "CATEGORY_MATCH", SignalValue: 0.5},
			},
		})
	}
	for _, c := range courses {
		if c.ID == req.ContentID && req.ContentType == "COURSE" {
			continue
		}
		candidates = append(candidates, RecommendationCandidate{
			ContentID:   c.ID,
			ContentType: "COURSE",
			Signals: []CandidateSignal{
				{SignalType: "CATEGORY_MATCH", SignalValue: 0.5},
			},
		})
	}
	return candidates, nil
}

func (s *service) RankCandidates(ctx context.Context, candidates []RecommendationCandidate, req RecommendationRequest) ([]RecommendationScore, error) {
	if len(candidates) == 0 {
		return nil, nil
	}

	// 1. Deduplicate candidates by (ContentID, ContentType), concatenating Signals
	type key struct {
		id   uint
		cType string
	}
	candMap := make(map[key]*RecommendationCandidate)
	for _, c := range candidates {
		k := key{id: c.ContentID, cType: c.ContentType}
		if existing, ok := candMap[k]; ok {
			existing.Signals = append(existing.Signals, c.Signals...)
		} else {
			cp := c
			candMap[k] = &cp
		}
	}

	// 2. Score and exclude candidates
	var scored []RecommendationScore
	for k, cand := range candMap {
		// Exclusion invariant 2: current item
		if k.id == req.ContentID && k.cType == req.ContentType {
			continue
		}

		var totalScore float64
		var primaryReason string
		var reasonCode string

		for _, sig := range cand.Signals {
			totalScore += sig.SignalValue
			switch sig.SignalType {
			case "RELATIONSHIP_MATCH":
				primaryReason = "Builds directly on concepts from your current reading"
				reasonCode = "PREREQUISITE"
			case "TOPIC_MATCH":
				if primaryReason == "" {
					primaryReason = "Shares core technology & topic focus"
					reasonCode = "RELATED_TOPIC"
				}
			case "CATEGORY_MATCH":
				if primaryReason == "" {
					primaryReason = "Same category recommendation"
					reasonCode = "SAME_CATEGORY"
				}
			}
		}

		// Personalization invariant 3: score adjustment if user present
		if req.UserID != nil {
			totalScore += 0.2
		}

		scored = append(scored, RecommendationScore{
			ContentID:   k.id,
			ContentType: k.cType,
			Score:       totalScore,
			ReasonCode:  reasonCode,
			Reason:      primaryReason,
			Explanation: RecommendationExplanation{
				Code:    reasonCode,
				Message: primaryReason,
			},
		})
	}

	// 4. Deterministic ordering: score DESC, content_id ASC
	for i := 0; i < len(scored)-1; i++ {
		for j := i + 1; j < len(scored); j++ {
			if scored[j].Score > scored[i].Score || (scored[j].Score == scored[i].Score && scored[j].ContentID < scored[i].ContentID) {
				scored[i], scored[j] = scored[j], scored[i]
			}
		}
	}

	return scored, nil
}

