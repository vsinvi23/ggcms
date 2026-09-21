---
title: "Mastering Production Go Microservices"
description: "A comprehensive course on designing, building, testing, and deploying resilient Go microservices with gRPC, PostgreSQL, Docker, and Kubernetes."
type: "COURSE"
categorySlug: "backend-apis"
courseType: "TRACK"
tags:
  - "go"
  - "concurrency"
  - "rest"
  - "grpc"
  - "microservices"
---

Welcome to **Mastering Production Go Microservices**! In this hands-on engineering track, you will build scalable, cloud-native microservices from scratch using Go, gRPC, PostgreSQL, Docker, and Kubernetes.

---

## Section: Section 1: Go Project Structure & Hexagonal Architecture

### Lesson: Lesson 1.1: Project Layout Standard (`cmd/`, `pkg/`, `internal/`)

**The Scenario**: A new hire opens your service's repository and finds business logic, HTTP handlers, and SQL queries all mixed into a single `main.go`. They spend their first two days just figuring out where it's safe to make a change without breaking something unrelated. As the service grows, this same tangle turns every code review into an archaeology dig.

The standard Go project layout fixes this by giving every kind of code exactly one place to live:

```text
order-service/
├── cmd/
│   └── server/
│       └── main.go            # wiring only: reads config, builds dependencies, starts the server
├── internal/
│   ├── domain/
│   │   └── order.go            # pure business types & rules — no framework imports allowed
│   ├── application/
│   │   └── order_service.go    # use-case orchestration (calls domain + repository)
│   ├── infrastructure/
│   │   └── postgres/
│   │       └── order_repository.go   # implements the repository interface with real SQL
│   └── interfaces/
│       ├── http/
│       │   └── order_handler.go
│       └── grpc/
│           └── order_server.go
└── pkg/
    └── validator/               # code safe for OTHER services to import
```

`internal/` is enforced by the Go compiler itself — nothing outside this module can import it. `cmd/` never contains business logic, only wiring. This is what keeps `internal/domain` importable and testable without pulling in a database driver or an HTTP framework.

### Lesson: Lesson 1.2: Dependency Injection & Clean Interfaces

**The Scenario**: Your `OrderService` currently calls `postgres.Query(...)` directly. Writing a unit test for "reject an order over the credit limit" now requires a real Postgres connection — so nobody writes that test, and the credit-limit bug ships to production.

Defining a narrow interface at the point of use — not the point of implementation — decouples business logic from any specific database:

```go
// internal/domain/order.go
package domain

type Order struct {
	ID         string
	CustomerID string
	TotalCents int64
}

// OrderRepository is defined where it's CONSUMED (domain), not where it's implemented (infrastructure).
type OrderRepository interface {
	Save(ctx context.Context, o Order) error
	FindByID(ctx context.Context, id string) (Order, error)
}

// internal/application/order_service.go
package application

type OrderService struct {
	repo domain.OrderRepository
}

func NewOrderService(r domain.OrderRepository) *OrderService {
	return &OrderService{repo: r}
}

func (s *OrderService) PlaceOrder(ctx context.Context, o domain.Order) error {
	if o.TotalCents > creditLimitCents {
		return ErrCreditLimitExceeded
	}
	return s.repo.Save(ctx, o)
}
```

```go
// internal/application/order_service_test.go
type fakeOrderRepo struct{ saved []domain.Order }

func (f *fakeOrderRepo) Save(ctx context.Context, o domain.Order) error {
	f.saved = append(f.saved, o)
	return nil
}
func (f *fakeOrderRepo) FindByID(ctx context.Context, id string) (domain.Order, error) {
	return domain.Order{}, nil
}

func TestPlaceOrder_RejectsOverCreditLimit(t *testing.T) {
	svc := application.NewOrderService(&fakeOrderRepo{})
	err := svc.PlaceOrder(context.Background(), domain.Order{TotalCents: creditLimitCents + 1})
	if !errors.Is(err, application.ErrCreditLimitExceeded) {
		t.Fatalf("expected credit limit error, got %v", err)
	}
}
```

Now the credit-limit rule has a fast, in-memory unit test with zero database dependency — the exact test that didn't exist before.

---

## Section: Section 2: High-Performance gRPC Communication

### Lesson: Lesson 2.1: Proto3 Definitions & Code Generation

**The Scenario**: The `inventory-service` and `order-service` teams agree verbally on a JSON shape for "reserve stock." Three weeks later, `order-service` starts sending `quantity` as a string after a refactor, and `inventory-service`'s untyped JSON decoder silently reads it as zero. Stock reservations start failing silently in production.

A `.proto` contract makes the schema the single source of truth — both sides generate code from it, so a type mismatch is a compile error, not a runtime surprise:

