package entity

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// ─── Permission types ─────────────────────────────────────────────────────────

type ResourcePerms struct {
	View    bool `json:"view"`
	Create  bool `json:"create"`
	Edit    bool `json:"edit"`
	Delete  bool `json:"delete"`
	Review  bool `json:"review"`
	Approve bool `json:"approve"`
	Publish bool `json:"publish"`
}

type ManagePerms struct {
	View   bool `json:"view"`
	Manage bool `json:"manage"`
}

type ViewPerms struct {
	View bool `json:"view"`
}

type GroupPermissions struct {
	Articles   ResourcePerms `json:"articles"`
	Courses    ResourcePerms `json:"courses"`
	Users      ResourcePerms `json:"users"`
	Groups     ManagePerms   `json:"groups"`
	Categories ResourcePerms `json:"categories"`
	Analytics  ViewPerms     `json:"analytics"`
	Settings   ManagePerms   `json:"settings"`
}

// Value implements driver.Valuer so GORM can write to jsonb.
func (p GroupPermissions) Value() (driver.Value, error) {
	b, err := json.Marshal(p)
	return string(b), err
}

// Scan implements sql.Scanner so GORM can read from jsonb.
func (p *GroupPermissions) Scan(value interface{}) error {
	var b []byte
	switch v := value.(type) {
	case string:
		b = []byte(v)
	case []byte:
		b = v
	default:
		return fmt.Errorf("cannot scan type %T into GroupPermissions", value)
	}
	return json.Unmarshal(b, p)
}

// DefaultPermissions returns an empty (all false) permission set.
func DefaultPermissions() GroupPermissions {
	return GroupPermissions{}
}

// RolePreset returns the standard permission set for a named role.
func RolePreset(role string) GroupPermissions {
	switch role {
	case "admin":
		return GroupPermissions{
			Articles:   ResourcePerms{View: true, Create: true, Edit: true, Delete: true, Review: true, Approve: true, Publish: true},
			Courses:    ResourcePerms{View: true, Create: true, Edit: true, Delete: true, Review: true, Approve: true, Publish: true},
			Users:      ResourcePerms{View: true, Create: true, Edit: true, Delete: true},
			Groups:     ManagePerms{View: true, Manage: true},
			Categories: ResourcePerms{View: true, Create: true, Edit: true, Delete: true},
			Analytics:  ViewPerms{View: true},
			Settings:   ManagePerms{View: true, Manage: true},
		}
	case "moderator":
		return GroupPermissions{
			Articles:   ResourcePerms{View: true, Create: true, Edit: true, Delete: false, Review: true, Approve: true, Publish: true},
			Courses:    ResourcePerms{View: true, Create: true, Edit: true, Delete: false, Review: true, Approve: true, Publish: true},
			Users:      ResourcePerms{View: true},
			Groups:     ManagePerms{View: true},
			Categories: ResourcePerms{View: true, Create: true, Edit: true},
			Analytics:  ViewPerms{View: false},
			Settings:   ManagePerms{View: true, Manage: false},
		}
	case "editor":
		return GroupPermissions{
			Articles:   ResourcePerms{View: true, Create: true, Edit: true, Delete: false, Review: true, Approve: false, Publish: false},
			Courses:    ResourcePerms{View: true, Create: true, Edit: true, Delete: false, Review: true, Approve: false, Publish: false},
			Users:      ResourcePerms{View: true},
			Groups:     ManagePerms{View: true},
			Categories: ResourcePerms{View: true, Create: true, Edit: true},
			Analytics:  ViewPerms{View: false},
			Settings:   ManagePerms{View: false, Manage: false},
		}
	default: // viewer
		return GroupPermissions{
			Articles:   ResourcePerms{View: true},
			Courses:    ResourcePerms{View: true},
			Users:      ResourcePerms{View: true},
			Groups:     ManagePerms{View: true},
			Categories: ResourcePerms{View: true},
			Analytics:  ViewPerms{View: false},
			Settings:   ManagePerms{View: false, Manage: false},
		}
	}
}

// ─── Group entity ─────────────────────────────────────────────────────────────

type Group struct {
	ID          uint             `gorm:"primaryKey;autoIncrement"`
	Name        string           `gorm:"not null;uniqueIndex;size:255"`
	Role        string           `gorm:"type:varchar(50);not null;default:'viewer'"`
	Permissions GroupPermissions `gorm:"type:jsonb"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
	DeletedAt   gorm.DeletedAt `gorm:"index"`
	Users       []User         `gorm:"many2many:user_groups;"`
}

func (Group) TableName() string { return "groups" }
