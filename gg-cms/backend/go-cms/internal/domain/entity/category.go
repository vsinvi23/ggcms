package entity

import (
	"time"

	"gorm.io/gorm"
)

type Category struct {
	ID        uint           `gorm:"primaryKey;autoIncrement"`
	Name      string         `gorm:"not null;size:255"`
	Slug      string         `gorm:"not null;uniqueIndex;size:255"`
	ParentID  *uint          `gorm:"index"`
	// IsVirtual marks system-managed categories hidden from regular users.
	// The "geek" root is the only virtual category; being a reviewer for it
	// grants access to all categories in the tree.
	IsVirtual         bool           `gorm:"not null;default:false;index"`
	RequiredApprovals int            `gorm:"not null;default:1"`
	CreatedAt         time.Time
	UpdatedAt      time.Time
	DeletedAt      gorm.DeletedAt `gorm:"index"`
	Parent         *Category      `gorm:"foreignKey:ParentID"`
	Children       []Category     `gorm:"foreignKey:ParentID"`
	Tags           []Tag          `gorm:"many2many:category_tags;"`
	ReviewerGroups []Group        `gorm:"many2many:category_reviewer_groups;"`
}

func (Category) TableName() string { return "categories" }
