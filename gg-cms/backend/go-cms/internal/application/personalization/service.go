package personalization

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/pkg/logger"
	"go.uber.org/zap"
)

// RecommendedItem is a scored content result returned by GetRecommendations.
type RecommendationMode string

const (
	ModeRelated     RecommendationMode = "related"
	ModeRecommended RecommendationMode = "recommended"
	ModeNext        RecommendationMode = "next"
)

type RecommendedItem struct {
	ID           uint    `json:"id"`
	PublicID     string  `json:"publicId"`
	Slug         string  `json:"slug"`
	Title        string  `json:"title"`
	Description  *string `json:"description"`
	Thumbnail    *string `json:"thumbnailUrl"`
	CategoryID   *uint   `json:"categoryId"`
	CategoryName *string `json:"categoryName,omitempty"`
	ContentType  string  `json:"contentType"` // "article" | "course"
	Score        float64 `json:"score"`
	ReasonCode   string  `json:"reasonCode"`
	Reason       string  `json:"reason"`
	Position     int     `json:"position"`
	RecID        string  `json:"recId"`
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
	Slug        string                    `json:"slug,omitempty"`
	Position    int                       `json:"position"`
	Score       float64                   `json:"score"`
	ReasonCode  string                    `json:"reason_code"`
	Reason      string                    `json:"reason"`
	Explanation RecommendationExplanation `json:"-"`
}

type RecommendationResponse struct {
	ContentID       uint                  `json:"content_id"`
	RecID           string                `json:"rec_id"`
	Partial         bool                  `json:"partial,omitempty"`
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
	Recommend(ctx context.Context, userID uint, limit int) (*Feed, error)
	InvalidateUser(userID uint)
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
	signals
}

func NewService(
	profileRepo repository.UserProfileRepository,
	articleRepo repository.ArticleRepository,
	courseRepo repository.CourseRepository,
	enrollRepo repository.EnrollmentRepository,
	tagRepo repository.TagRepository,
	topicRepo repository.TopicRepository,
	opts ...Option,
) Service {
	s := &service{
		profileRepo: profileRepo,
		articleRepo: articleRepo,
		courseRepo:  courseRepo,
		enrollRepo:  enrollRepo,
		tagRepo:     tagRepo,
		topicRepo:   topicRepo,
	}
	s.signals = newSignals()
	for _, o := range opts {
		o(s)
	}
	return s
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
	s.InvalidateUser(userID)
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
	s.InvalidateUser(userID)
	return profile, nil
}

func (s *service) SetActiveProfile(ctx context.Context, userID, profileID uint) (*entity.UserProfile, error) {
	if err := s.profileRepo.SetDefault(ctx, userID, profileID); err != nil {
		return nil, fmt.Errorf("set active profile: %w", err)
	}
	s.InvalidateUser(userID)
	return s.profileRepo.FindDefaultByUserID(ctx, userID)
}

func (s *service) GetRecommendations(ctx context.Context, userID uint, limit int) ([]RecommendedItem, error) {
	feed, err := s.Recommend(ctx, userID, limit)
	if err != nil {
		return nil, err
	}
	return feed.Items, nil
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

func toSet(ids []int64) map[int64]struct{} {
	s := make(map[int64]struct{}, len(ids))
	for _, id := range ids {
		s[id] = struct{}{}
	}
	return s
}

func (s *service) GetRecommendationsByRequest(ctx context.Context, req RecommendationRequest) (RecommendationResponse, error) {
	if req.Limit <= 0 {
		req.Limit = 10
	}
	if req.Mode == "" {
		req.Mode = ModeRelated
	}

	var allCandidates []RecommendationCandidate
	partial := false
	generators := []struct {
		name string
		fn   func(context.Context, RecommendationRequest) ([]RecommendationCandidate, error)
	}{
		{"topic", s.GenerateTopicCandidates},
		{"relationship", s.GenerateRelationshipCandidates},
		{"category", s.GenerateCategoryCandidates},
	}
	for _, g := range generators {
		cands, err := g.fn(ctx, req)
		if err != nil {
			partial = true
			logger.Warn("recommendation generator failed", zap.String("generator", g.name), zap.Error(err))
		}
		allCandidates = append(allCandidates, cands...)
	}

	ranked, err := s.RankCandidates(ctx, allCandidates, req)
	if err != nil {
		return RecommendationResponse{}, err
	}

	recs, hydrateFailed := s.hydratePublished(ctx, ranked, req.Limit)
	if hydrateFailed {
		partial = true
	}
	for i := range recs {
		recs[i].Position = i + 1
	}

	return RecommendationResponse{
		ContentID:       req.ContentID,
		RecID:           s.newRecID(),
		Partial:         partial,
		Recommendations: recs,
	}, nil
}

func (s *service) hydratePublished(ctx context.Context, ranked []RecommendationScore, limit int) ([]RecommendationScore, bool) {
	out := make([]RecommendationScore, 0, limit)
	failed := false
	for _, r := range ranked {
		if len(out) >= limit {
			break
		}
		switch strings.ToUpper(r.ContentType) {
		case "ARTICLE":
			a, err := s.articleRepo.FindByID(ctx, r.ContentID)
			if err != nil {
				failed = true
				logger.Warn("recommendation hydrate failed", zap.Uint("id", r.ContentID), zap.Error(err))
				continue
			}
			if a == nil || a.Status != entity.CMSStatusPublished {
				continue
			}
			r.Title, r.Description, r.Thumbnail, r.Slug = a.Title, a.Description, a.ThumbnailURL, a.Slug
		case "COURSE":
			c, err := s.courseRepo.FindByID(ctx, r.ContentID)
			if err != nil {
				failed = true
				logger.Warn("recommendation hydrate failed", zap.Uint("id", r.ContentID), zap.Error(err))
				continue
			}
			if c == nil || c.Status != entity.CMSStatusPublished {
				continue
			}
			r.Title, r.Description, r.Thumbnail, r.Slug = c.Title, c.Description, c.ThumbnailURL, c.Slug
		default:
			continue
		}
		out = append(out, r)
	}
	return out, failed
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
	if err != nil {
		return nil, err
	}
	if len(topics) == 0 {
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
	if err != nil {
		return nil, err
	}
	if len(topics) == 0 {
		return nil, nil
	}

	var candidates []RecommendationCandidate
	var firstErr error
	for _, top := range topics {
		reachable, err := s.topicRepo.FindReachable(ctx, top.ID, 2)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		for _, r := range reachable {
			if req.Mode == ModeNext && r.RelationshipType != "PREREQUISITE_OF" && r.RelationshipType != "BUILDS_ON" {
				continue
			}
			entries, err := s.topicRepo.FindContentByTopicIDs(ctx, []uint{r.Topic.ID}, req.ContentID, req.ContentType, 20)
			if err != nil {
				if firstErr == nil {
					firstErr = err
				}
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
	return candidates, firstErr
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
		if err != nil {
			return nil, err
		}
		if a == nil {
			return nil, nil
		}
		categoryID = a.CategoryID
	case "COURSE":
		c, err := s.courseRepo.FindByID(ctx, req.ContentID)
		if err != nil {
			return nil, err
		}
		if c == nil {
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

	sort.Slice(scored, func(i, j int) bool {
		if scored[i].Score != scored[j].Score {
			return scored[i].Score > scored[j].Score
		}
		if scored[i].ContentID != scored[j].ContentID {
			return scored[i].ContentID < scored[j].ContentID
		}
		return scored[i].ContentType < scored[j].ContentType
	})

	return scored, nil
}

