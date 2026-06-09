package entity

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Favourite marks an article or course as bookmarked by a user.
// Stored in MongoDB. One document per (user_id, content_type, content_id).
type Favourite struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID      uint               `bson:"user_id" json:"userId"`
	ContentType string             `bson:"content_type" json:"contentType"` // "article" | "course"
	ContentID   uint               `bson:"content_id" json:"contentId"`
	CreatedAt   time.Time          `bson:"created_at" json:"createdAt"`
}
