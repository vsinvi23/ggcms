package mongodb

import (
	"context"
	"errors"
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
	rollups    *mongo.Collection
}

func NewAnalyticsRepository(db *mongo.Database, rawRetentionDays, rollupRetentionDays int) repository.AnalyticsStore {
	if rawRetentionDays <= 0 {
		rawRetentionDays = 90
	}
	if rollupRetentionDays <= 0 {
		rollupRetentionDays = 730
	}
	coll := db.Collection("analytics_events")
	rollups := db.Collection("analytics_rollups")
	ctx := context.Background()

	ensureTTL(ctx, db, coll, "created_at", int32(rawRetentionDays*24*3600))
	_, _ = coll.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "event_type", Value: 1}, {Key: "created_at", Value: 1}}},
		{Keys: bson.D{{Key: "content_id", Value: 1}, {Key: "content_type", Value: 1}}},
		{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "created_at", Value: 1}}, Options: options.Index().SetSparse(true)},
		{Keys: bson.D{{Key: "event_id", Value: 1}}, Options: options.Index().SetUnique(true).SetPartialFilterExpression(bson.M{"event_id": bson.M{"$exists": true}})},
	})
	ensureTTL(ctx, db, rollups, "day_ts", int32(rollupRetentionDays*24*3600))
	_, _ = rollups.Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: "kind", Value: 1}, {Key: "day_ts", Value: 1}}})

	go func() {
		c, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		_, _ = coll.UpdateMany(c, bson.M{"ip_address": bson.M{"$exists": true}}, bson.M{"$unset": bson.M{"ip_address": ""}})
	}()

	return &analyticsRepository{collection: coll, rollups: rollups}
}

func ensureTTL(ctx context.Context, db *mongo.Database, coll *mongo.Collection, field string, seconds int32) {
	_, err := coll.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: field, Value: 1}},
		Options: options.Index().SetExpireAfterSeconds(seconds),
	})
	if err == nil {
		return
	}
	_ = db.RunCommand(ctx, bson.D{
		{Key: "collMod", Value: coll.Name()},
		{Key: "index", Value: bson.D{{Key: "keyPattern", Value: bson.D{{Key: field, Value: 1}}}, {Key: "expireAfterSeconds", Value: seconds}}},
	}).Err()
}

func (r *analyticsRepository) TrackEvent(ctx context.Context, event *entity.AnalyticsEvent) error {
	event.ID = primitive.NewObjectID()
	if event.CreatedAt.IsZero() {
		event.CreatedAt = time.Now().UTC()
	}
	if event.SchemaVersion == 0 {
		event.SchemaVersion = entity.AnalyticsSchemaVersion
	}
	_, err := r.collection.InsertOne(ctx, event)
	return err
}

func (r *analyticsRepository) InsertEvents(ctx context.Context, events []*entity.AnalyticsEvent) error {
	if len(events) == 0 {
		return nil
	}
	docs := make([]interface{}, len(events))
	for i, e := range events {
		e.ID = primitive.NewObjectID()
		docs[i] = e
	}
	_, err := r.collection.InsertMany(ctx, docs, options.InsertMany().SetOrdered(false))
	var bulk mongo.BulkWriteException
	if errors.As(err, &bulk) {
		for _, we := range bulk.WriteErrors {
			if we.Code != 11000 {
				return err
			}
		}
		return nil
	}
	return err
}

func (r *analyticsRepository) GetContentViews(ctx context.Context, contentID, contentType string) (int64, error) {
	return r.collection.CountDocuments(ctx, bson.M{
		"event_type":   "page_view",
		"content_id":   contentID,
		"content_type": contentType,
	})
}

func (r *analyticsRepository) GetDashboardStats(ctx context.Context) (map[string]interface{}, error) {
	since := time.Now().AddDate(0, 0, -30)

	pageViewCount, err := r.collection.CountDocuments(ctx, bson.M{
		"event_type": "page_view",
		"created_at": bson.M{"$gte": since},
	})
	if err != nil {
		return nil, err
	}

	pipeline := mongo.Pipeline{
		bson.D{{Key: "$match", Value: bson.M{
			"event_type": "page_view",
			"content_id": bson.M{"$exists": true},
			"created_at": bson.M{"$gte": since},
		}}},
		bson.D{{Key: "$group", Value: bson.M{
			"_id":   bson.M{"content_id": "$content_id", "content_type": "$content_type"},
			"views": bson.M{"$sum": 1},
		}}},
		bson.D{{Key: "$sort", Value: bson.M{"views": -1}}},
		bson.D{{Key: "$limit", Value: 5}},
	}
	cursor, err := r.collection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var rows []struct {
		ID struct {
			ContentID   string `bson:"content_id"`
			ContentType string `bson:"content_type"`
		} `bson:"_id"`
		Views int64 `bson:"views"`
	}
	if err := cursor.All(ctx, &rows); err != nil {
		return nil, err
	}
	top := make([]map[string]interface{}, 0, len(rows))
	for _, row := range rows {
		top = append(top, map[string]interface{}{"contentId": row.ID.ContentID, "contentType": row.ID.ContentType, "views": row.Views})
	}
	return map[string]interface{}{"page_views_30d": pageViewCount, "top_content": top}, nil
}

