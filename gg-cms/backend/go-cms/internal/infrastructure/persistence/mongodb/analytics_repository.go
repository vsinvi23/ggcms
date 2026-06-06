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

type analyticsRepository struct {
	collection *mongo.Collection
}

func NewAnalyticsRepository(db *mongo.Database) repository.AnalyticsRepository {
	coll := db.Collection("analytics_events")
	// TTL index: auto-delete events older than 90 days
	expiry := int32(90 * 24 * 3600)
	coll.Indexes().CreateMany(context.Background(), []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "created_at", Value: 1}},
			Options: options.Index().SetExpireAfterSeconds(expiry),
		},
		{Keys: bson.D{{Key: "event_type", Value: 1}}},
		{Keys: bson.D{{Key: "content_id", Value: 1}, {Key: "content_type", Value: 1}}},
	})
	return &analyticsRepository{collection: coll}
}

func (r *analyticsRepository) TrackEvent(ctx context.Context, event *entity.AnalyticsEvent) error {
	event.ID = primitive.NewObjectID()
	event.CreatedAt = time.Now()
	_, err := r.collection.InsertOne(ctx, event)
	return err
}

func (r *analyticsRepository) GetContentViews(ctx context.Context, contentID, contentType string) (int64, error) {
	filter := bson.M{
		"event_type":   "page_view",
		"content_id":   contentID,
		"content_type": contentType,
	}
	return r.collection.CountDocuments(ctx, filter)
}

func (r *analyticsRepository) GetDashboardStats(ctx context.Context) (map[string]interface{}, error) {
	thirtyDaysAgo := time.Now().AddDate(0, 0, -30)

	// Total page views in last 30 days
	pageViewCount, err := r.collection.CountDocuments(ctx, bson.M{
		"event_type": "page_view",
		"created_at": bson.M{"$gte": thirtyDaysAgo},
	})
	if err != nil {
		return nil, err
	}

	// Top content by views (aggregate)
	pipeline := mongo.Pipeline{
		bson.D{{Key: "$match", Value: bson.M{
			"event_type": "page_view",
			"content_id": bson.M{"$exists": true},
			"created_at": bson.M{"$gte": thirtyDaysAgo},
		}}},
		bson.D{{Key: "$group", Value: bson.M{
			"_id":          bson.M{"content_id": "$content_id", "content_type": "$content_type"},
			"views":        bson.M{"$sum": 1},
		}}},
		bson.D{{Key: "$sort", Value: bson.M{"views": -1}}},
		bson.D{{Key: "$limit", Value: 5}},
	}

	cursor, err := r.collection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var topContent []map[string]interface{}
	cursor.All(ctx, &topContent)

	return map[string]interface{}{
		"page_views_30d": pageViewCount,
		"top_content":    topContent,
	}, nil
}
