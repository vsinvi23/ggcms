# GCP Deployment Readiness and UI/DB Migration Implementation Plan

## Context & Executive Summary

This document establishes the consolidated design specification, technical implementation roadmap, and GCP deployment readiness plan for **GeekGully CMS**. 

It unifies:
1. The repository deployment guidelines and automation scripts ([`release/deploy-test.sh`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/release/deploy-test.sh), [`release/deploy-prod.sh`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/release/deploy-prod.sh)).
2. The UI/UX Product Specification ([`GeekGully UI-UX Product Specification — Learning Platform Experience.md`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/UI%20redesign/GeekGully%20UI-UX%20Product%20Specification%20%E2%80%94%20Learning%20Platform%20Experience.md)) and design reference image ([`ChatGPT Image Sep 9, 2026, 08_41_13 PM.png`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/UI%20redesign/ChatGPT%20Image%20Sep%209,%202026,%2008_41_13%20PM.png)).
3. The database migration hardening required across [`gg-cms/backend/go-cms/migrations/postgres/`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/backend/go-cms/migrations/postgres/).

---

## 🎯 System Objectives

Create a seamless, developer-friendly learning/content platform where:
- **UI & Discovery:** The public redesign follows the reference image layout pattern: a simplified GeekGully header, a domain-first Explore page, article and course detail page shells, a topic page, a learning path page, and a user dashboard / my-learning page with consistent navigation and compact card patterns.
- **Search & Navigation:** Search is replaced by a compact, bounded command-spaced UI pattern, and page-level tabs such as Home, Explore, Learn, Topics, Courses, Learning Paths, and My Learning use a single visual language.
- **Taxonomy Integrity:** Domains, Categories, Topics, and Tags have a single, contract-safe definition across backend Go services and frontend React components.
- **Database Hardening:** Migration file collisions are resolved, ensuring a deterministic, idempotent schema sequence from `001_initial.sql` through `034_domains_and_content_categories.sql`.
- **GCP Native Deployment:** Deployment follows the automated 4-Phase methodology (DB Clean Reset $\rightarrow$ Cloud Build $\rightarrow$ Cloud Run with Direct VPC Egress $\rightarrow$ Live E2E Verification).

---

## �️ Brand Preservation & Visual Identity Constraints

The redesign must preserve the current GeekGully brand identity and visual system exactly as implemented in the repository:

- Keep the existing GeekGully logo component and asset path instead of introducing a new logo or changing the current logo proportions.
- Reuse the existing frontend design tokens and CSS variables for primary, secondary, text, background, border, and status colors.
- Do not introduce a new palette, a new icon family, or a new visual theme. The image is a layout/UX reference, not a permission to change the brand colors or logo.
- Use the current `GGLogo` component and the existing `primary`, `background`, `border`, and `sidebar` color tokens already wired through the UI shell.

This constraint applies across Home, Explore, Article, Course, Topics, Learning Paths, and the user dashboard layout discussed in the screenshot reference.
## 🔒 Security, Scraping, and Abuse Safeguards

The redesign work must stay compatible with the current product security posture and avoid increasing the exposure of content, metadata, user paths, or authentication surfaces:

- Continue to reuse the currently shipped `GGLogo` and existing color theme tokens; do not add alternate brand file paths or global CSS selectors that affect other page families.
- Ensure public page layouts reveal only the minimum required content metadata and avoid exposing protected author, internal taxonomy, or unpublished data in response payloads.
- Keep all public search, listed content, and topic pages behind the existing server-side authorization and published-content filtering patterns.
- Add rate limiting, content throttling, and server-side validation for any new topic/content endpoints or UI service methods with content-type or search query parameters.
- Do not make content cards or article/course sample pages scrape-friendly by exposing internal IDs, hidden route metadata, or raw internal URLs; use the existing public route contract and safe DTO envelope.
- Treat the redesign as a same-brand UI shell only; do not extend public pages to reveal internal site structure, user-group ownership, or data that should be hidden from unauthenticated and crawler traffic.

### Implemented Safety Evidence

The current branch now carries a verified first enforcement slice:

