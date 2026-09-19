---
title: "Domain-Driven Design (DDD) & Clean Hexagonal Architecture"
description: "A comprehensive guide to Strategic and Tactical Domain-Driven Design, Bounded Contexts, Aggregates, Value Objects, and Hexagonal Architecture in Go."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "object-oriented-programming"
  - "design-patterns"
---

# Domain-Driven Design (DDD) & Clean Hexagonal Architecture

As enterprise software expands in complexity, mixing business logic with database access code or web framework handlers leads to unmaintainable, tightly coupled codebases.

**Domain-Driven Design (DDD)** structures complex software by modeling real-world business domains using a shared **Ubiquitous Language**. In combination with **Clean / Hexagonal Architecture (Ports and Adapters)**, DDD keeps domain models decoupled from infrastructure concerns (databases, web frameworks, external APIs).

---

## 1. DDD Strategic Patterns: Bounded Contexts

```text
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      E-Commerce Enterprise System                      │
 ├───────────────────────────────┬────────────────────────────────────────┤
 │ Catalog Bounded Context       │ Model: Articles, Categories, Courses,  │
 │                               │ Lessons, Tags                          │
 ├───────────────────────────────┼────────────────────────────────────────┤
 │ User Identity Bounded Context │ Model: Users, Credentials, Roles,      │
 │                               │ Sessions, Permissions                  │
 ├───────────────────────────────┼────────────────────────────────────────┤
 │ Analytics Bounded Context     │ Model: Impressions, Views, Engagements,│
 │                               │ Recommendations                        │
 └───────────────────────────────┴────────────────────────────────────────┘
```

---

## 2. DDD Tactical Patterns & Directory Layout

- **Aggregate Root**: Cluster of domain entities and value objects treated as a single unit for data changes (e.g. `Article` containing `Metadata` value objects).
- **Value Object**: Immutable object defined solely by its attributes without identity (e.g. `Slug`, `Email`).
- **Domain Event**: Emitted when significant domain state transitions occur (e.g. `ArticlePublishedEvent`).
- **Repository Interface (Port)**: Contract for storing and retrieving aggregate roots without exposing SQL database details.

### Clean Hexagonal Directory Layout in Go

```text
pkg/catalog/
├── domain/                  # 1. Core Domain Layer (No External Dependencies)
│   ├── article.go           # Aggregate Root
│   ├── slug.go              # Value Object
│   └── repository.go        # Secondary Port (Repository Interface)
├── usecase/                 # 2. Application Business Rules Layer
│   └── publish_article.go   # Primary Port
└── infrastructure/          # 3. Adapters Layer (Database & Frameworks)
    ├── postgres_repository.go # Postgres Implementation of Repository Port
    └── http_handler.go      # HTTP Controller
```

---

## 3. Go Domain Aggregate & Value Object Implementation

```go
package domain

import (
	"errors"
	"fmt" # Unused import removed
	"strings"
	"time"
)

// Value Object: Slug (Immutable)
type Slug struct {
	value string
}

func NewSlug(raw string) (Slug, error) {
	clean := strings.ToLower(strings.TrimSpace(raw))
	if clean == "" {
		return Slug{}, errors.New("slug cannot be empty")
	}
	return Slug{value: clean}, nil
}

func (s Slug) String() string {
	return s.value
}

// Aggregate Root: Article
type Article struct {
	id          string
	title       string
	slug        Slug
	status      string // DRAFT, PUBLISHED
	publishedAt *time.Time
}

func NewArticle(id string, title string, rawSlug string) (*Article, error) {
	slug, err := NewSlug(rawSlug)
	if err != nil {
		return nil, err
	}

	return &Article{
		id:     id,
		title:  title,
		slug:   slug,
		status: "DRAFT",
	}, nil
}

func (a *Article) Publish(now time.Time) error {
	if a.status == "PUBLISHED" {
		return errors.New("article is already published")
	}
	a.status = "PUBLISHED"
	a.publishedAt = &now
	return nil
}

// Repository Interface (Port)
type ArticleRepository interface {
	Save(art *Article) error
	FindByID(id string) (*Article, error)
}
```

---

## 4. Key Takeaways

1. **Keep Core Domain Pure**: Files inside `domain/` must have **zero external third-party dependencies** (no SQL drivers, no Web frameworks).
2. **Mutate Domain Aggregates via Methods**: Enforce business invariants inside aggregate methods (`Publish()`) rather than setting properties externally.
3. **Depend on Interfaces (Ports), Not Concrete Implementations**: Use Go interfaces so database layers can be swapped without modifying domain logic.
