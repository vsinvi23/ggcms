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

// workflowEventDoc is the MongoDB-native representation of a workflow audit event.
// User name is denormalised here since MongoDB does not support relational joins.
type workflowEventDoc struct {
	ID         primitive.ObjectID `bson:"_id,omitempty"`
	EntityType string             `bson:"entity_type"`
	EntityID   uint               `bson:"entity_id"`
	UserID     uint               `bson:"user_id"`
	UserName   string             `bson:"user_name"`
	FromStatus string             `bson:"from_status"`
	ToStatus   string             `bson:"to_status"`
	Action     string             `bson:"action"`
	Comment    *string            `bson:"comment,omitempty"`
	CreatedAt  time.Time          `bson:"created_at"`
}

type workflowEventRepository struct {
	collection *mongo.Collection
}

func NewWorkflowEventRepository(db *mongo.Database) repository.WorkflowEventRepository {
	coll := db.Collection("workflow_events")
	// Compound index for the most common query: all events for a given entity
	coll.Indexes().CreateOne(context.Background(), mongo.IndexModel{
		Keys: bson.D{
			{Key: "entity_type", Value: 1},
			{Key: "entity_id", Value: 1},
			{Key: "created_at", Value: 1},
		},
	})
	return &workflowEventRepository{collection: coll}
}

// Create inserts a new workflow event document.
// ev.User.Name is stored as user_name for denormalised display.
func (r *workflowEventRepository) Create(ctx context.Context, ev *entity.WorkflowEvent) error {
	doc := workflowEventDoc{
		ID:         primitive.NewObjectID(),
		EntityType: ev.EntityType,
		EntityID:   ev.EntityID,
		UserID:     ev.UserID,
		UserName:   ev.User.Name,
		FromStatus: ev.FromStatus,
		ToStatus:   ev.ToStatus,
		Action:     ev.Action,
		Comment:    ev.Comment,
		CreatedAt:  time.Now(),
	}
	_, err := r.collection.InsertOne(ctx, doc)
	return err
}

// FindByEntity returns all workflow events for a given entity, ordered by created_at ASC.
// User.Name is populated from the stored user_name field so the HTTP handler can read it normally.
func (r *workflowEventRepository) FindByEntity(ctx context.Context, entityType string, entityID uint) ([]*entity.WorkflowEvent, error) {
	filter := bson.M{
		"entity_type": entityType,
		"entity_id":   entityID,
	}
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var docs []workflowEventDoc
	if err := cursor.All(ctx, &docs); err != nil {
		return nil, err
	}

	events := make([]*entity.WorkflowEvent, len(docs))
	for i, doc := range docs {
		events[i] = &entity.WorkflowEvent{
			EntityType: doc.EntityType,
			EntityID:   doc.EntityID,
			UserID:     doc.UserID,
			FromStatus: doc.FromStatus,
			ToStatus:   doc.ToStatus,
			Action:     doc.Action,
			Comment:    doc.Comment,
			CreatedAt:  doc.CreatedAt,
			// Populate User.Name from the denormalised field so the handler
			// can use ev.User.Name without any join.
			User: entity.User{Name: doc.UserName},
		}
	}
	return events, nil
}
