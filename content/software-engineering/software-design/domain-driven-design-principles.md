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
	events      []DomainEvent // uncommitted events raised by this aggregate instance
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
	a.events = append(a.events, ArticlePublishedEvent{ArticleID: a.id, PublishedAt: now})
	return nil
}

// Events returns and clears events accumulated since the aggregate was loaded —
// the application layer calls this AFTER a successful Save(), never before.
func (a *Article) Events() []DomainEvent {
	pending := a.events
	a.events = nil
	return pending
}

// Repository Interface (Port)
type ArticleRepository interface {
	Save(art *Article) error
	FindByID(id string) (*Article, error)
}
```

---

## 4. The Scenario: An Anemic Domain Model Lets Invalid State Slip Through

### Where the Invariant Actually Lived

A team models `Article` as a plain data struct — public fields, no behavior — and puts the "can't publish twice" rule inside an HTTP handler's service function instead of on the struct itself. It works, until a second code path (a bulk-import job, a background retry) needs to publish articles too, and whoever writes it either doesn't know the rule exists or reimplements it slightly differently.

```text
  Anemic model: the rule lives OUTSIDE the data, wherever a developer
  remembered to put it
  ──────────────────────────────────────────────────────────────────
  type Article struct {              PublishHandler (web):
      Status string                    if article.Status == "PUBLISHED" { reject }
      // exported fields, no           article.Status = "PUBLISHED"   ✓ rule enforced
      // behavior of its own
  }                                 BulkImportJob (batch):
                                       article.Status = "PUBLISHED"   ✗ rule FORGOTTEN —
                                                                         no check, no error,
                                                                         double-publish events fire

  Rich model: the rule lives INSIDE the aggregate — every caller gets
  it for free, because there is no other way to change the state
  ──────────────────────────────────────────────────────────────────
  type Article struct { status string }   // unexported — can't be set directly
  func (a *Article) Publish(now time.Time) error {
      if a.status == "PUBLISHED" { return errors.New(...) }   // ✓ enforced ONCE,
      ...                                                        for EVERY caller
  }
```

Making the `status` field unexported (lowercase, as in Section 3) is what actually forces this: a caller in a different package has no way to mutate `Article` except through `Publish()`, `NewArticle()`, and any other method the aggregate chooses to expose. The compiler — not code review, not documentation — is what prevents the bulk-import job from bypassing the rule.

💡 **Interactive Takeaway**: The fix for the anemic model isn't "write better service-layer code" — it's removing the possibility of bypassing the rule at all, by making the field inaccessible from outside the aggregate. A rule that can only be enforced by remembering to call it is a rule that will eventually be forgotten.

---

## 5. Domain Events: Decoupling Side Effects From the Aggregate

`Publish()` in Section 3 does one thing: it validates the transition and flips two fields. It does **not** send a notification email, invalidate a CDN cache, or update a search index — mixing those concerns into the aggregate method would couple pure domain logic to infrastructure and make the method impossible to unit test without a mail server. Instead, the aggregate raises a **Domain Event** describing what happened, and something outside the domain layer decides what to do about it.

```go
package domain

import "time"

// DomainEvent is the marker interface every domain event implements —
// deliberately minimal so the domain layer stays free of infrastructure types.
type DomainEvent interface {
	OccurredAt() time.Time
}

type ArticlePublishedEvent struct {
	ArticleID   string
	PublishedAt time.Time
}

func (e ArticlePublishedEvent) OccurredAt() time.Time { return e.PublishedAt }
```

```go
// usecase/publish_article.go — the application layer reads events AFTER
// the aggregate is durably saved, then hands them to whatever needs to react.
func (uc *PublishArticleUseCase) Execute(id string, now time.Time) error {
	art, err := uc.repo.FindByID(id)
	if err != nil {
		return err
	}

	if err := art.Publish(now); err != nil {
		return err
	}

	if err := uc.repo.Save(art); err != nil {
		return err // Save failed — events are discarded, nothing was ever "published"
	}

	for _, evt := range art.Events() {
		uc.dispatcher.Dispatch(evt) // e.g. invalidate cache, queue a search re-index
	}
	return nil
}
```

Reading events only after `Save()` succeeds matters: if the events were dispatched first and the save then failed, downstream systems (search index, cache, notification queue) would react to a state change that never actually persisted. For dispatch that must survive a process crash between `Save()` and `Dispatch()`, this is the same durability problem the Transactional Outbox pattern solves — the two ideas compose, but a domain event is a modeling concept (something meaningful happened to an aggregate) while the outbox is a delivery mechanism (how to publish it reliably).

---

## 6. Aggregate Boundaries Are Transaction Boundaries

A common mistake once a domain grows past a single aggregate is having one aggregate reach directly into another's internals inside the same operation — e.g. `Publish()` on `Article` also looking up an `Author` aggregate and incrementing its `PublishedCount` field. This silently makes the transaction span two aggregates, which breaks the whole point of an aggregate boundary: each one should be loadable, lockable, and savable independently.

```text
  WRONG: one transaction spans two aggregates directly
  ──────────────────────────────────────────────────────
  tx.Begin()
    article.Publish(now)                 ← Article aggregate
    author.IncrementPublishedCount()     ← Author aggregate — now BOTH must
                                            lock, validate, and commit together
  tx.Commit()

  RIGHT: each aggregate keeps its own transaction; consistency between
  them is eventual, coordinated via the domain event
  ──────────────────────────────────────────────────────
  tx.Begin(); article.Publish(now); repo.SaveArticle(article); tx.Commit()
        │
        ▼  ArticlePublishedEvent dispatched (async, after commit)
  tx.Begin(); author.IncrementPublishedCount(); repo.SaveAuthor(author); tx.Commit()
        (a separate transaction, possibly milliseconds later, possibly
         a completely separate process consuming the event)
```

This is a direct tradeoff: the `Author`'s published count is briefly stale (eventually consistent, not immediately consistent) in exchange for `Article` and `Author` never needing to lock each other or share a database transaction. For most read-model counters and cross-aggregate side effects, that lag is acceptable; reserve a single shared transaction for invariants that must never be observed in a partially-applied state, and design the aggregate boundary itself to contain those invariants instead.

---

## 7. Key Takeaways

1. **Keep Core Domain Pure**: Files inside `domain/` must have **zero external third-party dependencies** (no SQL drivers, no Web frameworks).
2. **Mutate Domain Aggregates via Methods, With Unexported Fields**: Enforce business invariants inside aggregate methods (`Publish()`) and make the underlying fields inaccessible from outside the package — a rule that can be bypassed by direct field assignment will eventually be bypassed.
3. **Depend on Interfaces (Ports), Not Concrete Implementations**: Use Go interfaces so database layers can be swapped without modifying domain logic.
4. **Raise Domain Events for Side Effects, Dispatch Only After Save Succeeds**: Keep the aggregate method itself free of infrastructure concerns; read and dispatch its events after the repository confirms the state change was durably persisted.
5. **Treat the Aggregate as the Transaction Boundary**: Avoid a single transaction that mutates two aggregates directly — coordinate cross-aggregate consistency through domain events and accept it will be eventual, not immediate.