func (r *analyticsRepository) EventsBetween(ctx context.Context, from, to time.Time, fn func(*entity.AnalyticsEvent)) error {
	cur, err := r.collection.Find(ctx,
		bson.M{"created_at": bson.M{"$gte": from, "$lt": to}},
		options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}}).SetBatchSize(1000))
	if err != nil {
		return err
	}
	defer cur.Close(ctx)
	for cur.Next(ctx) {
		var e entity.AnalyticsEvent
		if err := cur.Decode(&e); err != nil {
			continue
		}
		fn(&e)
	}
	return cur.Err()
}

func (r *analyticsRepository) ReplaceRollups(ctx context.Context, day string, rollups []*entity.AnalyticsRollup) error {
	if _, err := r.rollups.DeleteMany(ctx, bson.M{"day": day}); err != nil {
		return err
	}
	if len(rollups) == 0 {
		return nil
	}
	docs := make([]interface{}, len(rollups))
	for i, ru := range rollups {
		docs[i] = ru
	}
	_, err := r.rollups.InsertMany(ctx, docs)
	return err
}

func (r *analyticsRepository) RollupsBetween(ctx context.Context, kind string, from, to time.Time) ([]*entity.AnalyticsRollup, error) {
	cur, err := r.rollups.Find(ctx, bson.M{"kind": kind, "day_ts": bson.M{"$gte": from, "$lt": to}})
	if err != nil {
		return nil, err
	}
	var out []*entity.AnalyticsRollup
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (r *analyticsRepository) HasRollups(ctx context.Context, day string) (bool, error) {
	n, err := r.rollups.CountDocuments(ctx, bson.M{"day": day}, options.Count().SetLimit(1))
	return n > 0, err
}

func (r *analyticsRepository) UserEventStats(ctx context.Context, userIDs []uint, since time.Time) (map[uint]repository.UserEventStat, error) {
	out := map[uint]repository.UserEventStat{}
	if len(userIDs) == 0 {
		return out, nil
	}
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"user_id": bson.M{"$in": userIDs}, "created_at": bson.M{"$gte": since}}}},
		{{Key: "$group", Value: bson.M{
			"_id":     bson.M{"u": "$user_id", "d": bson.M{"$dateToString": bson.M{"format": "%Y-%m-%d", "date": "$created_at"}}},
			"reads":   bson.M{"$sum": bson.M{"$cond": bson.A{bson.M{"$eq": bson.A{"$event_type", "article_read"}}, 1, 0}}},
			"lessons": bson.M{"$sum": bson.M{"$cond": bson.A{bson.M{"$eq": bson.A{"$event_type", "lesson_completed"}}, 1, 0}}},
			"n":       bson.M{"$sum": 1},
			"last":    bson.M{"$max": "$created_at"},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id":     "$_id.u",
			"days":    bson.M{"$sum": 1},
			"reads":   bson.M{"$sum": "$reads"},
			"lessons": bson.M{"$sum": "$lessons"},
			"n":       bson.M{"$sum": "$n"},
			"last":    bson.M{"$max": "$last"},
		}}},
	}
	cur, err := r.collection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	var rows []struct {
		ID      uint      `bson:"_id"`
		Days    int       `bson:"days"`
		Reads   int       `bson:"reads"`
		Lessons int       `bson:"lessons"`
		N       int       `bson:"n"`
		Last    time.Time `bson:"last"`
	}
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[row.ID] = repository.UserEventStat{ActiveDays: row.Days, Reads: row.Reads, LessonsComplete: row.Lessons, Events: row.N, LastEventAt: row.Last}
	}
	return out, nil
}

func (r *analyticsRepository) DeleteByUser(ctx context.Context, userID uint) (int64, error) {
	res, err := r.collection.DeleteMany(ctx, bson.M{"user_id": userID})
	if err != nil {
		return 0, err
	}
	_, err = r.rollups.UpdateMany(ctx, bson.M{"users": userID}, bson.M{"$pull": bson.M{"users": userID}})
	return res.DeletedCount, err
}
