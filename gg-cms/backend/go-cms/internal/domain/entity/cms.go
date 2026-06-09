package entity

import (
	"time"

	"gorm.io/gorm"
)

type CMSType string

const (
	CMSTypeArticle CMSType = "ARTICLE"
	CMSTypeVideo   CMSType = "VIDEO"
	CMSTypeCourse  CMSType = "COURSE"
)

type CourseType string

const (
	CourseTypeStandard     CourseType = "STANDARD"
	CourseTypeByte         CourseType = "BYTE"
	CourseTypeLearningPlan CourseType = "LEARNING_PLAN"
	CourseTypeCapsule      CourseType = "CAPSULE"
)

type CMSStatus string

const (
	CMSStatusDraft     CMSStatus = "DRAFT"
	CMSStatusReview    CMSStatus = "REVIEW"
	CMSStatusApproved  CMSStatus = "APPROVED"
	CMSStatusPublished CMSStatus = "PUBLISHED"
	CMSStatusRejected  CMSStatus = "REJECTED"
)

type Attachment struct {
	ID        uint           `gorm:"primaryKey;autoIncrement"`
	ArticleID *uint          `gorm:"index"`
	CourseID  *uint          `gorm:"index"`
	Name      string         `gorm:"not null;size:255"`
	URL       string         `gorm:"not null;size:1024"`
	MimeType  string         `gorm:"size:100"`
	Size      int64
	CreatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

func (Attachment) TableName() string { return "attachments" }

type Article struct {
	ID              uint           `gorm:"primaryKey;autoIncrement"`
	PublicID        string         `gorm:"type:varchar(36);uniqueIndex;not null"`
	Slug            string         `gorm:"type:varchar(600);index;not null;default:''"`
	Title           string         `gorm:"not null;size:500"`
	Description     *string        `gorm:"type:text"`
	Body            *string        `gorm:"type:text"`
	ArticleType     string         `gorm:"type:varchar(50);not null;default:''"`
	Status          CMSStatus      `gorm:"type:varchar(20);not null;default:'DRAFT'"`
	CategoryID      *uint          `gorm:"index"`
	CreatedByID     uint           `gorm:"not null;index"`
	ReviewerID      *uint          `gorm:"index"`
	ReviewerComment *string        `gorm:"type:text"`
	ThumbnailURL    *string        `gorm:"size:1024"`
	PublishedAt     *time.Time
	Version         int            `gorm:"not null;default:1"`
	// Versioning snapshot — holds the last-published state while a new draft is in review.
	HasPendingDraft      bool    `gorm:"column:has_pending_draft;not null;default:false"`
	PublishedVersion     *int    `gorm:"column:published_version"`
	PublishedTitle       string  `gorm:"column:published_title;type:text"`
	PublishedDescription *string `gorm:"column:published_description;type:text"`
	PublishedBody        *string `gorm:"column:published_body;type:text"`
	// Review baseline — snapshot taken when reviewer sends content back, used to diff what changed on re-submission.
	ReviewBaselineTitle       string  `gorm:"column:review_baseline_title;type:text"`
	ReviewBaselineDescription *string `gorm:"column:review_baseline_description;type:text"`
	ReviewBaselineBody        *string `gorm:"column:review_baseline_body;type:text"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
	DeletedAt       gorm.DeletedAt `gorm:"index"`
	Category        *Category      `gorm:"foreignKey:CategoryID"`
	CreatedBy       User           `gorm:"foreignKey:CreatedByID"`
	Reviewer        *User          `gorm:"foreignKey:ReviewerID"`
	Attachments     []Attachment   `gorm:"foreignKey:ArticleID"`
}

func (Article) TableName() string { return "articles" }

type Course struct {
	ID              uint           `gorm:"primaryKey;autoIncrement"`
	PublicID        string         `gorm:"type:varchar(36);uniqueIndex;not null"`
	Slug            string         `gorm:"type:varchar(600);index;not null;default:''"`
	Title           string         `gorm:"not null;size:500"`
	Description     *string        `gorm:"type:text"`
	Body            *string        `gorm:"type:text"`
	CourseType      CourseType     `gorm:"type:varchar(30);not null;default:'STANDARD'"`
	Status          CMSStatus      `gorm:"type:varchar(20);not null;default:'DRAFT'"`
	CategoryID      *uint          `gorm:"index"`
	CreatedByID     uint           `gorm:"not null;index"`
	ReviewerID      *uint          `gorm:"index"`
	ReviewerComment *string        `gorm:"type:text"`
	ThumbnailURL    *string        `gorm:"size:1024"`
	PublishedAt     *time.Time
	Version         int            `gorm:"not null;default:1"`
	// Versioning snapshot — holds the last-published state while a new draft is in review.
	HasPendingDraft      bool    `gorm:"column:has_pending_draft;not null;default:false"`
	PublishedVersion     *int    `gorm:"column:published_version"`
	PublishedTitle       string  `gorm:"column:published_title;type:text"`
	PublishedDescription *string `gorm:"column:published_description;type:text"`
	PublishedBody        *string `gorm:"column:published_body;type:text"`
	// Review baseline — snapshot taken when reviewer sends content back, used to diff what changed on re-submission.
	ReviewBaselineTitle       string  `gorm:"column:review_baseline_title;type:text"`
	ReviewBaselineDescription *string `gorm:"column:review_baseline_description;type:text"`
	ReviewBaselineBody        *string `gorm:"column:review_baseline_body;type:text"`
	// Chapter snapshots — JSONB encoding of the section/lesson hierarchy.
	// published_chapters_snapshot is saved at Publish time; review_baseline_chapters is saved at SendBack time.
	PublishedChaptersSnapshot *string `gorm:"column:published_chapters_snapshot;type:jsonb"`
	ReviewBaselineChapters    *string `gorm:"column:review_baseline_chapters;type:jsonb"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
	DeletedAt       gorm.DeletedAt `gorm:"index"`
	Category        *Category      `gorm:"foreignKey:CategoryID"`
	CreatedBy       User           `gorm:"foreignKey:CreatedByID"`
	Reviewer        *User          `gorm:"foreignKey:ReviewerID"`
	Attachments     []Attachment   `gorm:"foreignKey:CourseID"`
	Sections        []Section      `gorm:"foreignKey:CourseID"`
}

func (Course) TableName() string { return "courses" }
