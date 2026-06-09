package entity

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// AnalyticsEvent is stored in MongoDB. Write-heavy, high-volume data.
type AnalyticsEvent struct {
	ID          primitive.ObjectID     `bson:"_id,omitempty" json:"id"`
	EventType   string                 `bson:"event_type" json:"eventType"` // "page_view","article_read","course_enrolled","lesson_completed"
	UserID      *uint                  `bson:"user_id,omitempty" json:"userId,omitempty"`
	ContentID   *string                `bson:"content_id,omitempty" json:"contentId,omitempty"`
	ContentType *string                `bson:"content_type,omitempty" json:"contentType,omitempty"`
	Metadata    map[string]interface{} `bson:"metadata,omitempty" json:"metadata,omitempty"`
	IPAddress   string                 `bson:"ip_address" json:"ipAddress"`
	UserAgent   string                 `bson:"user_agent" json:"userAgent"`
	CreatedAt   time.Time              `bson:"created_at" json:"createdAt"`
}
