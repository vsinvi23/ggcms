package entity

import "time"

// ContentType stores configurable content type labels for articles and courses.
// Kind is "article" or "course"; Value is the stored enum string (e.g. "BLOG");
// Label is the human-readable name.
type ContentType struct {
	ID          uint      `gorm:"primaryKey;autoIncrement"`
	Kind        string    `gorm:"type:varchar(20);not null;index"`
	Value       string    `gorm:"type:varchar(50);not null"`
	Label       string    `gorm:"type:varchar(100);not null"`
	Description string    `gorm:"type:text"`
	SortOrder   int       `gorm:"not null;default:0"`
	CreatedAt   time.Time
}

func (ContentType) TableName() string { return "content_types" }
