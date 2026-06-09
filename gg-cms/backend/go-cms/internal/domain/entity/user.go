package entity

import (
	"time"

	"gorm.io/gorm"
)

type UserStatus string

const (
	UserStatusActive      UserStatus = "ACTIVE"
	UserStatusInactive    UserStatus = "INACTIVE"
	UserStatusPending     UserStatus = "PENDING"
	UserStatusDeactivated UserStatus = "DEACTIVATED"
)

type User struct {
	ID           uint           `gorm:"primaryKey;autoIncrement"`
	Email        string         `gorm:"uniqueIndex;not null;size:255"`
	PasswordHash string         `gorm:"not null;size:255"`
	Name         string         `gorm:"not null;size:255"`
	MobileNo     *string        `gorm:"size:20"`
	Status       UserStatus     `gorm:"type:varchar(20);not null;default:'ACTIVE'"`
	LastLogin    *time.Time
	GoogleID     *string        `gorm:"column:google_id;size:255"`
	GitHubID     *string        `gorm:"column:github_id;size:255"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
	DeletedAt    gorm.DeletedAt `gorm:"index"`
	Groups       []Group        `gorm:"many2many:user_groups;"`
}

func (User) TableName() string { return "users" }
