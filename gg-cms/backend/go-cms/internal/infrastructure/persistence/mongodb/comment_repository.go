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

type commentRepository struct {
	collection *mongo.Collection
}

func NewCommentRepository(db *mongo.Database) repository.CommentRepository {
	coll := db.Collection("review_comments")
	// Index on content_type + content_id for efficient lookups
	coll.Indexes().CreateOne(context.Background(), mongo.IndexModel{
		Keys: bson.D{
			{Key: "content_type", Value: 1},
			{Key: "content_id", Value: 1},
		},
	})
	return &commentRepository{collection: coll}
}

func (r *commentRepository) Create(ctx context.Context, comment *entity.ReviewComment) error {
	comment.ID = primitive.NewObjectID()
	comment.CreatedAt = time.Now()
	comment.UpdatedAt = time.Now()
	_, err := r.collection.InsertOne(ctx, comment)
	return err
}

func (r *commentRepository) Delete(ctx context.Context, id string) error {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return fmt.Errorf("invalid comment ID: %w", err)
	}
	result, err := r.collection.DeleteOne(ctx, bson.M{"_id": oid})
	if err != nil {
		return err
	}
	if result.DeletedCount == 0 {
		return fmt.Errorf("comment not found")
	}
	return nil
}

func (r *commentRepository) FindByContentTypeAndID(ctx context.Context, contentType, contentID string) ([]*entity.ReviewComment, error) {
	filter := bson.M{
		"content_type": contentType,
		"content_id":   contentID,
		"parent_id":    bson.M{"$exists": false},
	}
	opts := options.Find().SetSort(bson.M{"created_at": 1})
	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var comments []*entity.ReviewComment
	if err := cursor.All(ctx, &comments); err != nil {
		return nil, err
	}
	return comments, nil
}

func (r *commentRepository) FindByID(ctx context.Context, id string) (*entity.ReviewComment, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, fmt.Errorf("invalid comment ID: %w", err)
	}
	var comment entity.ReviewComment
	err = r.collection.FindOne(ctx, bson.M{"_id": oid}).Decode(&comment)
	if err != nil {
		return nil, fmt.Errorf("comment not found: %w", err)
	}
	return &comment, nil
}

// AddReply embeds the reply inside the parent document and returns the created reply with IDs assigned.
func (r *commentRepository) AddReply(ctx context.Context, parentID string, reply entity.ReviewComment) (*entity.ReviewComment, error) {
	oid, err := primitive.ObjectIDFromHex(parentID)
	if err != nil {
		return nil, fmt.Errorf("invalid parent ID: %w", err)
	}
	reply.ID = primitive.NewObjectID()
	reply.CreatedAt = time.Now()
	reply.UpdatedAt = time.Now()
	reply.ParentID = &oid

	_, err = r.collection.UpdateOne(ctx,
		bson.M{"_id": oid},
		bson.M{
			"$push": bson.M{"replies": reply},
			"$set":  bson.M{"updated_at": time.Now()},
		},
	)
	if err != nil {
		return nil, err
	}
	return &reply, nil
}

// FindReplies returns a paginated slice of embedded replies for a parent comment.
// skip/limit map directly to the $slice projection parameters.
func (r *commentRepository) FindReplies(ctx context.Context, parentID string, skip, limit int) ([]*entity.ReviewComment, int64, error) {
	oid, err := primitive.ObjectIDFromHex(parentID)
	if err != nil {
		return nil, 0, fmt.Errorf("invalid parent ID: %w", err)
	}
	// Count total replies via aggregation
	countPipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"_id": oid}}},
		{{Key: "$project", Value: bson.M{
			"count": bson.M{"$size": bson.M{"$ifNull": []interface{}{"$replies", bson.A{}}}},
		}}},
	}
	countCursor, err := r.collection.Aggregate(ctx, countPipeline)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count replies: %w", err)
	}
	defer countCursor.Close(ctx)

	var countResult []struct {
		Count int64 `bson:"count"`
	}
	if err := countCursor.All(ctx, &countResult); err != nil {
		return nil, 0, err
	}
	var total int64
	if len(countResult) > 0 {
		total = countResult[0].Count
	}

	// Fetch paginated slice using $slice projection
	projection := bson.M{"replies": bson.M{"$slice": []int{skip, limit}}}
	var doc entity.ReviewComment
	err = r.collection.FindOne(ctx, bson.M{"_id": oid}, options.FindOne().SetProjection(projection)).Decode(&doc)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, 0, fmt.Errorf("comment not found")
		}
		return nil, 0, fmt.Errorf("failed to fetch replies: %w", err)
	}

	replies := make([]*entity.ReviewComment, len(doc.Replies))
	for i := range doc.Replies {
		replies[i] = &doc.Replies[i]
	}
	return replies, total, nil
}
