package entity

import (
	"time"

	"gorm.io/gorm"
)

type LessonType string

const (
	LessonTypeVideo      LessonType = "video"
	LessonTypeText       LessonType = "text"
	LessonTypeQuiz       LessonType = "quiz"
	LessonTypeAssignment LessonType = "assignment"
)

type Lesson struct {
	ID        uint           `gorm:"primaryKey;autoIncrement"`
	Title     string         `gorm:"not null;size:500"`
	Type      LessonType     `gorm:"type:varchar(20);not null;default:'text'"`
	Content   *string        `gorm:"type:text"`
	Duration  int            `gorm:"not null;default:0"`
	Order     int            `gorm:"not null;default:0"`
	Published bool           `gorm:"not null;default:false"`
	SectionID *uint          `gorm:"index"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

func (Lesson) TableName() string { return "lessons" }
