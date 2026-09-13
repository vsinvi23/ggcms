package entity

import "time"

type PasswordResetToken struct {
	ID        string `gorm:"primaryKey;column:id"`
	UserID    uint   `gorm:"not null;index"`
	TokenHash string `gorm:"not null;size:255"`
	ExpiresAt time.Time
	UsedAt    *time.Time
	CreatedAt time.Time
}

func (PasswordResetToken) TableName() string { return "password_reset_tokens" }