- The UI topic service uses the `response?.data?.data ?? []` fallback in [gg-cms/frontend/react-ui/src/api/services/topicService.ts](gg-cms/frontend/react-ui/src/api/services/topicService.ts) so the topic-content widget never assumes a data array shape.
- The Explore page header no longer prints fabricated article/course count placeholders like `500` or `50` in [gg-cms/frontend/react-ui/src/pages/CourseCategoryPage.tsx](gg-cms/frontend/react-ui/src/pages/CourseCategoryPage.tsx); it now reflects the actual feed-backed list count when the route delivers one.
- The backend public topic handler in [gg-cms/backend/go-cms/internal/interfaces/http/handler/topic_handler.go](gg-cms/backend/go-cms/internal/interfaces/http/handler/topic_handler.go) now normalizes the query type string to uppercase and rejects non-`ARTICLE` / `COURSE` contentType values.
- The same handler now parses the `size` query value safely with a hard upper clamp of `50`, defaulting to `20` when the query is absent or malformed.
- The public route is now constrained to a safe content-type enum and safe range of requested items, reducing the chance of public route amplification or unbounded scraping behavior.

## 🌐 GCP Deployment Architecture Baseline

The application is configured to deploy directly to GCP using existing automated infrastructure:

```text
               ┌────────────────────────────────────────────────────────┐
               │              GCP Cloud Run (Frontend & APIs)           │
               └──────────────────────────┬─────────────────────────────┘
                                          │ Direct VPC Egress
                                          ▼
┌──────────────────────────┐    ┌──────────────────────────────────────┐
│ Secret Manager           │    │ Cloud SQL / Postgres (DB VM)          │
│ • factory-gemini-api-key │    │ • Persistent data volume             │
│ • gg-cms-jwt-secret      │    │ • Auto-migrating schema              │
│ • factory-sync-secret    │    └──────────────────────────────────────┘
└──────────────────────────┘    ┌──────────────────────────────────────┐
                                │ Cloud Storage (GCS)                  │
                                │ • gs://ggcms-free-tier-vivek-...     │
                                └──────────────────────────────────────┘
```

### Deployment Protocol (Strict 4-Phase Methodology):
1. **Phase 1 (DB Clean Reset):** Cleanly recreate database containers on the DB VM (`docker rm -f` + `docker compose up -d`) to prevent stale TLS/permission drift while preserving persistent data volumes.
2. **Phase 2 (Cloud Build):** Submit container builds via Cloud Build.
3. **Phase 3 (Cloud Run Deploy):** Deploy Cloud Run services with full environment variables (`CONTENT_FACTORY_URL`, `DB_WRITE_URL`, etc.) and Direct VPC egress (`--network=default --subnet=default --vpc-egress=private-ranges-only`).
4. **Phase 4 (Live E2E Verification):** Run automated verification for DB health, JWT auth, SPA loading, and API path rewrites (`/factory/api/...`).

---

## 🗄️ Database Migration & Security Enforcement

### Migration Collision Fix (Version `024` $\rightarrow$ `035`) — ✅ Implemented & Enforced
The migration sequence has been re-indexed into a clean, 35-file linear sequence:
- [`024_feature_flags.sql`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/backend/go-cms/migrations/postgres/024_feature_flags.sql)
- [`025_user_profiles.sql`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/backend/go-cms/migrations/postgres/025_user_profiles.sql)
- ...
- [`035_domains_and_content_categories.sql`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/backend/go-cms/migrations/postgres/035_domains_and_content_categories.sql)

**Runtime Enforcement:** [`migrations.go`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/backend/go-cms/migrations/migrations.go) includes embedded runtime index validation that halts server startup if duplicate migration prefixes are detected. Tested by [`migrations_test.go`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/backend/go-cms/migrations/migrations_test.go).

### Route-Wide Security & Anti-Scraping Gate — ✅ Implemented & Enforced
Public endpoints are protected against scraping, automated harvesting, and DOS attacks via per-IP rate limiting:
- **Middleware:** `PublicRateLimit()` in [`rate_limit.go`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/backend/go-cms/internal/interfaces/http/middleware/rate_limit.go) (60 requests/min per IP with `Retry-After` and `X-RateLimit-Limit` headers).
- **Route Coverage:** Attached in [`router.go`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/backend/go-cms/internal/interfaces/http/router.go) to `/public/*`, `/topics/*`, `/categories/*`, `/domains/*`, `/learning-paths/*`.

### Canonical Taxonomy Schema Definition
- **Domain:** Top-level knowledge area (Software Engineering, Cloud, Cybersecurity, Data, AI & ML) defined in [`035_domains_and_content_categories.sql`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/backend/go-cms/migrations/postgres/035_domains_and_content_categories.sql).
- **Category:** Sub-taxonomy belonging to a Domain (e.g. Identity & Access under Cybersecurity).
- **Topic:** Knowledge Graph entity node defined in [`030_topics.sql`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/backend/go-cms/migrations/postgres/030_topics.sql) and [`032_p0_knowledge_graph.sql`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/backend/go-cms/migrations/postgres/032_p0_knowledge_graph.sql).
- **Tag:** Metadata label for secondary filtering defined in [`006_tags.sql`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/backend/go-cms/migrations/postgres/006_tags.sql).

