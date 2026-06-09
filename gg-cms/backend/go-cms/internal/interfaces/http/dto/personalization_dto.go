package dto

import "github.com/serenya/go-cms/internal/domain/entity"

// UpsertProfileRequest is the JSON body for PUT /api/personalization/profile (updates active profile).
type UpsertProfileRequest struct {
	Name                 string  `json:"name"`
	ExperienceLevel      string  `json:"experienceLevel" binding:"required,oneof=beginner intermediate advanced expert"`
	RoleType             string  `json:"roleType" binding:"required,oneof=learner developer architect manager researcher executive"`
	LearningGoals        *string `json:"learningGoals"`
	OnboardingCompleted  bool    `json:"onboardingCompleted"`
	InterestedTagIDs     []int64 `json:"interestedTagIds"`
	PreferredCategoryIDs []int64 `json:"preferredCategoryIds"`
}

// CreateProfileRequest is the JSON body for POST /api/personalization/profiles (create new named profile).
type CreateProfileRequest struct {
	Name                 string  `json:"name" binding:"required,min=1,max=100"`
	ExperienceLevel      string  `json:"experienceLevel" binding:"required,oneof=beginner intermediate advanced expert"`
	RoleType             string  `json:"roleType" binding:"required,oneof=learner developer architect manager researcher executive"`
	LearningGoals        *string `json:"learningGoals"`
	InterestedTagIDs     []int64 `json:"interestedTagIds"`
	PreferredCategoryIDs []int64 `json:"preferredCategoryIds"`
}

// UserProfileResponse is the JSON shape returned by the API.
type UserProfileResponse struct {
	ID                   uint                   `json:"id"`
	UserID               uint                   `json:"userId"`
	Name                 string                 `json:"name"`
	IsDefault            bool                   `json:"isDefault"`
	ExperienceLevel      entity.ExperienceLevel `json:"experienceLevel"`
	RoleType             entity.RoleType        `json:"roleType"`
	LearningGoals        *string                `json:"learningGoals"`
	OnboardingCompleted  bool                   `json:"onboardingCompleted"`
	InterestedTagIDs     []int64                `json:"interestedTagIds"`
	PreferredCategoryIDs []int64                `json:"preferredCategoryIds"`
}

func MapProfileToResponse(p *entity.UserProfile) UserProfileResponse {
	tagIDs := p.InterestedTagIDs
	if tagIDs == nil {
		tagIDs = []int64{}
	}
	catIDs := p.PreferredCategoryIDs
	if catIDs == nil {
		catIDs = []int64{}
	}
	return UserProfileResponse{
		ID:                   p.ID,
		UserID:               p.UserID,
		Name:                 p.Name,
		IsDefault:            p.IsDefault,
		ExperienceLevel:      p.ExperienceLevel,
		RoleType:             p.RoleType,
		LearningGoals:        p.LearningGoals,
		OnboardingCompleted:  p.OnboardingCompleted,
		InterestedTagIDs:     tagIDs,
		PreferredCategoryIDs: catIDs,
	}
}