```protobuf
// proto/inventory/v1/inventory.proto
syntax = "proto3";
package inventory.v1;
option go_package = "github.com/acme/inventory/genproto/inventory/v1;inventoryv1";

service InventoryService {
  rpc ReserveStock(ReserveStockRequest) returns (ReserveStockResponse);
}

message ReserveStockRequest {
  string sku       = 1;
  int32  quantity  = 2;
  string order_id  = 3;
}

message ReserveStockResponse {
  bool   reserved       = 1;
  int32  remaining_stock = 2;
}
```

```bash
protoc --go_out=. --go_opt=paths=source_relative \
       --go-grpc_out=. --go-grpc_opt=paths=source_relative \
       proto/inventory/v1/inventory.proto
```

The generated `InventoryServiceServer` interface and typed `ReserveStockRequest`/`ReserveStockResponse` structs mean a `string` where an `int32` is expected fails at `go build` time on both services — long before it reaches production.

### Lesson: Lesson 2.2: gRPC Interceptors & Context Tracing

**The Scenario**: A customer reports "my order failed" with no other details. Your logs show thousands of unrelated `ReserveStock` calls per minute across a dozen pods — there is no way to isolate the handful of calls that belong to this one request.

Unary interceptors let you inject structured logging, a request ID, and panic recovery around **every** RPC without repeating that code in every handler:

```go
func LoggingInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		requestID := uuid.NewString()
		ctx = context.WithValue(ctx, requestIDKey{}, requestID)

		start := time.Now()
		resp, err := handler(ctx, req)

		log.Printf("method=%s request_id=%s duration=%s err=%v",
			info.FullMethod, requestID, time.Since(start), err)
		return resp, err
	}
}

func RecoveryInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (resp any, err error) {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("PANIC recovered in %s: %v\n%s", info.FullMethod, r, debug.Stack())
				err = status.Errorf(codes.Internal, "internal server error")
			}
		}()
		return handler(ctx, req)
	}
}

func main() {
	srv := grpc.NewServer(
		grpc.ChainUnaryInterceptor(LoggingInterceptor(), RecoveryInterceptor()),
	)
	inventoryv1.RegisterInventoryServiceServer(srv, &inventoryServer{})
}
```

With every RPC now logging a `request_id`, "my order failed" becomes a one-line log search instead of a guessing game, and a panic in one handler returns a clean gRPC error instead of crashing the whole pod.

---

## Section: Section 3: PostgreSQL Persistence & Transactional Integrity

### Lesson: Lesson 3.1: The Repository Pattern with `pgx` and Real Transactions

**The Scenario**: "Place order" must do two things atomically: insert the order row, and decrement the product's stock count. A naive implementation runs these as two separate queries — if the process crashes between them, you're left with an order that was billed but never shipped, or stock that was reserved but no order exists to claim it.

Wrapping both statements in a single database transaction makes the two writes succeed or fail together:

```go
// internal/infrastructure/postgres/order_repository.go
package postgres

type OrderRepository struct {
	pool *pgxpool.Pool
}

func (r *OrderRepository) PlaceOrderWithStockDecrement(ctx context.Context, o domain.Order, sku string, qty int) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) // no-op if Commit succeeds

	if _, err := tx.Exec(ctx,
		`INSERT INTO orders (id, customer_id, total_cents) VALUES ($1, $2, $3)`,
		o.ID, o.CustomerID, o.TotalCents); err != nil {
		return fmt.Errorf("insert order: %w", err)
	}

	tag, err := tx.Exec(ctx,
		`UPDATE products SET stock = stock - $1 WHERE sku = $2 AND stock >= $1`,
		qty, sku)
	if err != nil {
		return fmt.Errorf("decrement stock: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrInsufficientStock // WHERE clause guarded against a negative-stock race
	}

	return tx.Commit(ctx)
}
```

The `WHERE stock >= $1` clause does double duty: it's both the business rule ("never sell stock you don't have") and the concurrency guard — two simultaneous orders for the last unit will only let one `UPDATE` succeed.

### Lesson: Lesson 3.2: Connection Pooling & `pgx` Pool Tuning

**The Scenario**: Under a load test, your service's p99 latency spikes from 20ms to 4 seconds even though the database itself reports low CPU usage. The real cause: `pgxpool` was left at its default max-connections setting, and every request is queueing for a free connection instead of hitting Postgres.

```go
func NewPool(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}

	cfg.MaxConns = 25                      // match to (CPU cores * 2-4), not "as high as possible"
	cfg.MinConns = 5                       // keep warm connections ready under bursty traffic
	cfg.MaxConnLifetime = 30 * time.Minute // recycle connections periodically (helps behind load balancers)
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.HealthCheckPeriod = 1 * time.Minute

	return pgxpool.NewWithConfig(ctx, cfg)
}
```

