---
title: "GraphQL Federation: Composing a Supergraph from Independent Microservices"
description: "How Apollo Federation replaces brittle schema stitching with subgraphs and a query-planning Router, including the @key entity model and execution plan for cross-service fields."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "graphql"
  - "apollo-federation"
  - "schema-stitching"
  - "microservices"
  - "api-gateway"
---

# GraphQL Federation: Composing a Supergraph from Independent Microservices

## The Problem: The Schema Monolith

GraphQL gives client applications a single, unified graph to query against. The catch is that "single graph" tends to mean "single codebase" — and a single codebase owned by every team quickly becomes the bottleneck it was supposed to eliminate.

Consider an e-commerce platform with a `Users` team and a `Reviews` team. In a monolithic GraphQL server, both teams have to edit the same repository to evolve the `User` type. If `Reviews` wants to add a `reviews: [Review]` field onto `User`, someone on that team has to modify code owned by the `Users` team's resolver. That coupling slows down every team's velocity and directly contradicts the domain ownership boundaries teams are trying to establish with microservices.

The first attempt at a fix, historically, was **schema stitching**: a central gateway process that manually merges independently-authored schemas at runtime. It works for small setups but becomes brittle fast — the stitching logic itself becomes a shared, hand-maintained artifact that nobody wants to own, and it has no formal way to reason about which service is authoritative for which field.

**Apollo Federation** replaces ad hoc stitching with a declarative composition model: each team's service declares what it owns and what it needs, and a dedicated query planner works out how to satisfy a client query across services.

## The Mental Model: A Distributed SQL JOIN

Think of the Federation gateway — called the **Router** — as a distributed query planner, not unlike a database executing a `JOIN` across two tables owned by different systems.

When a client asks for a `User` and their `Reviews`, the Router doesn't run any resolvers itself. It consults the federated schema, determines that the `Users` service is authoritative for base user fields and the `Reviews` service is authoritative for review fields, sends a request to `Users` for the base data, takes the resulting IDs, and issues a second batched request to `Reviews` using those IDs as the join key — exactly like a database performing a JOIN by primary key.

## The Architecture: Subgraphs and the Supergraph Router

Federation requires two pieces:

1. **Subgraphs** — independent GraphQL services, one per domain team, each exposing only the types and fields it owns.
2. **The Supergraph Router** — a gateway (commonly the Rust-based Apollo Router) that ingests every subgraph's schema, composes them into one supergraph schema, plans query execution across subgraphs, and stitches the responses back together for the client.

### Subgraph 1: The Users Service

`Users` is the source of truth for identity. It declares `User` as a federated entity using the `@key` directive, which tells the Router "this type has a stable identifier other subgraphs can reference."

```graphql
# Users Subgraph
type User @key(fields: "id") {
  id: ID!
  username: String!
  email: String!
}

type Query {
  user(id: ID!): User
}
```

Under the hood, declaring `@key` generates a hidden `__resolveReference` resolver in this subgraph. When the Router later hands this service just an `id`, that resolver knows how to look up and return the full `User`.

### Subgraph 2: The Reviews Service

`Reviews` attaches its own data onto `User` without needing any knowledge of the `Users` service's codebase — it only declares a *stub* of `User` carrying the field it wants to extend.

```graphql
# Reviews Subgraph
type Review {
  id: ID!
  body: String!
  rating: Int!
}

# A minimal reference to User — just enough to attach `reviews`.
type User @key(fields: "id") {
  id: ID!
  reviews: [Review]
}
```

When `Reviews` boots up, it registers this schema with the Apollo schema registry, which statically validates every subgraph's contributions and composes them into one **supergraph schema** — the merged, conflict-checked view the Router actually serves.

### The Execution Plan

Given this client query:

```graphql
query {
  user(id: "123") {
    username
    reviews {
      body
    }
  }
}
```

The Router decomposes it into a query plan:

```text
+-----------------------------------------------------------------+
|                        ROUTER QUERY PLAN                        |
+-----------------------------------------------------------------+
|                                                                   |
|  Step 1: query { user(id: "123") { id username } }               |
|          -> send to Users subgraph                               |
|                                                                   |
|  Step 2: extract id="123" from the response                      |
|                                                                   |
|  Step 3: query { _entities(representations: [{ __typename:       |
|          "User", id: "123" }]) { ... on User { reviews { body }   |
|          } } }                                                    |
|          -> send to Reviews subgraph                             |
|                                                                   |
|  Step 4: merge both JSON responses into one payload,              |
|          shaped exactly like the client's original query          |
+-----------------------------------------------------------------+
```

`_entities` is the special federation query every subgraph automatically implements — it's how the Router asks "given this reference, resolve the fields I need from you."

## Beyond the Basics: `@requires` and `@provides`

Federation's real power shows up when a field's resolution depends on data owned by a *different* subgraph. Say `Reviews` wants to compute a "Verified Purchaser" badge, which requires the user's `email` — a field owned by `Users`.

```graphql
# Reviews Subgraph
type User @key(fields: "id") {
  id: ID!
  email: String! @external
  isVerifiedPurchaser: Boolean! @requires(fields: "email")
}
```

The `@requires(fields: "email")` directive tells the Router: before calling `Reviews` for `isVerifiedPurchaser`, first fetch `email` from `Users` and pass it along in the `_entities` representation. The Router handles that extra network hop transparently — the `Reviews` subgraph developer just writes a resolver that assumes `email` is already there.

## Common Misconceptions

**Misconception:** "Federation is just schema stitching with a different name."
**Reality:** Stitching merges schemas by imperative code the gateway author writes and maintains by hand. Federation is declarative — each subgraph declares ownership via `@key`/`@requires`/`@provides`, and a schema registry validates composition *before* runtime, catching conflicts at build time instead of failing silently at query time.

**Misconception:** "Every subgraph needs to know about every other subgraph."
**Reality:** The opposite is the whole point. `Reviews` never imports or calls `Users`' code — it only declares a stub type and lets the Router handle cross-service resolution.

## Key Takeaways

- Schema stitching required a central, hand-maintained merge process; Federation replaces it with declarative ownership (`@key`) and centralized query planning.
- The Router treats cross-subgraph field resolution like a distributed JOIN: fetch base entities from the owning subgraph, then batch-fetch extended fields using `_entities`.
- `@requires` and `@provides` let one subgraph compute derived fields using data it doesn't own, without the subgraph developer writing any cross-service networking code.
- Federation preserves microservice team autonomy while still presenting client applications with one unified graph.

## What to Learn Next

- The GraphQL N+1 problem and DataLoader batching, which subgraphs still need internally even with Federation handling cross-service joins.
- REST API design and its trade-offs against GraphQL, especially around caching and payload shaping.
- The Sidecar/Service Mesh pattern, for handling mTLS and retries between the Router and each subgraph at the infrastructure layer.
