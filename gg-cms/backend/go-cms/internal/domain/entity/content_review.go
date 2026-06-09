package entity

import "time"

// ContentReview records a single reviewer's approval of a piece of content.
// Multiple rows per content item are possible when required_approvals > 1.
type ContentReview struct {
	ID          uint      `gorm:"primaryKey;autoIncrement"`
	ContentID   uint      `gorm:"not null;index"`
	ContentType string    `gorm:"not null;size:20"`
	ReviewerID  uint      `gorm:"not null"`
	Reviewer    *User     `gorm:"foreignKey:ReviewerID"`
	ReviewedAt  time.Time `gorm:"not null;default:now()"`
}

func (ContentReview) TableName() string { return "content_reviews" }
