package entity

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Reaction stores a single user's like/dislike for an article or course.
// Stored in MongoDB; one document per (user_id, content_type, content_id).
type Reaction struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID      uint               `bson:"user_id" json:"userId"`
	ContentType string             `bson:"content_type" json:"contentType"` // "article" | "course"
	ContentID   uint               `bson:"content_id" json:"contentId"`
	Value       string             `bson:"value" json:"value"` // "like" | "dislike"
	CreatedAt   time.Time          `bson:"created_at" json:"createdAt"`
	UpdatedAt   time.Time          `bson:"updated_at" json:"updatedAt"`
}
