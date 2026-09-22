---
title: "Clean Architecture: Ports and Adapters (Hexagonal)"
description: "How framework and database types leak into business logic and make testing agonizing, and how Hexagonal Architecture's ports/adapters boundary keeps the domain core framework-agnostic and fast to test."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "DEEP_DIVE"
tags:
  - "hexagonal-architecture"
  - "clean-architecture"
  - "ports-and-adapters"
  - "dependency-inversion"
  - "typescript"
---

# Clean Architecture: Ports and Adapters (Hexagonal)

## The Problem: The Framework Trap

One of the most insidious architectural anti-patterns in modern microservice development is the "Framework Trap." It begins innocently: a team chooses a web framework (like Express, Spring Boot, or Fiber) and an ORM (like Prisma or Hibernate) to accelerate development. Quickly, HTTP request objects leak into business logic. Database entity models dictate how the application processes rules.

When external dependencies define the shape of your application, testing becomes agonizing. A simple unit test requires mocking an entire database connection or spinning up a test container. Migrating to a different database or updating a major framework version requires a total rewrite of the core logic. The business domain—the actual value the software provides—is buried under boilerplate and infrastructure coupling.

## The Mental Model: The Hexagon

Hexagonal Architecture, formally known as Ports and Adapters, was introduced by Alistair Cockburn to solve this exact problem. The mental model is simple but profound: **Dependency inversion.**

Imagine your application as a hexagon. Inside the hexagon lives your core business logic and domain entities. This inner core knows *nothing* about the outside world. It doesn't know it's being served over HTTP, it doesn't know it's storing data in PostgreSQL, and it doesn't know it's publishing events to Kafka.

The edges of the hexagon represent the boundary between your core logic and the outside world. We bridge this boundary using two primitives:

1. **Ports:** Interfaces defined *by* the core logic, declaring what the core needs to interact with the outside world.
2. **Adapters:** Implementations of those interfaces that live *outside* the core, dealing with specific technologies (e.g., a SQL database adapter, an HTTP controller adapter).

```text
                     +---------------------------+
  HTTP Request ----> | HTTP Adapter (Controller) |
                     +---------------------------+
                                  | (uses)
                                  v
                        [ Driving Port (Use Case) ]
                +-----------------------------------------+
                |                                         |
                |           CORE DOMAIN LOGIC             |
                |         (Entities & Services)           |
                |                                         |
                +-----------------------------------------+
                        [ Driven Port (Repository) ]
                                  ^
                                  | (implements)
                     +---------------------------+
                     |  Postgres Adapter (ORM)   | <---- Database
                     +---------------------------+
```

### Driving vs. Driven Actors

- **Driving Actors (Primary):** These initiate interactions with your application. A REST API, a gRPC client, or a cron job. They interact with the core via *Driving Ports* (often called Use Cases).
- **Driven Actors (Secondary):** These are infrastructure components your application needs to do its job. A database, a third-party API, or an SMTP server. Your core defines *Driven Ports* (like a `UserRepository` interface) that the outside adapters implement.

## Implementation: Decoupling in Practice

Let's look at a pragmatic implementation in TypeScript. First, we define our Core Domain and the Driven Port (the interface the core expects).

```typescript
// --- CORE DOMAIN ---
// 1. Entity (Pure business rules)
export class Order {
  constructor(public id: string, public total: number, public status: string) {}

  approve() {
    if (this.total <= 0) throw new Error("Invalid order total");
    this.status = "APPROVED";
  }
}

// 2. Driven Port (Defined by the core, implemented by the outside)
export interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
}

// 3. Driving Port / Use Case (The application logic)
export class ApproveOrderUseCase {
  // Core injects the port, not the concrete implementation
  constructor(private readonly orderRepo: OrderRepository) {}

  async execute(orderId: string): Promise<void> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new Error("Order not found");

    order.approve();
    await this.orderRepo.save(order);
  }
}
```

Notice that the core domain imports nothing from `node_modules` (except standard library types). It is framework-agnostic.

Next, we build the Adapters that sit outside the core.

```typescript
// --- ADAPTERS (Infrastructure) ---
import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';

// 1. Database Adapter (Implements the Driven Port)
export class PrismaOrderRepository implements OrderRepository {
  constructor(private prisma: PrismaClient) {}

  async save(order: Order): Promise<void> {
    await this.prisma.orderRecord.upsert({
      where: { id: order.id },
      update: { status: order.status },
      create: { id: order.id, total: order.total, status: order.status }
    });
  }

  async findById(id: string): Promise<Order | null> {
    const record = await this.prisma.orderRecord.findUnique({ where: { id } });
    if (!record) return null;
    return new Order(record.id, record.total, record.status);
  }
}

// 2. HTTP Adapter (Uses the Driving Port)
export class OrderController {
  constructor(private approveOrderUseCase: ApproveOrderUseCase) {}

  async handleApprove(req: Request, res: Response) {
    try {
      await this.approveOrderUseCase.execute(req.params.id);
      res.status(200).send("Order approved");
    } catch (err) {
      res.status(400).send(err.message);
    }
  }
}
```

## The Pragmatic Trade-offs

No architecture is a silver bullet. Hexagonal architecture introduces boilerplate. You must map between database records (like Prisma's `orderRecord`) and domain entities (`Order`). This object mapping takes time and discipline.

However, the return on investment for medium-to-large microservices is immense:

1. **Lightning-fast Tests:** You can test `ApproveOrderUseCase` with an in-memory mock `OrderRepository`. No database required. Tests run in milliseconds.
2. **Delayed Decisions:** You can build and test your core logic before deciding whether to use Postgres, MongoDB, or DynamoDB.
3. **Future-proofing:** Swapping Express for Fastify? The core domain remains entirely untouched. You only rewrite the controller adapter.

By rigorously separating the *what* (core domain) from the *how* (adapters), Hexagonal Architecture creates resilient, testable, and highly cohesive microservices that stand the test of time.
