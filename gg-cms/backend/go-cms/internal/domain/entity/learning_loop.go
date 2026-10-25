package entity

import "time"

const (
	AttemptStatusInProgress = "in_progress"
	AttemptStatusSubmitted  = "submitted"
)

type AssessmentAttempt struct {
	ID              uint       `gorm:"primaryKey;autoIncrement"`
	UserID          uint       `gorm:"not null;index"`
	AssessmentID    uint       `gorm:"not null;index"`
	Status          string     `gorm:"type:varchar(20);not null;default:'in_progress'"`
	Answers         *string    `gorm:"type:jsonb"`
	Score           *float64   `gorm:"type:decimal(5,2)"`
	CorrectCount    int        `gorm:"not null;default:0"`
	TotalQuestions  int        `gorm:"not null;default:0"`
	PassMark        float64    `gorm:"type:decimal(5,2);not null;default:70"`
	Passed          bool       `gorm:"not null;default:false"`
	StartedAt       time.Time  `gorm:"not null"`
	SubmittedAt     *time.Time
	DurationSeconds int        `gorm:"not null;default:0"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

func (AssessmentAttempt) TableName() string { return "assessment_attempts" }

type Certificate struct {
	ID            uint   `gorm:"primaryKey;autoIncrement"`
	Code          string `gorm:"type:varchar(36);uniqueIndex;not null"`
	UserID        uint   `gorm:"not null;index"`
	CourseID      uint   `gorm:"not null"`
	EnrollmentID  *uint
	RecipientName string `gorm:"type:varchar(255);not null"`
	CourseTitle   string `gorm:"type:varchar(500);not null"`
	Score         *float64 `gorm:"type:decimal(5,2)"`
	IssuedAt      time.Time `gorm:"not null"`
	Revoked       bool   `gorm:"not null;default:false"`
	RevokedAt     *time.Time
	RevokedByID   *uint
	RevokeReason  *string `gorm:"type:varchar(500)"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (Certificate) TableName() string { return "certificates" }
