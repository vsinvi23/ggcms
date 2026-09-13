package entity

import "time"

type Topic struct {
	ID                uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	Name              string    `gorm:"type:varchar(200);not null" json:"name"`
	Slug              string    `gorm:"type:varchar(220);uniqueIndex;not null" json:"slug"`
	EntityType        string    `gorm:"type:varchar(30);not null;default:'concept'" json:"entity_type"`
	Description       string    `gorm:"type:text" json:"description"`
	Status            string    `gorm:"type:varchar(20);not null;default:'ACTIVE'" json:"status"`
	MergedIntoTopicID *uint     `gorm:"index" json:"merged_into_topic_id,omitempty"`
	ParentTopicID     *uint     `gorm:"index" json:"parent_topic_id,omitempty"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

func (Topic) TableName() string { return "topics" }

type TopicAlias struct {
	ID              uint   `gorm:"primaryKey;autoIncrement" json:"id"`
	TopicID         uint   `gorm:"not null;index" json:"topic_id"`
	Alias           string `gorm:"type:varchar(200);not null" json:"alias"`
	NormalizedAlias string `gorm:"type:varchar(200);uniqueIndex" json:"normalized_alias"`
	Status          string `gorm:"type:varchar(20);not null;default:'ACTIVE'" json:"status"`
}

func (TopicAlias) TableName() string { return "topic_aliases" }

type TopicRelationship struct {
	ID               uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	SourceTopicID    uint      `gorm:"not null;index" json:"source_topic_id"`
	TargetTopicID    uint      `gorm:"not null;index" json:"target_topic_id"`
	RelationshipType string    `gorm:"type:varchar(30);not null" json:"relationship_type"`
	Weight           float64   `gorm:"not null;default:1.0" json:"weight"`
	Confidence       float64   `gorm:"not null;default:1.0" json:"confidence"`
	SourceType       string    `gorm:"type:varchar(20);not null;default:'SYSTEM'" json:"source_type"`
	SourceReference  string    `gorm:"type:text" json:"source_reference,omitempty"`
	Status           string    `gorm:"type:varchar(20);not null;default:'ACTIVE'" json:"status"`
	CreatedBy        *uint     `json:"created_by,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

func (TopicRelationship) TableName() string { return "topic_relationships" }

type ContentTopic struct {
	ContentID   uint    `gorm:"primaryKey;not null" json:"content_id"`
	ContentType string  `gorm:"primaryKey;type:varchar(20);not null" json:"content_type"`
	TopicID     uint    `gorm:"primaryKey;not null;index" json:"topic_id"`
	Role        string  `gorm:"type:varchar(20);not null;default:'PRIMARY'" json:"role"`
	Weight      float64 `gorm:"not null;default:1.0" json:"weight"`
}

func (ContentTopic) TableName() string { return "content_topics" }

