package entity

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// AuditLog records every significant administrative or content action in the system.
// Stored in MongoDB for schema flexibility and high write throughput.
//
// Action naming convention: "{resource}.{verb}"
//
//	Examples: "user.created", "group.member_added", "article.deleted"
//
// ─────────────────────────────────────────────────────────────────────────────
// Admin-visible actions covered by this entity:
//
//	Auth        : user.login, user.registered
//	Users       : user.created, user.updated, user.deleted, user.activated, user.deactivated
//	Groups      : group.created, group.updated, group.deleted, group.member_added, group.member_removed
//	Categories  : category.created, category.updated, category.deleted
//	Content types: content_type.created, content_type.updated, content_type.deleted
//	Tags        : tag.created, tag.deleted, tag.category_tags_updated
//	Learning paths: learning_path.created, learning_path.updated, learning_path.deleted, learning_path.courses_updated
//	Sections    : section.created, section.updated, section.deleted
//	Lessons     : lesson.created, lesson.updated, lesson.deleted
//	Articles    : article.created, article.updated, article.deleted
//	Courses     : course.created, course.updated, course.deleted
//	Enrollments : enrollment.created
//
// Content workflow transitions (submit→review→publish etc.) are logged separately
// via WorkflowEvent which includes richer status-transition metadata.
type AuditLog struct {
	ID         primitive.ObjectID     `bson:"_id,omitempty"  json:"id"`
	Action     string                 `bson:"action"         json:"action"`     // e.g. "user.created"
	ActorID    uint                   `bson:"actor_id"       json:"actorId"`   // 0 for unauthenticated (public registration/login)
	ActorEmail string                 `bson:"actor_email"    json:"actorEmail"`
	TargetType string                 `bson:"target_type"    json:"targetType"` // e.g. "user", "group", "article"
	TargetID   string                 `bson:"target_id"      json:"targetId"`   // stringified ID for flexibility
	TargetName string                 `bson:"target_name"    json:"targetName"` // human-readable label
	Meta       map[string]interface{} `bson:"meta,omitempty" json:"meta,omitempty"` // optional extra context
	IPAddress  string                 `bson:"ip,omitempty"   json:"ip,omitempty"`
	CreatedAt  time.Time              `bson:"created_at"     json:"createdAt"`
}
