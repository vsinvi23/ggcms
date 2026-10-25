package graphql

import (
	"strings"
	"testing"
)

func TestValidateQueryLimits(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	if err := validateQueryLimits(`{ articles { items { id title } } __typename }`); err != nil {
		t.Fatalf("normal query rejected: %v", err)
	}
	if err := validateQueryLimits(`{ __schema { types { name } } }`); err == nil {
		t.Fatal("introspection must be rejected in production")
	}
	deep := "{" + strings.Repeat("a{", 12) + "b" + strings.Repeat("}", 12) + "}"
	if err := validateQueryLimits(deep); err == nil {
		t.Fatal("deep query must be rejected")
	}
	t.Setenv("APP_ENV", "development")
	if err := validateQueryLimits(`{ __schema { types { name } } }`); err != nil {
		t.Fatalf("introspection allowed outside production: %v", err)
	}
}

func TestClampPage(t *testing.T) {
	if p, s := clampPage(-1, 100000); p != 0 || s != maxPageSize {
		t.Fatalf("got %d %d", p, s)
	}
	if _, s := clampPage(0, 0); s != defaultPageSize {
		t.Fatal("default size")
	}
}
