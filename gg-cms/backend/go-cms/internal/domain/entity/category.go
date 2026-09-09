package entity

import (
	"time"

	"gorm.io/gorm"
)

type Domain struct {
	ID          uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	Name        string    `gorm:"type:varchar(200);not null" json:"name"`
	Slug        string    `gorm:"type:varchar(220);uniqueIndex;not null" json:"slug"`
	Description string    `gorm:"type:text" json:"description,omitempty"`
	Icon        string    `gorm:"type:varchar(100)" json:"icon,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (Domain) TableName() string { return "domains" }

type Category struct {
	ID        uint           `gorm:"primaryKey;autoIncrement" json:"id"`
	Name      string         `gorm:"not null;size:255" json:"name"`
	Slug      string         `gorm:"not null;uniqueIndex;size:255" json:"slug"`
	ParentID  *uint          `gorm:"index" json:"parent_id,omitempty"`
	DomainID  *uint          `gorm:"index" json:"domain_id,omitempty"`
	// IsVirtual marks system-managed categories hidden from regular users.
	// The "geek" root is the only virtual category; being a reviewer for it
	// grants access to all categories in the tree.
	IsVirtual         bool           `gorm:"not null;default:false;index" json:"is_virtual"`
	RequiredApprovals int            `gorm:"not null;default:1" json:"required_approvals"`
	CreatedAt         time.Time      `json:"created_at"`
	UpdatedAt         time.Time      `json:"updated_at"`
	DeletedAt         gorm.DeletedAt `gorm:"index" json:"-"`
	Parent            *Category      `gorm:"foreignKey:ParentID" json:"parent,omitempty"`
	Children          []Category     `gorm:"foreignKey:ParentID" json:"children,omitempty"`
	Domain            *Domain        `gorm:"foreignKey:DomainID" json:"domain,omitempty"`
	Tags              []Tag          `gorm:"many2many:category_tags;" json:"tags,omitempty"`
	ReviewerGroups    []Group        `gorm:"many2many:category_reviewer_groups;" json:"reviewer_groups,omitempty"`
}

func (Category) TableName() string { return "categories" }

type ContentCategory struct {
	ContentID   uint      `gorm:"primaryKey;not null" json:"content_id"`
	ContentType string    `gorm:"primaryKey;type:varchar(20);not null" json:"content_type"`
	CategoryID  uint      `gorm:"primaryKey;not null;index" json:"category_id"`
	IsPrimary   bool      `gorm:"not null;default:true;index" json:"is_primary"`
	CreatedAt   time.Time `json:"created_at"`
}

func (ContentCategory) TableName() string { return "content_categories" }

