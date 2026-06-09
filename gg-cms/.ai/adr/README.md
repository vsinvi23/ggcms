# Architecture Decision Records

ADRs document significant architectural choices — the decision, context, and alternatives considered.

## Index

| # | Title | Status |
|---|-------|--------|
| [ADR-001](001-clean-architecture.md) | Clean Architecture with layered separation | Accepted |
| [ADR-002](002-dual-database.md) | PostgreSQL + MongoDB dual database | Accepted |
| [ADR-003](003-go-gin-framework.md) | Go + Gin for backend | Accepted |
| [ADR-004](004-react-query-state.md) | TanStack React Query for server state | Accepted |
| [ADR-005](005-jwt-auth.md) | JWT authentication with HttpOnly cookie | Accepted |
| [ADR-006](006-multi-reviewer-workflow.md) | Multi-reviewer content approval workflow | Accepted |
| [ADR-007](007-personalization-postgres.md) | User profiles in PostgreSQL with JSONB | Accepted |
| [ADR-008](008-native-html-sanitizer.md) | Browser-native HTML sanitizer instead of DOMPurify | Accepted |

## How to Add an ADR

1. Create `NNN-short-title.md` in this directory
2. Use the template from `../.ai/templates/adr-template.md`
3. Add an entry to the index above
4. Update `memory-bank.md` if the decision affects architecture fundamentals
