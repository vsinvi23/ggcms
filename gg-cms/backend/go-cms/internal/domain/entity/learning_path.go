package entity

import "time"

// LearningPath is an ordered collection of courses curated by admins.
// Kind is "LEARNING_PLAN" or "INTERVIEW_PREP".
type LearningPath struct {
	ID          uint                  `gorm:"primaryKey;autoIncrement"`
	Kind        string                `gorm:"type:varchar(30);not null;index"`
	Title       string                `gorm:"type:varchar(500);not null"`
	Description string                `gorm:"type:text"`
	CreatedByID uint                  `gorm:"not null;index"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
	Courses     []LearningPathCourse  `gorm:"foreignKey:LearningPathID;constraint:OnDelete:CASCADE"`
}

func (LearningPath) TableName() string { return "learning_paths" }

// LearningPathCourse is a junction row linking a LearningPath to an ordered Course.
type LearningPathCourse struct {
	ID             uint `gorm:"primaryKey;autoIncrement"`
	LearningPathID uint `gorm:"not null;index"`
	CourseID       uint `gorm:"not null"`
	SortOrder      int  `gorm:"not null;default:0"`
}

func (LearningPathCourse) TableName() string { return "learning_path_courses" }
