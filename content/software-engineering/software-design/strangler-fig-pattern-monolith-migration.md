---
title: "The Strangler Fig Pattern: Incrementally Migrating Monoliths to Microservices"
description: "Why big-bang rewrites fail and how the Strangler Fig pattern uses an API gateway facade and anti-corruption layers to migrate a legacy monolith one vertical slice at a time."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "strangler-fig-pattern"
  - "monolith-migration"
  - "api-gateway"
  - "anti-corruption-layer"
  - "microservices"
  - "legacy-modernization"
---

# The Strangler Fig Pattern: Incrementally Migrating Monoliths to Microservices

## The Problem: The "Big Bang" Rewrite Trap

Technical debt accumulates, and monoliths eventually reach a point where feature delivery slows to a crawl. The natural engineering impulse is the "Big Bang" rewrite: freeze feature development on the legacy system, build the shiny new microservices architecture in isolation over a year, and flip the switch in a massive weekend migration.

Historically, this approach is catastrophic. It assumes you fully understand the hidden, undocumented business rules of the monolith. It locks up engineering resources without delivering immediate value, and when the switch is finally flipped, edge cases inevitably bring down production. We need a way to refactor large systems continuously and safely, delivering value with every release.

## The Mental Model: The Strangler Fig Tree

In nature, a Strangler Fig tree begins life as a seed dropped in the upper branches of a host tree. As it grows, its roots extend downward, slowly engulfing the host. Eventually, the host tree dies and rots away, leaving only the freestanding Strangler Fig in its place.

In software design, the Strangler Fig Pattern models this organic replacement. Instead of replacing the entire monolith at once, you build an API gateway (a facade) in front of it. You then extract a specific vertical slice of functionality into a new microservice. The gateway is updated to route traffic for that specific slice to the new service, while all other traffic continues to fall through to the monolith. Over time, the monolith is strangled until it can be retired.

## The Solution: Facades and Anti-Corruption Layers

### 1. The Intercepting Facade (API Gateway)

The foundational element of the Strangler Fig pattern is an intelligent proxy — usually an API Gateway (e.g., NGINX, Kong, AWS API Gateway, Envoy) or a dedicated routing service.

```text
                          Client Apps
                               │
                               ▼
                     ┌───────────────────┐
                     │  API Gateway /    │
                     │  Proxy            │
                     └─────────┬─────────┘
                     ┌─────────┴─────────┐
                     │                   │
        Future State │                   │  Legacy State
     /api/v1/payments │                   │  /*  (everything else)
                     ▼                   ▼
         ┌───────────────────┐  ┌───────────────────┐
         │ Payments           │  │ Legacy Monolith    │
         │ Microservice       │  │                    │
         └───────────────────┘  └───────────────────┘
```

Initially, the gateway routes 100% of traffic to the monolith. When the `Payments` microservice is ready and verified in production, the routing rule is updated:
- Route `^/api/v1/payments/*` → `payments-service`
- Route `/*` → `legacy-monolith`

This allows for **Dark Launching** and **Shadow Traffic**. You can mirror live traffic to the new service to verify its correctness and performance without impacting actual users before flipping the canonical route.

### 2. The Anti-Corruption Layer (ACL)

Microservices and monoliths often do not share the same data model or domain language. If the new service simply conforms to the legacy database schema, it becomes permanently coupled to the old system's bad design.

An **Anti-Corruption Layer (ACL)** acts as a translator between the new service and the legacy system. If the new `Payments` service needs data managed by the monolith, it queries the monolith through the ACL, which translates the legacy data format into the new bounded context's ubiquitous language.

```text
   Payments Service  ──►  Anti-Corruption Layer  ──►  Legacy Monolith
   (new domain model)     (translates schemas/       (old, tangled
                            terminology both ways)     data model)
```

### 3. State Synchronization and Data Ownership

The most complex part of a Strangler Fig migration is data gravity. If both the new microservice and the monolith need access to the same database tables, who owns the data?

**Event Interception:** If the monolith writes to a `Users` table and the new service needs that data, you should avoid connecting the new service directly to the monolith's database (the Integration Database anti-pattern). Instead, use a Change Data Capture (CDC) tool like Debezium or trigger events from the monolith to replicate necessary state to the new service's independent database.

## Architectural Trade-offs

- **Increased Latency:** The introduction of the API gateway and necessary cross-communication between the new services and the monolith (via ACLs) inherently adds network hops.
- **Transitional Complexity:** For the duration of the migration — which can take years — teams must maintain two operational paradigms, two CI/CD pipelines, and deal with distributed system failures.
- **Rollback Safety:** The biggest advantage is safety. If the new `Payments` service fails in production, reverting is simply a matter of changing a routing rule at the API gateway back to the monolith.

The Strangler Fig Pattern is not a silver bullet for speed, but it is the ultimate strategy for risk mitigation. By moving incrementally, businesses can see return on investment immediately while engineers safely untangle the legacy web.
