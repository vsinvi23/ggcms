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

## 🗄️ Database Migration Defect Resolution

### Migration Collision Fix (Version `024`)
The migration folder currently contains a breaking version collision:
- [`024_feature_flags.sql`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/backend/go-cms/migrations/postgres/024_feature_flags.sql)
- [`024_user_profiles.sql`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/backend/go-cms/migrations/postgres/024_user_profiles.sql)

**Action Item:** Renumber `024_user_profiles.sql` to `025_user_profiles.sql` and shift subsequent files (`025_user_profile_multiprofile.sql` $\rightarrow$ `025a` / `026`) to guarantee a linear, deterministic execution sequence.

### Canonical Taxonomy Schema Definition
- **Domain:** Top-level knowledge area (Software Engineering, Cloud, Cybersecurity, Data, AI & ML) defined in [`034_domains_and_content_categories.sql`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/backend/go-cms/migrations/postgres/034_domains_and_content_categories.sql).
- **Category:** Sub-taxonomy belonging to a Domain (e.g. Identity & Access under Cybersecurity).
- **Topic:** Knowledge Graph entity node defined in [`029_topics.sql`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/backend/go-cms/migrations/postgres/029_topics.sql) and [`031_p0_knowledge_graph.sql`](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/backend/go-cms/migrations/postgres/031_p0_knowledge_graph.sql).
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
