package entity

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Note is a user-editable text note attached to a single article or course.
// Stored in MongoDB. One note per (user_id, content_type, content_id).
type Note struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID      uint               `bson:"user_id" json:"userId"`
	ContentType string             `bson:"content_type" json:"contentType"` // "article" | "course"
	ContentID   uint               `bson:"content_id" json:"contentId"`
	Body        string             `bson:"body" json:"body"`
	CreatedAt   time.Time          `bson:"created_at" json:"createdAt"`
	UpdatedAt   time.Time          `bson:"updated_at" json:"updatedAt"`
}
