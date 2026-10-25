package entity

import (
	"time"

	"gorm.io/gorm"
)

type Notification struct {
	ID        uint    `gorm:"primaryKey;autoIncrement"`
	UserID    uint    `gorm:"not null;index"`
	Type      string  `gorm:"not null;size:40;default:'general'"`
	Title     string  `gorm:"not null;size:255"`
	Message   string  `gorm:"type:text;not null"`
	Read      bool    `gorm:"not null;default:false"`
	Link      *string `gorm:"size:1024"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

func (Notification) TableName() string { return "notifications" }

type UserPreferences struct {
	UserID            uint            `gorm:"primaryKey"`
	Bio               *string         `gorm:"type:text"`
	Location          *string         `gorm:"size:120"`
	JobTitle          *string         `gorm:"size:120"`
	NotifInApp        map[string]bool `gorm:"column:notif_in_app;type:jsonb;serializer:json;not null"`
	NotifEmail        map[string]bool `gorm:"column:notif_email;type:jsonb;serializer:json;not null"`
	DigestFrequency   string          `gorm:"size:10;not null;default:'weekly'"`
	EmailUnsubscribed bool            `gorm:"not null;default:false"`
	UnsubscribeToken  *string         `gorm:"size:64"`
	LastDigestAt      *time.Time
	ProfilePublic     bool   `gorm:"not null;default:false"`
	ShowActivity      bool   `gorm:"not null;default:false"`
	Theme             string `gorm:"size:10;not null;default:'system'"`
	Language          string `gorm:"size:10;not null;default:'en'"`
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

func (UserPreferences) TableName() string { return "user_preferences" }

type UserConsent struct {
	ID              uint   `gorm:"primaryKey;autoIncrement"`
	UserID          uint   `gorm:"not null;index"`
	PolicyVersion   string `gorm:"size:32;not null"`
	Analytics       bool   `gorm:"not null"`
	Personalization bool   `gorm:"not null"`
	Marketing       bool   `gorm:"not null"`
	IPHash          string `gorm:"column:ip_hash;size:32"`
	CreatedAt       time.Time
}

func (UserConsent) TableName() string { return "user_consents" }

const (
	EmailStatusPending = "pending"
	EmailStatusSending = "sending"
	EmailStatusSent    = "sent"
	EmailStatusDead    = "dead"
)

type EmailQueueItem struct {
	ID            uint                   `gorm:"primaryKey;autoIncrement"`
	UserID        *uint                  `gorm:"index"`
	ToEmail       string                 `gorm:"size:320;not null"`
	Template      string                 `gorm:"size:40;not null"`
	Subject       string                 `gorm:"size:255;not null"`
	Data          map[string]interface{} `gorm:"type:jsonb;serializer:json;not null"`
	Status        string                 `gorm:"size:12;not null;default:'pending'"`
	Attempts      int                    `gorm:"not null;default:0"`
	MaxAttempts   int                    `gorm:"not null;default:6"`
	NextAttemptAt time.Time              `gorm:"not null"`
	LockedUntil   *time.Time
	LastError     *string `gorm:"type:text"`
	DedupeKey     *string `gorm:"size:120"`
	CreatedAt     time.Time
	SentAt        *time.Time
}

func (EmailQueueItem) TableName() string { return "email_queue" }
