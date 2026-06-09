# ADR-001: Clean Architecture with Layered Separation

**Status:** Accepted  
**Date:** 2025

## Context

The backend needed to be maintainable as the team grew and features expanded. Business logic had to remain testable independently of HTTP and database concerns.

## Decision

Adopt Clean Architecture with four explicit layers:

1. **Domain** (`entity/`, `repository/interfaces.go`) — pure domain types and interface contracts
2. **Application** (`application/*/service.go`) — business logic; depends only on domain interfaces
3. **Infrastructure** (`infrastructure/persistence/`) — GORM and MongoDB implementations of interfaces
4. **Interfaces** (`interfaces/http/`) — Gin handlers and DTOs; depends on application services

Dependency flow: `interfaces → application → domain ← infrastructure`

## Consequences

**Positive:**
- Services are independently testable with mock repositories
- Infrastructure can be swapped (e.g., replace MongoDB with another store) without touching business logic
- Clear ownership: each file has a single, well-defined responsibility
- New team members can navigate the codebase by layer

**Negative:**
- More files per feature (entity + interface + impl + service + handler + DTO)
- Boilerplate in simple CRUD features

## Alternatives Considered

- **Flat package structure** — rejected because business logic would scatter across packages
- **Active Record (GORM models with methods)** — rejected because it mixes persistence and business logic