---

## 🎨 Visual Layout Reference from the Current Redesign Image

The current reference image shows the requested public page family and layout language as a connected system rather than isolated pages:

1. **Home page**
   - Header and navigation shell with GeekGully brand
   - Compact hero area for learning discovery
   - Domain cards, continue learning area, recommended article/course cards
   - Footer-like lower layout while keeping the same page shell

2. **Explore page**
   - `Explore` heading and subtitle
   - Domain cards for Software Engineering, Cloud & Infrastructure, Cybersecurity, Data, and AI & Machine Learning
   - Category grid under the selected domain
   - A “Not sure where to start?” CTA for learning paths
   - Domain/category-count visual structure and public browse semantics

3. **Article page**
   - Right-side sticky chapter or on-page table of contents
   - Article title and metadata block
   - Related content cards or article widgets
   - Compact public article content layout with strong left-to-right visual reading order

4. **Course page**
   - Course detail shell with a strong title, metadata, and a visible learning path or syllabus structure
   - Appropriate icon placement and grid layout

5. **Topics page**
   - Topic listing grid or cards with semantic relationships
   - Simple search/filter bar for topic discovery
   - Topic relationship and content count patterns

6. **Learning Path page**
   - Visual learning path layout with intro, overview, curriculum, and skills blocks
   - Attention-grabbing CTA design for path start

7. **User dashboard / My Learning page**
   - User identity and learner action panel
   - Continue Learning, Recommended for You, progress list, and per-user study layout

### UI Implementation Rules Derived from the Visual Reference

1. **Header & top navigation:** Keep the GeekGully brand shell persistent and consistent across home, explore, article, course, topic, learning path, and dashboard pages.
2. **Page composition pattern:** Use a left or center content canvas with stable header, card grids, and content metadata.
3. **Domain & category layout:** Use a domain-card grid with domain icons and visible counts, followed by category-card grids and optional CTA guidance.
4. **Article and course detail layout:** Keep clear, readable main-page article/course structure with a right-side or sticky article-index/navigation pattern.
5. **Topic and learning-path layout:** Use card-based taxonomy discovery and curriculum visual structure rather than dense tables.
6. **Search and command UI:** Replace page-hijacking combobox dropdowns with a `⌘K`-style Spotlight overlay and constrain the overlay height to `max-h-[420px]`.
7. **Design consistency:** Use the existing GeekGully design tokens and brand color system. Do not introduce an alternate color palette or mixed icon libraries.

---

## 🛠️ Phased Execution Plan & Verification Commands

### Phase 1 — Contract & Taxonomy Normalization
- Audit and align `CmsResponseDto`, `DomainDto`, `CategoryDto`, and `TopicResponse` in [`gg-cms/frontend/react-ui/src/api/types.ts`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/frontend/react-ui/src/api/types.ts).
- Ensure published-only data filtering across topic and category endpoints.

### Phase 2 — Database Migration Repair
- Renumber [`024_user_profiles.sql`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/backend/go-cms/migrations/postgres/024_user_profiles.sql) to eliminate the index collision.
- Run local migration verification:
  ```bash
  docker compose -f release/docker-compose.backend.yml up -d db
  ```

### Phase 3 — Backend Service Hardening
- Verify topic and content route handlers in `go-cms`:
  ```bash
  cd gg-cms/backend/go-cms && go test -v ./...
  ```

### Phase 4 — Explore Page & Search UI Redesign
- Refactor [`CourseCategoryPage.tsx`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/frontend/react-ui/src/pages/CourseCategoryPage.tsx) to match Panel 2 of the UI mockup image.
- Enforce `max-h-52` bounds on all command popovers in [`SearchResults.tsx`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/frontend/react-ui/src/pages/SearchResults.tsx).
- Run frontend build verification:
  ```bash
  cd gg-cms/frontend/react-ui && npm run build
  ```

### Phase 5 — GCP Deployment & Smoke Verification
- Trigger local test deployment:
  ```bash
  ./release/deploy-test.sh --local
  ```
- Run E2E health checks against backend endpoints and `/factory/api/health`.

---

## ✅ Success Criteria

- The migration sequence in `migrations/postgres/` executes deterministically without collision errors.
- The Explore page matches Panel 2 of the GeekGully UI specification without expanding combobox dropdowns.
- The Spotlight search modal (`⌘K`) handles query suggestions cleanly without page height expansion.
- Automated deployment scripts ([`release/deploy-test.sh`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/release/deploy-test.sh)) successfully deploy and verify the application stack.
