package entity

import "time"

// Tag represents a user-defined label. Names are always stored lowercase.
type Tag struct {
	ID         uint       `gorm:"primaryKey;autoIncrement"`
	Name       string     `gorm:"type:varchar(100);uniqueIndex;not null"`
	Categories []Category `gorm:"many2many:category_tags;"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

func (Tag) TableName() string { return "tags" }
