package entity

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

const AnalyticsSchemaVersion = 1

// AnalyticsEvent is stored in MongoDB. Write-heavy, high-volume data.
// CreatedAt is the server timestamp; ClientTS is the (untrusted) client clock.
type AnalyticsEvent struct {
	ID            primitive.ObjectID     `bson:"_id,omitempty" json:"id"`
	SchemaVersion int                    `bson:"schema_version" json:"schemaVersion"`
	EventID       string                 `bson:"event_id,omitempty" json:"eventId,omitempty"`
	EventType     string                 `bson:"event_type" json:"eventType"`
	UserID        *uint                  `bson:"user_id,omitempty" json:"userId,omitempty"`
	VisitorID     string                 `bson:"visitor_id,omitempty" json:"visitorId,omitempty"`
	SessionID     string                 `bson:"session_id,omitempty" json:"sessionId,omitempty"`
	ContentID     *string                `bson:"content_id,omitempty" json:"contentId,omitempty"`
	ContentType   *string                `bson:"content_type,omitempty" json:"contentType,omitempty"`
	Metadata      map[string]interface{} `bson:"metadata,omitempty" json:"metadata,omitempty"`
	IPHash        string                 `bson:"ip_hash,omitempty" json:"-"`
	UserAgent     string                 `bson:"user_agent,omitempty" json:"-"`
	Source        string                 `bson:"source,omitempty" json:"source,omitempty"`
	Anonymous     bool                   `bson:"anonymous,omitempty" json:"anonymous,omitempty"`
	ClientTS      *time.Time             `bson:"client_ts,omitempty" json:"clientTs,omitempty"`
	CreatedAt     time.Time              `bson:"created_at" json:"createdAt"`
}

// AnalyticsRollup is a pre-aggregated daily bucket (kind: site|content|search|rec).
// Rollups are kept beyond the raw-event TTL.
type AnalyticsRollup struct {
	ID       string           `bson:"_id" json:"id"`
	Day      string           `bson:"day" json:"day"`
	DayTS    time.Time        `bson:"day_ts" json:"-"`
	Kind     string           `bson:"kind" json:"kind"`
	Key      string           `bson:"key" json:"key"`
	Label    string           `bson:"label,omitempty" json:"label,omitempty"`
	Counters map[string]int64 `bson:"counters" json:"counters"`
	Users    []uint           `bson:"users,omitempty" json:"-"`
}
