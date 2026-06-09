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

type reactionRepository struct {
	collection *mongo.Collection
}

func NewReactionRepository(db *mongo.Database) repository.ReactionRepository {
	coll := db.Collection("reactions")
	// Unique compound index: one reaction per user per content item.
	coll.Indexes().CreateMany(context.Background(), []mongo.IndexModel{
		{
			Keys: bson.D{
				{Key: "user_id", Value: 1},
				{Key: "content_type", Value: 1},
				{Key: "content_id", Value: 1},
			},
			Options: options.Index().SetUnique(true),
		},
		{Keys: bson.D{{Key: "content_type", Value: 1}, {Key: "content_id", Value: 1}}},
	})
	return &reactionRepository{collection: coll}
}

// Upsert inserts or replaces the user's reaction for a given content item.
func (r *reactionRepository) Upsert(ctx context.Context, reaction *entity.Reaction) error {
	filter := bson.M{
		"user_id":      reaction.UserID,
		"content_type": reaction.ContentType,
		"content_id":   reaction.ContentID,
	}
	now := time.Now()
	if reaction.ID.IsZero() {
		reaction.ID = primitive.NewObjectID()
		reaction.CreatedAt = now
	}
	reaction.UpdatedAt = now

	update := bson.M{"$set": reaction}
	opts := options.Update().SetUpsert(true)
	_, err := r.collection.UpdateOne(ctx, filter, update, opts)
	return err
}

// Delete removes the user's reaction for a content item.
func (r *reactionRepository) Delete(ctx context.Context, userID uint, contentType string, contentID uint) error {
	filter := bson.M{
		"user_id":      userID,
		"content_type": contentType,
		"content_id":   contentID,
	}
	result, err := r.collection.DeleteOne(ctx, filter)
	if err != nil {
		return err
	}
	if result.DeletedCount == 0 {
		return fmt.Errorf("reaction not found")
	}
	return nil
}

// FindByUser retrieves the user's current reaction for a content item.
func (r *reactionRepository) FindByUser(ctx context.Context, userID uint, contentType string, contentID uint) (*entity.Reaction, error) {
	filter := bson.M{
		"user_id":      userID,
		"content_type": contentType,
		"content_id":   contentID,
	}
	var reaction entity.Reaction
	err := r.collection.FindOne(ctx, filter).Decode(&reaction)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, err
	}
	return &reaction, nil
}

// CountBySentiment returns the like and dislike counts for a content item.
func (r *reactionRepository) CountBySentiment(ctx context.Context, contentType string, contentID uint) (likes, dislikes int64, err error) {
	base := bson.M{"content_type": contentType, "content_id": contentID}

	likes, err = r.collection.CountDocuments(ctx, bson.M{
		"content_type": base["content_type"],
		"content_id":   base["content_id"],
		"value":        "like",
	})
	if err != nil {
		return 0, 0, err
	}

	dislikes, err = r.collection.CountDocuments(ctx, bson.M{
		"content_type": base["content_type"],
		"content_id":   base["content_id"],
		"value":        "dislike",
	})
	return likes, dislikes, err
}
