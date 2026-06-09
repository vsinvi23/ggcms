package entity

import (
	"time"

	"gorm.io/gorm"
)

type TaskType string

const (
	TaskTypeArticle TaskType = "article"
	TaskTypeCourse  TaskType = "course"
)

type TaskOwnershipType string

const (
	TaskOwnershipOwned       TaskOwnershipType = "owned"
	TaskOwnershipReviewing   TaskOwnershipType = "reviewing"
	TaskOwnershipContributed TaskOwnershipType = "contributed"
)

type Task struct {
	ID            uint              `gorm:"primaryKey;autoIncrement"`
	Type          TaskType          `gorm:"type:varchar(20);not null"`
	Title         string            `gorm:"not null;size:500"`
	Status        string            `gorm:"type:varchar(50);not null;default:'pending'"`
	OwnershipType TaskOwnershipType `gorm:"type:varchar(20);not null"`
	UserID        uint              `gorm:"not null;index"`
	ContentID     *uint
	CreatedAt     time.Time
	UpdatedAt     time.Time
	DeletedAt     gorm.DeletedAt `gorm:"index"`
	User          User           `gorm:"foreignKey:UserID"`
	// Transient fields — populated by the repository after fetch, not persisted.
	CMSVersion          int    `gorm:"-"`
	CMSStatus           string `gorm:"-"` // live status from articles/courses table (overrides stale task.Status)
	CMSHasPendingDraft  bool   `gorm:"-"`
	CMSPublishedVersion *int   `gorm:"-"`
}

func (Task) TableName() string { return "tasks" }
