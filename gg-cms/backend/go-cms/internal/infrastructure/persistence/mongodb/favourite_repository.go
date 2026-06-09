package mongodb

import (
	"context"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type favouriteRepository struct {
	collection *mongo.Collection
}

func NewFavouriteRepository(db *mongo.Database) repository.FavouriteRepository {
	coll := db.Collection("favourites")
	// Unique compound index: one favourite per user per content item.
	coll.Indexes().CreateOne(context.Background(), mongo.IndexModel{
		Keys: bson.D{
			{Key: "user_id", Value: 1},
			{Key: "content_type", Value: 1},
			{Key: "content_id", Value: 1},
		},
		Options: options.Index().SetUnique(true),
	})
	return &favouriteRepository{collection: coll}
}

// Toggle adds the favourite if it doesn't exist, or removes it if it does.
// Returns true when added, false when removed.
func (r *favouriteRepository) Toggle(ctx context.Context, f *entity.Favourite) (bool, error) {
	filter := bson.M{
		"user_id":      f.UserID,
		"content_type": f.ContentType,
		"content_id":   f.ContentID,
	}

	// Check if it already exists
	var existing entity.Favourite
	err := r.collection.FindOne(ctx, filter).Decode(&existing)
	if err == mongo.ErrNoDocuments {
		// Not yet favourited — insert it.
		f.ID = primitive.NewObjectID()
		f.CreatedAt = time.Now()
		if _, err := r.collection.InsertOne(ctx, f); err != nil {
			return false, err
		}
		return true, nil
	}
	if err != nil {
		return false, err
	}

	// Already favourited — remove it.
	if _, err := r.collection.DeleteOne(ctx, bson.M{"_id": existing.ID}); err != nil {
		return false, err
	}
	return false, nil
}

// IsFavourited checks whether the user has favourited a content item.
func (r *favouriteRepository) IsFavourited(ctx context.Context, userID uint, contentType string, contentID uint) (bool, error) {
	filter := bson.M{
		"user_id":      userID,
		"content_type": contentType,
		"content_id":   contentID,
	}
	count, err := r.collection.CountDocuments(ctx, filter)
	return count > 0, err
}

// ListByUser returns all favourites for a user, newest-first, paginated.
func (r *favouriteRepository) ListByUser(ctx context.Context, userID uint, page, size int) ([]*entity.Favourite, int64, error) {
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

	var favourites []*entity.Favourite
	if err := cursor.All(ctx, &favourites); err != nil {
		return nil, 0, err
	}
	return favourites, total, nil
}
