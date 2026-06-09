package entity

import "time"

// WorkflowEvent records every status transition for audit / activity-log purposes.
type WorkflowEvent struct {
	ID            uint      `gorm:"primaryKey;autoIncrement"`
	EntityType    string    `gorm:"type:varchar(20);not null;index"` // "ARTICLE" | "COURSE"
	EntityID      uint      `gorm:"not null;index"`
	UserID        uint      `gorm:"not null;index"`
	FromStatus    string    `gorm:"type:varchar(20)"`
	ToStatus      string    `gorm:"type:varchar(20);not null"`
	Action        string    `gorm:"type:varchar(30);not null"` // "SUBMIT" | "APPROVE" | "REJECT" | "PUBLISH" | "SEND_BACK" | "EDIT"
	Comment       *string   `gorm:"type:text"`
	Version       *int      `gorm:"column:version"`         // content version at the time of this event
	TitleSnapshot string    `gorm:"column:title_snapshot;type:text"` // content title at the time of this event
	CreatedAt     time.Time
	User          User      `gorm:"foreignKey:UserID"`
}

func (WorkflowEvent) TableName() string { return "workflow_events" }
