package entity

import "time"

type ExperienceLevel string
type RoleType string

const (
	ExperienceBeginner     ExperienceLevel = "beginner"
	ExperienceIntermediate ExperienceLevel = "intermediate"
	ExperienceAdvanced     ExperienceLevel = "advanced"
	ExperienceExpert       ExperienceLevel = "expert"

	RoleLearner    RoleType = "learner"
	RoleDeveloper  RoleType = "developer"
	RoleArchitect  RoleType = "architect"
	RoleManager    RoleType = "manager"
	RoleResearcher RoleType = "researcher"
	RoleExecutive  RoleType = "executive"
)

// UserProfile stores a learner's persona, interests, and experience for personalized recommendations.
// A user can have multiple named profiles; exactly one has IsDefault=true (the active one).
type UserProfile struct {
	ID                   uint            `gorm:"primaryKey;autoIncrement"`
	UserID               uint            `gorm:"index;not null"`
	Name                 string          `gorm:"type:varchar(100);not null;default:'Default'"`
	IsDefault            bool            `gorm:"not null;default:true"`
	ExperienceLevel      ExperienceLevel `gorm:"type:varchar(20);not null;default:'beginner'"`
	RoleType             RoleType        `gorm:"type:varchar(50);not null;default:'learner'"`
	LearningGoals        *string         `gorm:"type:text"`
	OnboardingCompleted  bool            `gorm:"not null;default:false"`
	InterestedTagIDs     []int64         `gorm:"type:jsonb;serializer:json;not null;default:'[]'"`
	PreferredCategoryIDs []int64         `gorm:"type:jsonb;serializer:json;not null;default:'[]'"`
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

func (UserProfile) TableName() string { return "user_profiles" }
