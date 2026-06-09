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

type highlightRepository struct {
	collection *mongo.Collection
}

func NewHighlightRepository(db *mongo.Database) repository.HighlightRepository {
	coll := db.Collection("highlights")
	coll.Indexes().CreateOne(context.Background(), mongo.IndexModel{
		Keys: bson.D{
			{Key: "user_id", Value: 1},
			{Key: "content_type", Value: 1},
			{Key: "content_id", Value: 1},
		},
	})
	return &highlightRepository{collection: coll}
}

func (r *highlightRepository) Create(ctx context.Context, h *entity.Highlight) error {
	h.ID = primitive.NewObjectID()
	h.CreatedAt = time.Now()
	_, err := r.collection.InsertOne(ctx, h)
	return err
}

func (r *highlightRepository) ListByUser(ctx context.Context, userID uint, contentType string, contentID uint) ([]*entity.Highlight, error) {
	filter := bson.M{
		"user_id":      userID,
		"content_type": contentType,
		"content_id":   contentID,
	}
	opts := options.Find().SetSort(bson.M{"created_at": 1})
	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var highlights []*entity.Highlight
	if err := cursor.All(ctx, &highlights); err != nil {
		return nil, err
	}
	return highlights, nil
}

func (r *highlightRepository) ListAllByUser(ctx context.Context, userID uint, page, size int) ([]*entity.Highlight, int64, error) {
	filter := bson.M{"user_id": userID}

	total, err := r.collection.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}

	skip := int64(page * size)
	opts := options.Find().
		SetSort(bson.M{"created_at": -1}).
		SetSkip(skip).
		SetLimit(int64(size))

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cursor.Close(ctx)

	var highlights []*entity.Highlight
	if err := cursor.All(ctx, &highlights); err != nil {
		return nil, 0, err
	}
	return highlights, total, nil
}

func (r *highlightRepository) Update(ctx context.Context, id string, userID uint, note string, color string) error {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return fmt.Errorf("invalid highlight ID: %w", err)
	}
	filter := bson.M{"_id": oid, "user_id": userID}
	set := bson.M{"updated_at": time.Now()}
	if note != "" {
		set["note"] = note
	} else {
		// allow clearing the note by storing an empty string
		set["note"] = ""
	}
	if color != "" {
		set["color"] = color
	}
	result, err := r.collection.UpdateOne(ctx, filter, bson.M{"$set": set})
	if err != nil {
		return err
	}
	if result.MatchedCount == 0 {
		return fmt.Errorf("highlight not found or not owned by user")
	}
	return nil
}

func (r *highlightRepository) Delete(ctx context.Context, id string, userID uint) error {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return fmt.Errorf("invalid highlight ID: %w", err)
	}
	filter := bson.M{"_id": oid, "user_id": userID}
	result, err := r.collection.DeleteOne(ctx, filter)
	if err != nil {
		return err
	}
	if result.DeletedCount == 0 {
		return fmt.Errorf("highlight not found or not owned by user")
	}
	return nil
}
