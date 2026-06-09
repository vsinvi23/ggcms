package mongodb

import (
	"context"
	"fmt"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type noteRepository struct {
	collection *mongo.Collection
}

func NewNoteRepository(db *mongo.Database) repository.NoteRepository {
	coll := db.Collection("notes")
	// Unique compound index: one note per user per content item.
	coll.Indexes().CreateOne(context.Background(), mongo.IndexModel{
		Keys: bson.D{
			{Key: "user_id", Value: 1},
			{Key: "content_type", Value: 1},
			{Key: "content_id", Value: 1},
		},
		Options: options.Index().SetUnique(true),
	})
	return &noteRepository{collection: coll}
}

// Upsert creates or replaces the user's note for a content item.
func (r *noteRepository) Upsert(ctx context.Context, n *entity.Note) error {
	filter := bson.M{
		"user_id":      n.UserID,
		"content_type": n.ContentType,
		"content_id":   n.ContentID,
	}
	now := time.Now()
	if n.ID.IsZero() {
		n.ID = primitive.NewObjectID()
		n.CreatedAt = now
	}
	n.UpdatedAt = now

	update := bson.M{"$set": n}
	opts := options.Update().SetUpsert(true)
	_, err := r.collection.UpdateOne(ctx, filter, update, opts)
	return err
}

// FindByUser retrieves the user's note for a content item, or nil if none exists.
func (r *noteRepository) FindByUser(ctx context.Context, userID uint, contentType string, contentID uint) (*entity.Note, error) {
	filter := bson.M{
		"user_id":      userID,
		"content_type": contentType,
		"content_id":   contentID,
	}
	var note entity.Note
	err := r.collection.FindOne(ctx, filter).Decode(&note)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, err
	}
	return &note, nil
}

// ListByUser returns all notes for a user, newest-first, paginated.
func (r *noteRepository) ListByUser(ctx context.Context, userID uint, page, size int) ([]*entity.Note, int64, error) {
	filter := bson.M{"user_id": userID}

	total, err := r.collection.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}

	skip := int64(page * size)
	opts := options.Find().
		SetSort(bson.M{"updated_at": -1}).
		SetSkip(skip).
		SetLimit(int64(size))

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cursor.Close(ctx)

	var notes []*entity.Note
	if err := cursor.All(ctx, &notes); err != nil {
		return nil, 0, err
	}
	return notes, total, nil
}

// Delete removes a note by its hex ID, only if it belongs to the given user.
func (r *noteRepository) Delete(ctx context.Context, id string, userID uint) error {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return fmt.Errorf("invalid note ID: %w", err)
	}
	filter := bson.M{"_id": oid, "user_id": userID}
	result, err := r.collection.DeleteOne(ctx, filter)
	if err != nil {
		return err
	}
	if result.DeletedCount == 0 {
		return fmt.Errorf("note not found or not owned by user")
	}
	return nil
}
