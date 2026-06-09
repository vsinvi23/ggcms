package entity

import (
	"time"

	"gorm.io/gorm"
)

type Section struct {
	ID              uint           `gorm:"primaryKey;autoIncrement"`
	Title           string         `gorm:"not null;size:500"`
	Description     *string        `gorm:"type:text"`
	Order           int            `gorm:"not null;default:0"`
	CourseID        *uint          `gorm:"index"`
	ParentSectionID *uint          `gorm:"index"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
	DeletedAt       gorm.DeletedAt `gorm:"index"`
	ChildSections   []Section      `gorm:"foreignKey:ParentSectionID"`
	Lessons         []Lesson       `gorm:"foreignKey:SectionID"`
}

func (Section) TableName() string { return "sections" }