A pool sized too small queues requests behind each other (exactly the symptom above); a pool sized far larger than Postgres's own `max_connections` setting just moves the bottleneck to the database server instead of fixing it. Size the pool, then load-test to confirm.

---

## Section: Section 4: Containerization & Kubernetes Deployment

### Lesson: Lesson 4.1: Multi-Stage Docker Builds for Minimal Go Images

**The Scenario**: Your first Dockerfile used `FROM golang:1.22` as the final image. It works, but ships at 900MB, includes the entire Go toolchain and package cache, and gives an attacker who compromises the container a full compiler to work with. Image pulls are slow enough to noticeably delay rollouts.

A multi-stage build compiles in one stage and ships only the resulting static binary in a minimal final stage:

```dockerfile
# --- Build stage ---
FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/order-service ./cmd/server

# --- Final stage ---
FROM gcr.io/distroless/static-debian12
COPY --from=builder /out/order-service /order-service
USER nonroot:nonroot
ENTRYPOINT ["/order-service"]
```

The final image contains the binary and nothing else — no shell, no package manager, no compiler — shrinking the image from ~900MB to under 15MB and removing an entire class of "attacker gets a shell in my container" incidents, since there is no shell to get.

### Lesson: Lesson 4.2: Deploying to Kubernetes with Health Probes and Config

**The Scenario**: The service deploys fine, but during a rollout Kubernetes starts sending traffic to a new pod before its database connection pool has finished initializing — a burst of requests fail with connection errors for the first two seconds of every new pod's life.

Readiness probes tell Kubernetes to hold traffic back until the pod is actually ready, not just started:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
spec:
  replicas: 3
  selector:
    matchLabels: { app: order-service }
  template:
    metadata:
      labels: { app: order-service }
    spec:
      containers:
        - name: order-service
          image: registry.acme.dev/order-service:1.4.2
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef: { name: order-service-config }
            - secretRef: { name: order-service-db-secret }
          readinessProbe:
            httpGet: { path: /readyz, port: 8080 }
            initialDelaySeconds: 2
            periodSeconds: 5
          livenessProbe:
            httpGet: { path: /healthz, port: 8080 }
            initialDelaySeconds: 10
            periodSeconds: 15
          resources:
            requests: { cpu: "250m", memory: "128Mi" }
            limits:   { cpu: "500m", memory: "256Mi" }
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: order-service-config
data:
  LOG_LEVEL: "info"
  DB_POOL_MAX_CONNS: "25"
```

```text
   Rollout begins
        │
        ▼
 ┌────────────────┐   /readyz returns 200   ┌─────────────────────┐
 │ New pod starts  │ ─────────────────────► │ Added to Service     │ ──► receives traffic
 │ (DB pool init)  │                         │ endpoints             │
 └────────────────┘                         └─────────────────────┘
        │ /readyz still 503 (pool warming up)
        └──► Kubernetes withholds traffic — old pods keep serving until this one is ready
```

`/readyz` should check that the `pgxpool` has at least one live connection; `/healthz` should only check that the process itself is alive (a slow database should fail readiness, not liveness — failing liveness would restart a pod that's healthy but waiting on a dependency).

### Lesson: Lesson 4.3: Knowledge Check — Microservice Fundamentals

**Lesson type**: quiz

**Question 1**: Why is `OrderRepository` defined as an interface inside `internal/domain` rather than inside `internal/infrastructure/postgres`?

A) Go requires all interfaces to live in the domain package
B) So the domain and application layers can be unit-tested against a fake implementation without depending on a real Postgres connection
C) It makes the JSON output smaller
D) Interfaces in `infrastructure` are not allowed by the compiler

**Correct answer: B.** Defining the interface at the point of consumption (domain/application) rather than the point of implementation (infrastructure) is what allows a `fakeOrderRepo` to stand in during tests — the business logic never needs a real database to be tested.

**Question 2**: In the stock-decrement example, what does `WHERE stock >= $1` accomplish beyond expressing "don't oversell"?

A) It's purely cosmetic SQL styling
B) It acts as a concurrency guard: only one of two simultaneous orders for the last unit of stock can succeed, since the second `UPDATE` will affect zero rows
C) It improves query performance via an index
D) It disables the transaction

**Correct answer: B.** Combined with checking `RowsAffected() == 0`, the `WHERE` clause makes the update conditionally fail exactly when a race would have oversold stock — the database's own row-level locking does the concurrency control, no extra locking code required.

**Question 3**: Why does a multi-stage Docker build improve security, not just image size?

A) It disables networking in the container
B) The final image contains no shell, package manager, or compiler — removing tools an attacker could use after compromising the container
C) It automatically scans for CVEs
D) It requires root privileges, which is more secure

**Correct answer: B.** A `distroless` or `scratch` final stage ships only the compiled binary. Even if an attacker exploits the running service, there's no shell or toolchain inside the container for them to pivot with.
