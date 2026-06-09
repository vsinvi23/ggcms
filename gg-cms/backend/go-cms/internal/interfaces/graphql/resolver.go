// Package graphql provides a GraphQL endpoint for public content browsing.
// It uses the graphql-go library to build a schema programmatically.
package graphql

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	categorysvc "github.com/serenya/go-cms/internal/application/category"
	cmssvc "github.com/serenya/go-cms/internal/application/cms"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/graphql-go/graphql"
)

// Handler wraps the compiled GraphQL schema.
type Handler struct {
	schema graphql.Schema
}

// NewHandler builds the full GraphQL schema wired to the given services.
func NewHandler(cmsSvc cmssvc.Service, catSvc categorysvc.Service) (*Handler, error) {
	// --- Type Definitions ---

	categoryType := graphql.NewObject(graphql.ObjectConfig{
		Name: "Category",
		Fields: graphql.Fields{
			"id":   &graphql.Field{Type: graphql.ID, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return fmt.Sprintf("%d", p.Source.(*entity.Category).ID), nil }},
			"name": &graphql.Field{Type: graphql.String, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return p.Source.(*entity.Category).Name, nil }},
			"slug": &graphql.Field{Type: graphql.String, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return p.Source.(*entity.Category).Slug, nil }},
		},
	})

	articleType := graphql.NewObject(graphql.ObjectConfig{
		Name: "Article",
		Fields: graphql.Fields{
			"id":          &graphql.Field{Type: graphql.ID, Resolve: func(p graphql.ResolveParams) (interface{}, error) { a := p.Source.(*entity.Article); return fmt.Sprintf("%d", a.ID), nil }},
			"title":       &graphql.Field{Type: graphql.String, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return p.Source.(*entity.Article).Title, nil }},
			"description": &graphql.Field{Type: graphql.String, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return p.Source.(*entity.Article).Description, nil }},
			"body":        &graphql.Field{Type: graphql.String, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return p.Source.(*entity.Article).Body, nil }},
			"status":      &graphql.Field{Type: graphql.String, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return string(p.Source.(*entity.Article).Status), nil }},
			"thumbnailUrl": &graphql.Field{Type: graphql.String, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return p.Source.(*entity.Article).ThumbnailURL, nil }},
			"publishedAt": &graphql.Field{Type: graphql.String, Resolve: func(p graphql.ResolveParams) (interface{}, error) {
				a := p.Source.(*entity.Article)
				if a.PublishedAt != nil {
					return a.PublishedAt.Format("2006-01-02T15:04:05Z07:00"), nil
				}
				return nil, nil
			}},
			"createdAt": &graphql.Field{Type: graphql.String, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return p.Source.(*entity.Article).CreatedAt.Format("2006-01-02T15:04:05Z07:00"), nil }},
			"category":  &graphql.Field{Type: categoryType, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return p.Source.(*entity.Article).Category, nil }},
		},
	})

	lessonType := graphql.NewObject(graphql.ObjectConfig{
		Name: "Lesson",
		Fields: graphql.Fields{
			"id":       &graphql.Field{Type: graphql.ID, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return fmt.Sprintf("%d", p.Source.(*entity.Lesson).ID), nil }},
			"title":    &graphql.Field{Type: graphql.String, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return p.Source.(*entity.Lesson).Title, nil }},
			"type":     &graphql.Field{Type: graphql.String, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return string(p.Source.(*entity.Lesson).Type), nil }},
			"duration": &graphql.Field{Type: graphql.Int, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return p.Source.(*entity.Lesson).Duration, nil }},
			"order":    &graphql.Field{Type: graphql.Int, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return p.Source.(*entity.Lesson).Order, nil }},
		},
	})

	sectionType := graphql.NewObject(graphql.ObjectConfig{
		Name: "Section",
		Fields: graphql.Fields{
			"id":    &graphql.Field{Type: graphql.ID, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return fmt.Sprintf("%d", p.Source.(*entity.Section).ID), nil }},
			"title": &graphql.Field{Type: graphql.String, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return p.Source.(*entity.Section).Title, nil }},
			"order": &graphql.Field{Type: graphql.Int, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return p.Source.(*entity.Section).Order, nil }},
			"lessons": &graphql.Field{
				Type: graphql.NewList(lessonType),
				Resolve: func(p graphql.ResolveParams) (interface{}, error) {
					s := p.Source.(*entity.Section)
					lessons := make([]*entity.Lesson, len(s.Lessons))
					for i := range s.Lessons {
						lessons[i] = &s.Lessons[i]
					}
					return lessons, nil
				},
			},
		},
	})

	courseType := graphql.NewObject(graphql.ObjectConfig{
		Name: "Course",
		Fields: graphql.Fields{
			"id":          &graphql.Field{Type: graphql.ID, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return fmt.Sprintf("%d", p.Source.(*entity.Course).ID), nil }},
			"title":       &graphql.Field{Type: graphql.String, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return p.Source.(*entity.Course).Title, nil }},
			"description": &graphql.Field{Type: graphql.String, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return p.Source.(*entity.Course).Description, nil }},
			"status":      &graphql.Field{Type: graphql.String, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return string(p.Source.(*entity.Course).Status), nil }},
			"thumbnailUrl": &graphql.Field{Type: graphql.String, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return p.Source.(*entity.Course).ThumbnailURL, nil }},
			"publishedAt": &graphql.Field{Type: graphql.String, Resolve: func(p graphql.ResolveParams) (interface{}, error) {
				c := p.Source.(*entity.Course)
				if c.PublishedAt != nil {
					return c.PublishedAt.Format("2006-01-02T15:04:05Z07:00"), nil
				}
				return nil, nil
			}},
			"createdAt": &graphql.Field{Type: graphql.String, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return p.Source.(*entity.Course).CreatedAt.Format("2006-01-02T15:04:05Z07:00"), nil }},
			"category":  &graphql.Field{Type: categoryType, Resolve: func(p graphql.ResolveParams) (interface{}, error) { return p.Source.(*entity.Course).Category, nil }},
			"sections": &graphql.Field{
				Type: graphql.NewList(sectionType),
				Resolve: func(p graphql.ResolveParams) (interface{}, error) {
					c := p.Source.(*entity.Course)
					sections := make([]*entity.Section, len(c.Sections))
					for i := range c.Sections {
						sections[i] = &c.Sections[i]
					}
					return sections, nil
				},
			},
		},
	})

	articlesPageType := graphql.NewObject(graphql.ObjectConfig{
		Name: "ArticlesPage",
		Fields: graphql.Fields{
			"items":       &graphql.Field{Type: graphql.NewList(articleType)},
			"total":       &graphql.Field{Type: graphql.Int},
			"currentPage": &graphql.Field{Type: graphql.Int},
			"pageSize":    &graphql.Field{Type: graphql.Int},
		},
	})

	coursesPageType := graphql.NewObject(graphql.ObjectConfig{
		Name: "CoursesPage",
		Fields: graphql.Fields{
			"items":       &graphql.Field{Type: graphql.NewList(courseType)},
			"total":       &graphql.Field{Type: graphql.Int},
			"currentPage": &graphql.Field{Type: graphql.Int},
			"pageSize":    &graphql.Field{Type: graphql.Int},
		},
	})

	// --- Query ---

	queryType := graphql.NewObject(graphql.ObjectConfig{
		Name: "Query",
		Fields: graphql.Fields{
			"articles": &graphql.Field{
				Type: articlesPageType,
				Args: graphql.FieldConfigArgument{
					"page": &graphql.ArgumentConfig{Type: graphql.Int, DefaultValue: 0},
					"size": &graphql.ArgumentConfig{Type: graphql.Int, DefaultValue: 10},
				},
				Resolve: func(p graphql.ResolveParams) (interface{}, error) {
					page, _ := p.Args["page"].(int)
					size, _ := p.Args["size"].(int)
					status := entity.CMSStatusPublished
					filter := repository.ArticleFilter{Status: &status}
					result, total, err := cmsSvc.GetAll(p.Context, entity.CMSTypeArticle, filter, page, size)
					if err != nil {
						return nil, err
					}
					articles, _ := result.([]*entity.Article)
					return map[string]interface{}{
						"items": articles, "total": total, "currentPage": page, "pageSize": size,
					}, nil
				},
			},
			"article": &graphql.Field{
				Type: articleType,
				Args: graphql.FieldConfigArgument{
					"id": &graphql.ArgumentConfig{Type: graphql.NewNonNull(graphql.ID)},
				},
				Resolve: func(p graphql.ResolveParams) (interface{}, error) {
					var id uint
					fmt.Sscanf(fmt.Sprintf("%v", p.Args["id"]), "%d", &id)
					result, err := cmsSvc.GetByID(p.Context, id, entity.CMSTypeArticle)
					if err != nil {
						return nil, err
					}
					return result, nil
				},
			},
			"courses": &graphql.Field{
				Type: coursesPageType,
				Args: graphql.FieldConfigArgument{
					"page": &graphql.ArgumentConfig{Type: graphql.Int, DefaultValue: 0},
					"size": &graphql.ArgumentConfig{Type: graphql.Int, DefaultValue: 10},
				},
				Resolve: func(p graphql.ResolveParams) (interface{}, error) {
					page, _ := p.Args["page"].(int)
					size, _ := p.Args["size"].(int)
					status := entity.CMSStatusPublished
					filter := repository.ArticleFilter{Status: &status}
					result, total, err := cmsSvc.GetAll(p.Context, entity.CMSTypeCourse, filter, page, size)
					if err != nil {
						return nil, err
					}
					courses, _ := result.([]*entity.Course)
					return map[string]interface{}{
						"items": courses, "total": total, "currentPage": page, "pageSize": size,
					}, nil
				},
			},
			"course": &graphql.Field{
				Type: courseType,
				Args: graphql.FieldConfigArgument{
					"id": &graphql.ArgumentConfig{Type: graphql.NewNonNull(graphql.ID)},
				},
				Resolve: func(p graphql.ResolveParams) (interface{}, error) {
					var id uint
					fmt.Sscanf(fmt.Sprintf("%v", p.Args["id"]), "%d", &id)
					result, err := cmsSvc.GetByID(p.Context, id, entity.CMSTypeCourse)
					if err != nil {
						return nil, err
					}
					return result, nil
				},
			},
			"categories": &graphql.Field{
				Type: graphql.NewList(categoryType),
				Resolve: func(p graphql.ResolveParams) (interface{}, error) {
					cats, err := catSvc.GetTree(p.Context, false)
					if err != nil {
						return nil, err
					}
					return cats, nil
				},
			},
		},
	})

	schema, err := graphql.NewSchema(graphql.SchemaConfig{Query: queryType})
	if err != nil {
		return nil, fmt.Errorf("failed to build GraphQL schema: %w", err)
	}
	return &Handler{schema: schema}, nil
}

// Handle processes a GraphQL request.
func (h *Handler) Handle(c *gin.Context) {
	var params struct {
		Query         string                 `json:"query"`
		OperationName string                 `json:"operationName"`
		Variables     map[string]interface{} `json:"variables"`
	}
	if err := c.ShouldBindJSON(&params); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"errors": []gin.H{{"message": err.Error()}}})
		return
	}

	result := graphql.Do(graphql.Params{
		Schema:         h.schema,
		RequestString:  params.Query,
		VariableValues: params.Variables,
		OperationName:  params.OperationName,
		Context:        c.Request.Context(),
	})

	c.JSON(http.StatusOK, result)
}
