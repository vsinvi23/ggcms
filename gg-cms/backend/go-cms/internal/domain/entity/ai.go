package entity

import "time"

type AIUsage struct {
	ID               uint      `gorm:"primaryKey;autoIncrement"`
	UserID           *uint     `gorm:"index"`
	Task             string    `gorm:"type:varchar(40);not null"`
	Model            string    `gorm:"type:varchar(80);not null;default:''"`
	InputTokens      int       `gorm:"not null;default:0"`
	OutputTokens     int       `gorm:"not null;default:0"`
	CacheReadTokens  int       `gorm:"not null;default:0"`
	CacheWriteTokens int       `gorm:"not null;default:0"`
	CostMicroUSD     int64     `gorm:"column:cost_micro_usd;not null;default:0"`
	LatencyMs        int       `gorm:"not null;default:0"`
	Status           string    `gorm:"type:varchar(20);not null;default:'ok'"`
	ErrorCode        string    `gorm:"type:varchar(40);not null;default:''"`
	CreatedAt        time.Time `gorm:"not null;default:now()"`
}

func (AIUsage) TableName() string { return "ai_usage" }

type AIDraft struct {
	ID           string `gorm:"primaryKey;type:varchar(36)"`
	Kind         string `gorm:"type:varchar(30);not null"`
	ContentType  string `gorm:"type:varchar(20);not null"`
	ContentID    uint   `gorm:"not null"`
	Payload      string `gorm:"type:jsonb;not null"`
	Status       string `gorm:"type:varchar(20);not null;default:'draft'"`
	CreatedByID  *uint  `gorm:"column:created_by_id"`
	ReviewedByID *uint  `gorm:"column:reviewed_by_id"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (AIDraft) TableName() string { return "ai_drafts" }

type ContentChunk struct {
	ID          uint      `gorm:"primaryKey;autoIncrement"`
	ContentType string    `gorm:"type:varchar(20);not null"`
	ContentID   uint      `gorm:"not null"`
	Ordinal     int       `gorm:"not null"`
	Title       string    `gorm:"type:text;not null;default:''"`
	Heading     string    `gorm:"type:text;not null;default:''"`
	Anchor      string    `gorm:"type:varchar(200);not null;default:''"`
	Body        string    `gorm:"type:text;not null"`
	SourceStamp time.Time `gorm:"not null"`
	CreatedAt   time.Time
}

func (ContentChunk) TableName() string { return "content_chunks" }

type AIConversation struct {
	ID        string `gorm:"primaryKey;type:varchar(36)"`
	UserID    uint   `gorm:"not null;index"`
	ScopeType string `gorm:"type:varchar(20);not null"`
	ScopeID   uint   `gorm:"not null"`
	Title     string `gorm:"type:varchar(200);not null;default:''"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (AIConversation) TableName() string { return "ai_conversations" }

type AIMessage struct {
	ID              uint   `gorm:"primaryKey;autoIncrement"`
	ConversationID  string `gorm:"type:varchar(36);not null;index"`
	Role            string `gorm:"type:varchar(12);not null"`
	Content         string `gorm:"type:text;not null"`
	Citations       string `gorm:"type:jsonb;not null;default:'[]'"`
	Grounded        bool   `gorm:"not null;default:true"`
	Rating          int    `gorm:"not null;default:0"`
	FeedbackComment string `gorm:"type:varchar(500);not null;default:''"`
	CreatedAt       time.Time
}

func (AIMessage) TableName() string { return "ai_messages" }

type AIModerationItem struct {
	ID           uint   `gorm:"primaryKey;autoIncrement"`
	CommentID    string `gorm:"type:varchar(40);not null;uniqueIndex"`
	ContentType  string `gorm:"type:varchar(20);not null;default:''"`
	ContentID    string `gorm:"type:varchar(64);not null;default:''"`
	AuthorID     uint   `gorm:"not null;default:0"`
	Excerpt      string `gorm:"type:varchar(500);not null;default:''"`
	Reasons      string `gorm:"type:jsonb;not null;default:'[]'"`
	Source       string `gorm:"type:varchar(20);not null;default:'heuristic'"`
	Status       string `gorm:"type:varchar(20);not null;default:'pending_review'"`
	ReviewedByID *uint  `gorm:"column:reviewed_by_id"`
	ReviewedAt   *time.Time
	CreatedAt    time.Time
}

func (AIModerationItem) TableName() string { return "ai_moderation_items" }
