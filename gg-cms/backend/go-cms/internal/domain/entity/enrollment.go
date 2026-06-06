package entity

import (
	"time"

	"gorm.io/gorm"
)

type EnrollmentStatus string

const (
	EnrollmentStatusActive    EnrollmentStatus = "active"
	EnrollmentStatusCompleted EnrollmentStatus = "completed"
	EnrollmentStatusDropped   EnrollmentStatus = "dropped"
)

type Enrollment struct {
	ID             uint             `gorm:"primaryKey;autoIncrement"`
	UserID         uint             `gorm:"not null;index"`
	CourseID       uint             `gorm:"not null;index"`
	Status         EnrollmentStatus `gorm:"type:varchar(20);not null;default:'active'"`
	Progress       float64          `gorm:"not null;default:0"`
	EnrolledAt     *time.Time
	LastAccessedAt *time.Time
	CompletedAt    *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
	DeletedAt      gorm.DeletedAt `gorm:"index"`
	User           User           `gorm:"foreignKey:UserID"`
	Course         Course         `gorm:"foreignKey:CourseID"`
	CompletedLessons []Lesson     `gorm:"many2many:enrollment_lessons;"`
}

func (Enrollment) TableName() string { return "enrollments" }
