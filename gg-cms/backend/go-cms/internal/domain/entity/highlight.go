package entity

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Highlight stores a user-selected text range within an article or course body.
// Stored in MongoDB for schema flexibility.
type Highlight struct {
	ID           primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID       uint               `bson:"user_id" json:"userId"`
	ContentType  string             `bson:"content_type" json:"contentType"` // "article" | "course"
	ContentID    uint               `bson:"content_id" json:"contentId"`
	ContentTitle string             `bson:"content_title,omitempty" json:"contentTitle"` // stored for display without a join
	ContentSlug  string             `bson:"content_slug,omitempty" json:"contentSlug"`   // stored for deep-link generation
	Text         string             `bson:"text" json:"text"`
	StartOffset  int                `bson:"start_offset" json:"startOffset"`
	EndOffset    int                `bson:"end_offset" json:"endOffset"`
	Color        string             `bson:"color" json:"color"`     // "yellow" | "green" | "blue"
	Note         string             `bson:"note,omitempty" json:"note"` // optional personal note attached to this highlight
	CreatedAt    time.Time          `bson:"created_at" json:"createdAt"`
	UpdatedAt    time.Time          `bson:"updated_at,omitempty" json:"updatedAt"`
}
