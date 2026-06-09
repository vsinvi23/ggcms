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

type auditLogRepository struct {
	collection *mongo.Collection
}

// NewAuditLogRepository creates the MongoDB-backed audit log store and ensures indexes.
func NewAuditLogRepository(db *mongo.Database) repository.AuditLogRepository {
	coll := db.Collection("audit_logs")

	// Compound index: most admin queries filter by action, target_type, or actor, sorted by time.
	coll.Indexes().CreateMany(context.Background(), []mongo.IndexModel{
		{Keys: bson.D{{Key: "created_at", Value: -1}}},
		{Keys: bson.D{{Key: "actor_id", Value: 1}, {Key: "created_at", Value: -1}}},
		{Keys: bson.D{{Key: "action", Value: 1}, {Key: "created_at", Value: -1}}},
		{Keys: bson.D{{Key: "target_type", Value: 1}, {Key: "created_at", Value: -1}}},
	})

	return &auditLogRepository{collection: coll}
}

// Create inserts a new audit log entry and sets its ID and timestamp.
func (r *auditLogRepository) Create(ctx context.Context, log *entity.AuditLog) error {
	log.ID = primitive.NewObjectID()
	log.CreatedAt = time.Now()
	_, err := r.collection.InsertOne(ctx, log)
	return err
}

// List returns audit logs matching the filter, newest-first, paginated.
func (r *auditLogRepository) List(ctx context.Context, filter repository.AuditLogFilter, page, size int) ([]*entity.AuditLog, int64, error) {
	f := bson.M{}

	if filter.Action != "" {
		f["action"] = filter.Action
	}
	if filter.TargetType != "" {
		f["target_type"] = filter.TargetType
	}
	if filter.ActorID != nil {
		f["actor_id"] = *filter.ActorID
	}

	timeFilter := bson.M{}
	if filter.From != nil {
		timeFilter["$gte"] = *filter.From
	}
	if filter.To != nil {
		timeFilter["$lte"] = *filter.To
	}
	if len(timeFilter) > 0 {
		f["created_at"] = timeFilter
	}

	total, err := r.collection.CountDocuments(ctx, f)
	if err != nil {
		return nil, 0, err
	}

	skip := int64(page * size)
	opts := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetSkip(skip).
		SetLimit(int64(size))

	cursor, err := r.collection.Find(ctx, f, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cursor.Close(ctx)

	var logs []*entity.AuditLog
	if err := cursor.All(ctx, &logs); err != nil {
		return nil, 0, err
	}
	return logs, total, nil
}
