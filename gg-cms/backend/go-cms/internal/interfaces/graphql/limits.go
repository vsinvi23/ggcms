package graphql

import (
	"fmt"
	"os"
	"strings"

	"github.com/graphql-go/graphql/language/ast"
	"github.com/graphql-go/graphql/language/parser"
	"github.com/graphql-go/graphql/language/source"
)

const (
	maxQueryBytes   = 16 << 10
	maxQueryDepth   = 8
	maxQueryNodes   = 300
	maxPageSize     = 50
	defaultPageSize = 10
)

type queryWalker struct {
	fragments map[string]*ast.FragmentDefinition
	nodes     int
	err       error
}

func (w *queryWalker) walk(set *ast.SelectionSet, depth int, noIntrospection bool) {
	if set == nil || w.err != nil {
		return
	}
	if depth > maxQueryDepth {
		w.err = fmt.Errorf("query depth exceeds limit of %d", maxQueryDepth)
		return
	}
	for _, sel := range set.Selections {
		w.nodes++
		if w.nodes > maxQueryNodes {
			w.err = fmt.Errorf("query complexity exceeds limit")
			return
		}
		switch s := sel.(type) {
		case *ast.Field:
			if s.Name != nil && noIntrospection && (s.Name.Value == "__schema" || s.Name.Value == "__type") {
				w.err = fmt.Errorf("introspection is disabled")
				return
			}
			w.walk(s.SelectionSet, depth+1, noIntrospection)
		case *ast.InlineFragment:
			w.walk(s.SelectionSet, depth+1, noIntrospection)
		case *ast.FragmentSpread:
			if frag, ok := w.fragments[s.Name.Value]; ok {
				w.walk(frag.SelectionSet, depth+1, noIntrospection)
			}
		}
	}
}

func validateQueryLimits(query string) error {
	if len(query) > maxQueryBytes {
		return fmt.Errorf("query too large")
	}
	doc, err := parser.Parse(parser.ParseParams{Source: source.NewSource(&source.Source{Body: []byte(query), Name: "GraphQL request"})})
	if err != nil {
		return nil
	}
	w := &queryWalker{fragments: map[string]*ast.FragmentDefinition{}}
	for _, def := range doc.Definitions {
		if f, ok := def.(*ast.FragmentDefinition); ok && f.Name != nil {
			w.fragments[f.Name.Value] = f
		}
	}
	noIntrospection := strings.EqualFold(os.Getenv("APP_ENV"), "production")
	for _, def := range doc.Definitions {
		if op, ok := def.(*ast.OperationDefinition); ok {
			w.walk(op.SelectionSet, 1, noIntrospection)
		}
	}
	return w.err
}

func clampPage(page, size int) (int, int) {
	if page < 0 {
		page = 0
	}
	if size < 1 {
		size = defaultPageSize
	}
	if size > maxPageSize {
		size = maxPageSize
	}
	return page, size
}
