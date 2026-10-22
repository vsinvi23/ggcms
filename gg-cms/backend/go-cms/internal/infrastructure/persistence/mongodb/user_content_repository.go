package mongodb

import (
	"context"

	"github.com/serenya/go-cms/internal/domain/repository"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var userContentCollections = []string{"notes", "highlights", "favourites", "reactions"}

type userContentRepository struct {
	db *mongo.Database
}

func NewUserContentRepository(db *mongo.Database) repository.UserContentRepository {
	return &userContentRepository{db: db}
}

func (r *userContentRepository) Export(ctx context.Context, userID uint) (map[string][]map[string]interface{}, error) {
	out := map[string][]map[string]interface{}{}
	for _, name := range userContentCollections {
		cur, err := r.db.Collection(name).Find(ctx, bson.M{"user_id": userID}, options.Find().SetLimit(10000))
		if err != nil {
			return nil, err
		}
		rows := []map[string]interface{}{}
		if err := cur.All(ctx, &rows); err != nil {
			return nil, err
		}
		for _, row := range rows {
			delete(row, "_id")
			delete(row, "user_id")
		}
		out[name] = rows
	}
	return out, nil
}

func (r *userContentRepository) Erase(ctx context.Context, userID uint) (map[string]int64, error) {
	counts := map[string]int64{}
	for _, name := range userContentCollections {
		res, err := r.db.Collection(name).DeleteMany(ctx, bson.M{"user_id": userID})
		if err != nil {
			return counts, err
		}
		counts[name] = res.DeletedCount
	}
	comments := r.db.Collection("review_comments")
	scrub := bson.M{"$set": bson.M{"author_name": "Deleted user", "author_email": ""}}
	if res, err := comments.UpdateMany(ctx, bson.M{"author_id": userID}, scrub); err != nil {
		return counts, err
	} else {
		counts["review_comments"] = res.ModifiedCount
	}
	_, err := comments.UpdateMany(ctx, bson.M{"replies.author_id": userID},
		bson.M{"$set": bson.M{"replies.$[r].author_name": "Deleted user", "replies.$[r].author_email": ""}},
		options.Update().SetArrayFilters(options.ArrayFilters{Filters: []interface{}{bson.M{"r.author_id": userID}}}))
	return counts, err
}
