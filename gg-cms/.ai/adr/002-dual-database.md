# ADR-002: PostgreSQL + MongoDB Dual Database

**Status:** Accepted  
**Date:** 2025

## Context

The platform needed two different storage characteristics:
- **Transactional consistency** for users, permissions, content, enrollments
- **Flexible, high-volume, schemaless** storage for engagement events, audit logs, and user-generated annotations

## Decision

Use two databases with explicit responsibility boundaries:

**PostgreSQL** (via GORM + pgx/v5):
- Users, groups, RBAC
- Categories, articles, courses, sections, lessons
- Enrollments, tasks, learning paths
- Content reviews, workflow events (relational)
- User profiles, app settings

**MongoDB** (via mongo-driver):
- Analytics events (high write volume)
- Audit logs (insert-only, flexible schema)
- Comments with nested replies (embedded documents)
- Reactions, notes, favourites, highlights (per-user, per-content)

**Redis** (planned, not yet wired):
- Rate limiting counters (shared across pods)
- Token cache
- URL category lookup TTL cache

## Consequences

**Positive:**
- PostgreSQL handles joins, transactions, referential integrity for structured data
- MongoDB handles variable-schema and high-volume writes efficiently
- Read replica for PostgreSQL (`DB_READ_URL`) reduces query load on primary

**Negative:**
- Two databases to operate, monitor, and back up
- No cross-database transactions (accepted trade-off: engagement data is eventually consistent)
- Developers need to know both query languages

## Alternatives Considered

- **PostgreSQL only** — rejected because of schema rigidity for annotation/event data
- **MongoDB only** — rejected because of weak join support for RBAC and content relationships
