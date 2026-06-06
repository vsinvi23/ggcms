package entity

import "time"

// AppSetting stores a single key-value configuration entry persisted in PostgreSQL.
type AppSetting struct {
	ID        uint      `gorm:"primaryKey;autoIncrement"`
	Key       string    `gorm:"uniqueIndex;not null;size:255"`
	Value     string    `gorm:"type:text;not null;default:''"`
	CreatedAt time.Time
	UpdatedAt time.Time
}
