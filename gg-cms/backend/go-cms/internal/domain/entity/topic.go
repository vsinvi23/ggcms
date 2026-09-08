package entity

import "time"

type Topic struct {
	ID          uint   `gorm:"primaryKey;autoIncrement"`
	Name        string `gorm:"type:varchar(200);not null"`
	Slug        string `gorm:"type:varchar(220);uniqueIndex;not null"`
	EntityType  string `gorm:"type:varchar(30);not null;default:'concept'"`
	Description string `gorm:"type:text"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (Topic) TableName() string { return "topics" }

type TopicAlias struct {
	ID      uint   `gorm:"primaryKey;autoIncrement"`
	TopicID uint   `gorm:"not null;index"`
	Alias   string `gorm:"type:varchar(200);not null"`
}

func (TopicAlias) TableName() string { return "topic_aliases" }

type TopicRelationship struct {
	ID               uint   `gorm:"primaryKey;autoIncrement"`
	SourceTopicID    uint   `gorm:"not null;index"`
	TargetTopicID    uint   `gorm:"not null;index"`
	RelationshipType string `gorm:"type:varchar(30);not null"`
	CreatedAt        time.Time
}

func (TopicRelationship) TableName() string { return "topic_relationships" }

type ContentTopic struct {
	ContentID   uint   `gorm:"primaryKey;not null"`
	ContentType string `gorm:"primaryKey;type:varchar(20);not null"`
	TopicID     uint   `gorm:"primaryKey;not null;index"`
}

func (ContentTopic) TableName() string { return "content_topics" }
