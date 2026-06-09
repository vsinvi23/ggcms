package entity

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ReviewComment is stored in MongoDB. Replies are embedded for efficient read access.
type ReviewComment struct {
	ID          primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	Content     string              `bson:"content" json:"content"`
	ContentType string              `bson:"content_type" json:"contentType"` // "article", "course", "lesson"
	ContentID   string              `bson:"content_id" json:"contentId"`
	AuthorID    uint                `bson:"author_id" json:"authorId"`
	AuthorName  string              `bson:"author_name" json:"authorName"`
	AuthorEmail string              `bson:"author_email" json:"authorEmail"`
	ParentID    *primitive.ObjectID `bson:"parent_id,omitempty" json:"parentId,omitempty"`
	Replies     []ReviewComment     `bson:"replies,omitempty" json:"replies,omitempty"`
	CreatedAt   time.Time           `bson:"created_at" json:"createdAt"`
	UpdatedAt   time.Time           `bson:"updated_at" json:"updatedAt"`
}
