package entity

import (
	"time"

	"gorm.io/gorm"
)

type Notification struct {
	ID        uint           `gorm:"primaryKey;autoIncrement"`
	UserID    uint           `gorm:"not null;index"`
	Title     string         `gorm:"not null;size:255"`
	Message   string         `gorm:"type:text;not null"`
	Read      bool           `gorm:"not null;default:false"`
	Link      *string        `gorm:"size:1024"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

func (Notification) TableName() string { return "notifications" }
