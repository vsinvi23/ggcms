package entity

import "time"

// LearningPath is an ordered collection of courses curated by admins.
// Kind is "LEARNING_PLAN" or "INTERVIEW_PREP".
type LearningPath struct {
	ID          uint                  `gorm:"primaryKey;autoIncrement"`
	Kind        string                `gorm:"type:varchar(30);not null;index"`
	Title       string                `gorm:"type:varchar(500);not null"`
	Description string                `gorm:"type:text"`
	Slug        string                `gorm:"type:varchar(255);index"`
	CreatedByID uint                  `gorm:"not null;index"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
	Courses     []LearningPathCourse  `gorm:"foreignKey:LearningPathID;constraint:OnDelete:CASCADE"`
}

func (LearningPath) TableName() string { return "learning_paths" }

// LearningPathCourse is a junction row linking a LearningPath to an ordered Course.
type LearningPathCourse struct {
	ID             uint `gorm:"primaryKey;autoIncrement"`
	LearningPathID uint `gorm:"not null;index;uniqueIndex:uq_lpc_path_course"`
	CourseID       uint `gorm:"not null;uniqueIndex:uq_lpc_path_course"`
	SortOrder      int  `gorm:"not null;default:0"`
	Course         *Course `gorm:"foreignKey:CourseID"`
}

func (LearningPathCourse) TableName() string { return "learning_path_courses" }
