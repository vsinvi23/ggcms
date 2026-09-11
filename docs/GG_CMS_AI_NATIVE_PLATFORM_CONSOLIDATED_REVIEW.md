# GG-CMS: AI-Native Content Platform — Consolidated Review Document

**Purpose:** single artifact for independent (third-party) review of the current state and proposed direction across three systems: **gg-cms backend**, **gg-cms frontend/portal**, and **content-factory** (the AI content producer). Covers content creation → submission → classification → cross-domain knowledge access → recommendation, evaluated against the ambition of an AI-native learning portal comparable to GeeksforGeeks, Substack, LeetCode, and Educative.

**Status:** Planning/analysis consolidation, 2026-09-09. No implementation has started on the proposals below; `topics`/`topic_relationships`/`content_topics` (backend only) is the only piece already shipped.

**Source documents this consolidates:** `TAXONOMY_ARCHITECTURE_DECISION.md`, `TAXONOMY_GAP_ANALYSIS.md`, `TOPICS_KNOWLEDGE_GRAPH_ROADMAP.md`, plus direct inspection of the gg-cms Go backend, React frontend, and content-factory Python service (see file citations throughout — this document does not introduce new claims beyond what those sources and direct code inspection support).

**2026-09-09 cleanup note:** `TAXONOMY_GAP_ANALYSIS.md` and `TOPICS_KNOWLEDGE_GRAPH_ROADMAP.md` have been deleted as superseded — every finding in them is carried forward above, and their two pieces of detail not otherwise duplicated here (the full spec-vs-current side-by-side table, and the frontend file list) are preserved in Appendix B and Appendix C below. `TAXONOMY_ARCHITECTURE_DECISION.md` remains as the governing decision doc (this document is the fuller narrative built on top of it — both are kept). `GEEKGULLY-TAXONOMY-AND-PLATFORM-ARCHITECTURE.md` has been moved to `docs/archive/` — it describes an earlier, unreconciled, conflicting vision (see its new header note) and is retained for reference only.

---

## 1. Executive Summary

GG-CMS today is a working, single-category, single-author-per-category-tree CMS with a review/publish workflow and a fledgling knowledge-graph feature (topics). It is **not yet** an AI-native platform: recommendation logic exists but uses only the weakest available signal (category match); content classification (topics) has zero frontend surface; and the separate content-factory service that will eventually author content autonomously has no contract for topics, categories, or provenance at all — it pushes flat markdown into gg-cms with an unstructured comment-blob for AI metadata.

The central architectural finding, validated against actual code, is this: **the recommendation/personalization capability already lives in the correct system** (`gg-cms/backend/go-cms/internal/application/personalization/service.go`) — the problem is not "where," it's "how rich are the signals." This means the platform's AI-native ambition is achievable by *extending* what exists rather than re-platforming.

The rest of this document lays out: what exists (§2), what's missing/broken relative to the target (§3), the proposed architecture (§4–7), and open items for reviewer sign-off (§8).

---

## 2. Current State — What Exists Today (verified against code)

### 2.1 Content model (gg-cms backend)

`internal/domain/entity/cms.go`:
- `Article` and `Course` — each has: `Title`, `Description`, `Body`, `Status` (DRAFT→REVIEW→APPROVED→PUBLISHED/REJECTED), **one** `CategoryID *uint` (single FK, not many-to-many), `CreatedByID`, `ReviewerID`, full draft/publish/review-baseline versioning snapshot fields.
- `Course` additionally has `Sections` (chapter/lesson tree) and `CourseType` (STANDARD/BYTE/LEARNING_PLAN/CAPSULE).
- No `Quiz`, `Exercise`, `CheatSheet`, or `FAQ` content types exist yet as first-class entities — the factory sync payload carries `Quizzes`/`Exercises` but they are flattened into the article/course body today (see §2.4).

### 2.2 Taxonomy (navigation)

`internal/domain/entity/category.go`:
- Single self-nesting tree: `Category{ID, Name, Slug, ParentID *uint, IsVirtual, RequiredApprovals}`.
- No `domain_id` or any grouping layer above categories.
- Only one category is migration-seeded: the virtual `geek` root (`020_virtual_category.sql`), hidden from all end-user UI, used purely to give the Admin group blanket reviewer access. All real categories (e.g., a hypothetical "Cybersecurity") are created ad hoc via the admin UI — **"Cybersecurity" exists today only as a tag** (`015_seed_tags.sql`), not a category.
- `Tag{Name, Categories []Category many2many}` — tags attach to *categories*, not content directly; a separate mechanism from both topics and categories.

### 2.3 Knowledge classification (already shipped, backend only)

Migrations `029_topics.sql` + `030_seed_topics.sql`, entity `internal/domain/entity/topic.go`:
- `Topic{ID, Name, Slug, EntityType, Description}` — `EntityType` is free-text (technology/protocol/standard/concept/framework/platform/tool/language/skill/methodology), no `parent_topic_id`.
- `TopicAlias{TopicID, Alias}` — exists, but no normalized/lowercased uniqueness constraint, no fuzzy-match resolution wired in.
- `TopicRelationship{SourceTopicID, TargetTopicID, RelationshipType}` — `RelationshipType` is free-text VARCHAR(30), no controlled vocabulary/enum, no weight/confidence/source columns.
- `ContentTopic{ContentID, ContentType, TopicID}` — composite-PK polymorphic join, no `role`/`weight` columns (every attached topic is currently equally weighted, no "primary vs. mentioned" distinction).
- Seed data (`030_seed_topics.sql`) already spans real cross-domain concepts: Identity (OAuth 2.0, OIDC, JWT, SAML), PKI, Cloud (AWS/Azure/GCP), Containers, IaC, Data, Security, AI/ML — i.e., the *content* to prove cross-domain value already exists as topic rows; nothing consumes it yet.
- Full CRUD stack exists: `topic_repository.go` (replace-all semantics on `SetRelationships`/`SetContentTopics` — delete-then-bulk-insert in a transaction), `topic/service.go` (idempotent create via slug lookup), `topic_handler.go`, routes wired in `router.go`. Verified: `go build`/`go vet`/`go test` all pass.

### 2.4 Provenance (today: unstructured)

`internal/interfaces/http/handler/factory_import_handler.go`:
- Ingests `FactorySyncPayload` (mirrors the factory's Python `SyncPayload` field-for-field — `internal/interfaces/http/dto/factory_sync_dto.go`).
- Payload has **no topic or category field at all**. `Metadata`, `Learning` (objectives/prerequisites/skills_gained), `ArticleBody`/`CourseDetails`, `Quizzes`, `Exercises`, `Provenance` (model/provider/agent_version/knowledge_pack_id/generated_at/quality_score) are present — but AI provenance is JSON-marshaled and appended to the article/course `Body` as an HTML comment block (`factoryExtrasBlock`/`appendExtrasBlock`), not stored in queryable columns.
- Practical consequence: "show me everything the AI generated using model X" or "find all claims sourced from source Y" is not a query gg-cms can answer today — it would require parsing HTML comments out of body text.

### 2.5 Recommendation / personalization (already shipped, weak signals)

`internal/application/personalization/service.go` (confirmed by direct read, not assumption):
- `UserProfile{ExperienceLevel, RoleType, LearningGoals, InterestedTagIDs, PreferredCategoryIDs}` — real, persisted, per-user.
- `GetRecommendations(userID, limit)` is a genuine two-stage candidate→score→sort→limit engine — **the right shape already** — but its only signals are: `+4` per preferred-category match, `+3` per interested-tag match (via category→tags join), `-10` if already enrolled. **Zero awareness of `topics`/`topic_relationships`.**
- Performance: does two full unpaginated `FindAll` scans (≤200 articles + ≤200 courses) per request, no cache. Per root `gg-cms/CLAUDE.md` scalability targets (Redis + `singleflight.Group`), this will not hold at scale once richer candidate generation is added.
- `PersonalizationHandler.GetRecommendations` exposes this at `GET /api/personalization/recommendations?limit=N`, returning only `Score` — no explanation of *why* something was recommended.

### 2.6 Frontend (gg-cms/frontend/react-ui)

- Category tree UI exists: `CategoryTreeSelect.tsx` (single-select, tree-shaped, closes on select) and `CategoriesTab.tsx` (admin CRUD).
- Tag picker exists, following a chip/typeahead pattern, backed by `useTags.ts`.
- **Topics have zero frontend consumers** — no `topicService.ts`, no `useTopics.ts`, no admin page, no picker in `ArticleCreator.tsx`/`CourseCreator.tsx`.
- "Related content" exists only in `CourseViewPage.tsx` (`relatedCourses`, client-side array filter by matching category) — a placeholder, not a real relevance signal. `ArticleViewPage.tsx` has no related-content section at all.
- `TechnologyPage.tsx` exists as a category-scoped landing page — confirms the current mental model is "one page per category," which will need to coexist with domain-level pages if the taxonomy proposal (§5) ships.

### 2.7 content-factory (Python/FastAPI) — separate system, separate repo path

- Stack: FastAPI, LangGraph, Pydantic v2, PostgreSQL 16 + pgvector, SQLAlchemy 2 + Alembic (confirmed in `content-factory/docs/architecture/IMPLEMENTATION_SPECIFICATION.md`).
- Pipeline: Strategy → Opportunity → Research → Evidence Pack → Knowledge Pack → Writer/QA → export via `ggcms_client.py` → `POST {ggcms_base_url}/api/import/ingest`.
- `models/domain.py`: `Opportunity.canonical_topic: str | None` — described in an inline comment as a "Topic Registry," but this is a **free-text slug never reconciled against gg-cms's real `topics` table.** Two independent, unsynchronized notions of "topic" exist across the two systems today.
- `SyncPayload` (`schemas/sync_payload.py`) — no topic, no category field, matching what §2.4 found on the gg-cms side.
- **⚠️ Reviewer note:** `content-factory/docs/architecture/` contains documents describing materially different stacks — `AI_LEARNING_CONTENT_FACTORY_PROPOSITION.md` describes a Go/Gemini-Batch/River-queue design that contradicts the actual Python/FastAPI/LangGraph stack confirmed in the repo and in `IMPLEMENTATION_SPECIFICATION.md`/`SLAD_AI_CONTENT_FACTORY.md`. Treat the Go-stack proposition as superseded/stale pending explicit confirmation — this consolidated document assumes the Python stack is authoritative, since it matches what's actually in the repo.

---

## 3. Gap & Finding Summary (prioritized)

| # | Severity | Area | Finding | Why it matters for cross-domain / AI-native goals |
|---|----------|------|---------|----------------------------------------------------|
| 1 | **Blocker** | Content↔category | Single FK, not many-to-many — one article can live in exactly one category. | Directly blocks "this article lives in both Security and Cloud" — the most literal reading of "cross-domain content." |
| 2 | **Blocker** | Recommendation | Only signal is category/tag equality; zero use of the already-seeded topic graph. | The knowledge graph investment delivers no user-visible value until this is fixed — recommendations today cannot say "OAuth → OIDC" is a stronger link than "OAuth → Kubernetes" even though both exist as topic rows. |
| 3 | **Blocker** | Provenance | AI provenance stored as an HTML comment blob in body text, not structured columns. | Disqualifies "trace any AI-generated claim to its source" — a stated acceptance criterion of the taxonomy spec, and a hard requirement for any AI-native platform where editorial trust matters (per GeeksforGeeks/Educative-style credibility expectations). |
| 4 | **Blocker (governance)** | Topic resolution | No alias/fuzzy-match check before creating a topic — exact-slug-match idempotency only. | Once the factory (or any AI agent) writes to `topics` autonomously, "OAuth2" vs "OAuth 2.0" vs "OAuth 2" silently fragments the graph — expensive to repair after the fact, unlike a miscategorized article (one-row fix). |
| 5 | Important | Frontend | Topics have zero UI surface — no admin CRUD, no content-editor picker, no consumption in related-content sections. | Backend investment (§2.3) is currently inert; nothing can be topic-tagged by a human today. |
| 6 | Important | Factory↔CMS contract | `SyncPayload`/`FactorySyncPayload` carry no topic or category field; factory's `canonical_topic` is unreconciled free text. | Even after the frontend UI ships, AI-generated content lands completely untagged — an editor must manually tag every factory import after the fact, defeating "autonomous factory" as a goal. |
| 7 | Important | Query performance | No denormalized category on `content_topics`; no cursor pagination/bulk-lookup on `TopicRepository.FindAll`; no `FindReachable` multi-hop traversal method. | "Show everything under Topic X, faceted by category" and "find everything 2 hops from Topic X" both require raw joins/CTEs today with no repository-layer support — a risk for the 1M-user scalability target in root `CLAUDE.md`. |
| 8 | Important | Recommendation cost | `GetRecommendations` does two full unpaginated table scans per request, no cache. | Adding topic-relationship traversal as another candidate source makes an already-uncached hot path worse, not better, unless caching ships alongside it. |
| 9 | Moderate | Relationship/topic richness | No `weight`/`confidence`/`source` on `topic_relationships`; no `role`/`weight` on `content_topics`; no `parent_topic_id` for topic hierarchy; `relationship_type`/`entity_type` are free-text, not enums. | Blocks the spec's layered recommendation-signal weighting and risks silent typo-fragmentation of relationship edges. |
| 10 | Moderate | Governance workflow | No merge/rename/deprecate/redirect operations on topics; no reviewer-gating decision made for topic assignment (currently wired as free-form/non-admin, unlike category which is reviewer-gated). | Once duplicates occur (inevitable until #4 is fixed), there is no safe consolidation path without orphaning content. |
| 11 | Informational | Content types | No first-class `Quiz`/`Exercise`/`CheatSheet`/`FAQ` entities — factory payload's `Quizzes`/`Exercises` are flattened into body text today. | Every new content type currently risks needing its own `xxx_topics`/`xxx_categories` join tables unless a polymorphic contract is formalized now (see §5.2). |
| 12 | Informational | Two-system topic drift | content-factory's `Opportunity.canonical_topic` and gg-cms's `topics` table are two unsynchronized concepts of "topic" today. | Left alone, autonomous content generation will invent topic names gg-cms's registry never sees, defeating the entire point of a canonical knowledge graph. |

---

## 4. Target Architecture — System Boundary

```
┌───────────────────────────────┐        Content Import Contract        ┌─────────────────────────────────────┐
│   CONTENT-FACTORY (producer)  │   (content, topics, categories,       │      GG-CMS (system of record +      │
│   Python/FastAPI/LangGraph    │    learning metadata, provenance)     │      portal experience)               │
│                                │ ─────────────────────────────────────▶│                                       │
│  Strategy → Opportunity →     │                                       │  Taxonomy · Knowledge Graph ·         │
│  Research → Evidence Pack →   │                                       │  Content Metadata · Provenance ·      │
│  Knowledge Pack → Writer/QA   │                                       │  User/Learning Context ·              │
│                                │                                       │  Recommendation Intelligence ·        │
│  Independently deployable.    │                                       │  AI Assistant/Context · Editorial     │
│  Owns NO recommendation,      │                                       │  Governance · Portal UI               │
│  personalization, or user-    │                                       │                                       │
│  context logic.               │                                       │                                       │
└───────────────────────────────┘                                       └─────────────────────────────────────┘
```

**Rule, stated as a hard constraint, not a preference:** the content factory cannot personalize anything (no user identity, no session, no UI context) — so recommendation/personalization logic belongs entirely in gg-cms. This is not a redesign; `UserProfile` and `personalization.Service` are already gg-cms-only, domain-layer constructs (§2.5). The correction needed is to stop scoping recommendation work as part of any factory/import-contract effort.

### 4.1 Eight concepts that must stay architecturally independent

| # | Concept | Status today |
|---|---------|---------------|
| 1 | Navigation taxonomy (domains/categories) | Exists (categories only, no domains) |
| 2 | Knowledge graph (topics/relationships) | Exists, backend-only, ungoverned |
| 3 | Content metadata | Exists (Article/Course fields) |
| 4 | Content provenance | Exists but unstructured (HTML comment blob) |
| 5 | User/learning context | Exists (`UserProfile`) |
| 6 | Recommendation intelligence | Exists but signal-poor (`personalization.Service`) |
| 7 | AI assistant/context | Does not exist — architectural seam only, not to be built yet |
| 8 | Editorial governance | Exists (`content_reviews`, `Category.RequiredApprovals`, reviewer groups) |

Two of these (5 and 8) are frequently mistaken for greenfield work — they are not; new work must extend them behind stable interfaces, not fork parallel mechanisms.

**Hard rules for any implementation (mechanically checkable in review):**
- Do not use category membership as a substitute for semantic knowledge. *Categories are navigation/editorial classification. Topics are semantic/knowledge classification. Topic relationships represent conceptual relationships. Learning paths represent pedagogical progression. Recommendations must be generated from these layers independently and then combined through an explicit ranking model.*
- Do not put recommendation logic inside content or category services — it lives in `personalization` (or a successor package), consuming topic/category data through service interfaces, never their tables directly.
- Do not put AI-specific logic (provenance parsing, generation-run linkage, quality scoring) directly into `Article`/`Course` domain entities — attach via the polymorphic `ContentResource` pattern (§5.2), the same way `content_reviews`/`content_topics` already do.

### 4.2 Target end state (framing)

```
Content + Knowledge Graph + User Context + AI Intelligence  =  AI-Native Learning Platform
```
not
```
Content + Chatbot  =  AI CMS
```

---

## 5–10. Proposed Architecture, Recommendation Design, Category Structure, Knowledge Layer, AI Context, Agent Assignment

**Superseded by `TAXONOMY_ARCHITECTURE_DECISION.md` (2026-09-09 rewrite) — read that document for the current, reviewed, and accepted content of what were originally §5–§10 here.** After the external architecture review, `TAXONOMY_ARCHITECTURE_DECISION.md` was rewritten into a single authoritative decision doc (§1–§13) covering this exact material, with every accepted reviewer correction folded in. Maintaining the same content in two places risks silent drift on the next revision, so this section is now a pointer, not a duplicate:

| This document's former section | Now lives at |
|---|---|
| §5.1 Sequencing principle | `TAXONOMY_ARCHITECTURE_DECISION.md` §1 (Objective) |
| §5.2 `ContentResource` | §2 — **decision closed**: document the convention, no new table |
| §5.3 Priority order | §5 — now includes the staged provenance ship-now/defer split, a P0 default-category-tree seed (idempotent SQL, no `domains` table yet), staged `content_categories` migration (4 phases + full consumer checklist), approval-policy lock, and a fully detailed Frontend row (Admin/Editor/Reader UI, §13.7) |
| §5.4 Repository/service gaps | §4 (knowledge graph) and §6 (recommendation) — now with concrete method names and cache-tiering detail |
| §6 Recommendation architecture | §6 — full contract now finalized (§6.1–6.5): concrete Go types, named generator/ranker function signatures, four ranking invariants (dedup, exclusion, personalization-as-signal, deterministic tie-breaking), plain functions not formal interfaces, a two-tier public/internal explanation payload, and one endpoint with a `mode` parameter for Related/Recommended/Next — this is the section that closed the implementation-readiness gate (see §12 item 7 below) |
| §7 Category structure | §7 — now explicit that category depth is editorial/UI policy, never a DB constraint |
| §8 Knowledge layer | §4 — now with concrete schema: `topics.status`/`merged_into_topic_id`, `topic_aliases.normalized_alias`, full `topic_relationships` provenance columns, `content_topics.role`/`weight` with a worked example |
| §9 AI Context | §8 — unchanged in substance, illustrative method sketch added |
| §10 Multi-agent assignment | §9 — now includes the explicit P0→P1 integration checkpoint as a row, and a split Taxonomy Agent (P0 category-seed slice + P1 domains/migration slice) |

The **content-creation-vs-CMS system boundary** (§4 above, this document) and the **eight-concepts independence table** (§4.1) are unchanged and still current — those were not revised by the review.

**2026-09-09, third round:** a separate "GeekGully System Default Taxonomy" implementation/UI spec was reviewed and mostly folded into `TAXONOMY_ARCHITECTURE_DECISION.md` — its category tree, recommendation usage, factory-resolution flow, non-goals, migration-consumer checklist, agent responsibilities, and UI mockups all matched or extended the existing decisions cleanly (§13.7 of that document). Two things it proposed were rejected: seeding a `domains` table in P0 (reopens the already-decided sequencing; only the flat category tree, which needs no `domains` table, moved to P0) and a versioned YAML-manifest bootstrap package (new infrastructure with no current justification — the existing idempotent-SQL seed convention already covers this, per root `CLAUDE.md`'s no-premature-abstraction rule).

---

## 11. Comparison Lens — GeeksforGeeks / Substack / LeetCode / Educative

For third-party reviewers benchmarking against comparable platforms:

| Platform trait | Relevant to this proposal |
|---|---|
| GeeksforGeeks-style topic tagging across DSA/System Design/Language tracks | Maps directly to `content_topics` + cross-category topic discovery (§7.3) — GFG's own site struggles with exactly the "one category, many relevant tags" tension this proposal's litmus test addresses. |
| Substack-style single-author, single-primary-category publishing | Matches gg-cms's current single-`CategoryID` model closely — validates that P1 (multi-category) is additive polish, not a blocker to shipping value now via topics alone. |
| LeetCode-style "prerequisite" and "similar problems" surfacing | Directly maps to the PREREQUISITE_OF/BUILDS_ON relationship types and the Related/Recommended/Next split (§6.2) — this is the concrete UX precedent for why those three must stay distinct. |
| Educative-style structured learning paths with skill progression | Maps to the P3 learning-paths/skills phase — correctly deferred behind knowledge-graph hardening per this document's sequencing, since Educative's path model depends on a trustworthy prerequisite graph, which is exactly the P0 concern here. |

---

## 12. Open Items for Reviewer Sign-Off

**Note (2026-09-09):** `TAXONOMY_ARCHITECTURE_DECISION.md` was restructured into clean numbered sections (§1–§13) with reviewer-attribution moved to a Decision Log (§13), rather than narrated inline — cross-references below point to that new structure.

1. ~~**`ContentResource` scope**~~ — **CLOSED**: see `TAXONOMY_ARCHITECTURE_DECISION.md` §2. Document the existing `(content_id, content_type)` convention as the Content Resource Contract; do not create a `content_resources` table until a 3rd+ content type is being added.
2. **Reviewer-gating for topic assignment** (§3 item 10 above): should topic assignment be reviewer-gated like category, or free-form like tags? Currently wired as free-form/non-admin — a product decision, not a code gap. Also listed as open item in `TAXONOMY_ARCHITECTURE_DECISION.md` §11.
3. **Stack discrepancy in content-factory docs** (§2.7 note above): confirm Python/FastAPI is authoritative and the Go/Gemini-Batch proposition document is stale, before any factory-integration work references it. Also §11 of the architecture decision doc.
4. **`GEEKGULLY-TAXONOMY-AND-PLATFORM-ARCHITECTURE.md`** — archived to `docs/archive/` with a superseded-notice header, not yet reconciled — still flagged as a follow-up cross-check. Also §11.
5. **Is factory-side auto-topic-assignment in scope now**, or should factory-generated content stay manually tagged by an editor for the foreseeable future? Gates whether §5's P2 (Factory integration) is scheduled soon or deferred. Also §11.
6. ~~**Primary-category-controls-approval-policy**~~ — **CLOSED**: see `TAXONOMY_ARCHITECTURE_DECISION.md` §5 (P1 — Navigation architecture). Primary category alone determines `RequiredApprovals`; secondary categories affect discovery/navigation only.
7. ~~**Definition of implementation-ready**~~ — **MET.** Per `TAXONOMY_ARCHITECTURE_DECISION.md` §13.4: ContentResource decision closed ✅, end-to-end acceptance scenarios written ✅ (§12 of that document), recommendation contract finalized ✅ (§6 — contract types, generator/ranker signatures, all four ranking invariants, public/internal response mapping). The recommendation contract went through two independent agent-review passes after the initial external review (§13.6 of that document) — the first found a structural type gap, a checklist omission, and a genuine contradiction in the prerequisite-generator deferral reasoning; all three were fixed with real substance changes (not just rewording) and verified resolved in a second pass. `TAXONOMY_ARCHITECTURE_DECISION.md` is now implementation-ready and is the single source of truth for the multi-agent implementation pass — see its §13 for the full external-review response, including points explicitly rejected as premature for this codebase's current scale.

---

## Appendix A: Spec vs. Current Schema — Full Side-by-Side (carried forward from deleted `TAXONOMY_GAP_ANALYSIS.md`)

| Layer | Spec entity | gg-cms today | Status |
|---|---|---|---|
| **Navigation taxonomy** | `domains` (top-level: Technology, Business, Design, Health, Science, Career) | Not present — `categories` has no domain parent | **Missing layer** |
| | `categories` (domain_id FK, parent_id, self-nesting) | `categories` table: `ParentID *uint` self-nesting, no domain concept, `IsVirtual`, `RequiredApprovals` | **Partial** |
| **Knowledge classification** | `topics` (entity_type-discriminated registry), with `parent_topic_id` for topic-level hierarchy | `topics` table exists (name/slug/entity_type/description) — **no `parent_topic_id`** | **Partial** |
| | `topic_aliases` (normalized_alias UNIQUE) | `topic_aliases` table exists — **no normalized/lowercased unique constraint** | **Partial** |
| | `topic_relationships` (weight, confidence, source, composite PK) | `topic_relationships` exists — **no weight/confidence/source columns** | **Partial** |
| | `content_topics` (role, weight, PK content+topic) | `content_topics` exists — **no role/weight** | **Partial** |
| | `content_skills`, skills as first-class entities | Not present | **Missing** |
| | `content_categories` (many-to-many, `is_primary` flag) | Single FK (`CategoryID`) — one category per item | **Gap — architecturally significant** |
| **Relationship model** | Controlled vocabulary: 13 types (RELATED_TO, PREREQUISITE_OF, BUILDS_ON, IMPLEMENTS, USED_WITH, DEPENDS_ON, SECURES, AUTHENTICATES, AUTHORIZES, DEPLOYS, RUNS_ON, ALTERNATIVE_TO, SIMILAR_TO) | `relationship_type` is free-text VARCHAR(30), no enum/CHECK, no seeded vocabulary | **Gap** |
| **Learning paths** | `learning_paths`, `learning_path_stages`, `learning_path_skills`, `learning_path_content` | Not present at all | **Missing (P2/P3 per spec's own phasing — expected)** |
| **Recommendation** | Explicit layered scoring: prerequisite (Very High) > topic relationship/shared topics/shared skills (High) > shared technologies (Medium-High) > same category (Medium) > freshness/popularity (Low-Medium) | Client-side same-category array filter only | **Gap — current impl uses the spec's explicitly-deprioritized signal as the *only* signal** |
| **Governance** | Canonical topic resolution workflow (extract → normalize → alias/exact match → semantic similarity → reuse or propose → governance gate → create); merge/rename/deprecate/redirect; audit trail | Exact-slug-match idempotency only — no alias matching, no semantic similarity, no merge/deprecate/redirect, no governance gate | **Gap** |
| **Provenance** | `content_sources`, `content_generation_runs`, `content_reviews` (with `review_type`, `result`) | `content_reviews` exists (human-approval-only) — no `content_sources`/`content_generation_runs`; AI provenance stuffed into a markdown comment block | **Gap** |
| **URL/SEO model** | Canonical content URL stable independent of category; `taxonomy_redirects` table for renames | Likely slug-based already; no `taxonomy_redirects` | **Needs verification, likely partial gap** |
| **Domains-as-categories decision** | Spec explicitly flags as an open decision: whether Cybersecurity/AI remain Technology categories or become top-level domains | N/A — no domain layer to decide this against yet | **Blocked on missing domain layer** |

## Appendix B: Frontend File List for the Topics Slice (carried forward from deleted `TOPICS_KNOWLEDGE_GRAPH_ROADMAP.md`)

Concrete new frontend files needed once topic-tagging UI work begins (none exist yet — confirmed in §2.6):

1. `src/api/types.ts` — add `TopicDto`, `TopicRelationshipDto`, `ContentTopicDto` + request shapes.
2. `src/api/services/topicService.ts` — mirror `tagService.ts`.
3. `src/api/hooks/useTopics.ts` — mirror `useTags.ts` (queries + replace-all mutations, proper query-key invalidation).
4. `src/components/ui/TopicMultiSelect.tsx` — new multi-select combobox (chips + typeahead/checkbox list — do **not** generalize `CategoryTreeSelect.tsx`, which is single-select/tree-shaped and closes on select; this needs the tag-picker shape instead).
5. `src/pages/TopicManagementPage.tsx` (or a `TopicsTab.tsx` inside the existing Configuration page) — CRUD list/modal, mirroring `CategoriesTab.tsx`.
6. `src/components/configuration/TopicRelationshipEditor.tsx` — per-topic relationship add/remove table (a simple "From → Relationship Type → To" table for v1 — a full graph-visualization library is over-engineering given the small fixed relationship-type enum and the 300KB gzip budget in root `CLAUDE.md`).
7. Route/tab wiring in `App.tsx` (+ `ProtectedRoute requireAdmin` if topics are admin-managed).
8. Edits to `ArticleCreator.tsx`/`CourseCreator.tsx` (embed `TopicMultiSelect` next to the existing category picker) and `CourseViewPage.tsx`/`ArticleViewPage.tsx` (real topic-driven related content, replacing the category-filter placeholder in §2.6).

Backend replace-all semantics (`SetContentTopics`/`SetRelationships` — delete-then-insert in a transaction) require "stage full set locally, submit once" UX, not incremental per-edge API calls — both the content-editor topic picker and the admin relationship editor must load the full current set into local state and submit the complete array on save, mirroring the existing `useSetCategoryTags` pattern in `useTags.ts`.

## Appendix C: File Reference Index

| Area | Path |
|---|---|
| Article/Course entities | `gg-cms/backend/go-cms/internal/domain/entity/cms.go` |
| Category entity | `gg-cms/backend/go-cms/internal/domain/entity/category.go` |
| Topic/alias/relationship/content_topic entities | `gg-cms/backend/go-cms/internal/domain/entity/topic.go` |
| Topic migrations | `gg-cms/backend/go-cms/migrations/postgres/029_topics.sql`, `030_seed_topics.sql` |
| Topic service/repo/handler | `internal/application/topic/service.go`, `internal/infrastructure/persistence/postgres/topic_repository.go`, `internal/interfaces/http/handler/topic_handler.go` |
| Personalization (recommendation engine) | `internal/application/personalization/service.go`, `internal/interfaces/http/handler/personalization_handler.go` |
| User profile entity | `internal/domain/entity/user_profile.go` |
| Factory sync DTO + handler | `internal/interfaces/http/dto/factory_sync_dto.go`, `internal/interfaces/http/handler/factory_import_handler.go` |
| Human import DTO (has CategoryID today) | `internal/interfaces/http/dto/import_dto.go` |
| Virtual root category bootstrap | `internal/bootstrap/admin.go`, `migrations/postgres/020_virtual_category.sql` |
| Frontend: category tree UI | `frontend/react-ui/src/components/configuration/CategoriesTab.tsx` |
| Frontend: related-content placeholder | `frontend/react-ui/src/pages/CourseViewPage.tsx` |
| Frontend: category-scoped landing page | `frontend/react-ui/src/pages/TechnologyPage.tsx` |
| content-factory domain models | `content-factory/backend/models/domain.py` |
| content-factory sync payload schema | `content-factory/backend/schemas/sync_payload.py` |
| content-factory → gg-cms exporter | `content-factory/backend/exporters/ggcms_client.py` |
| content-factory architecture (authoritative) | `content-factory/docs/architecture/SLAD_AI_CONTENT_FACTORY.md`, `IMPLEMENTATION_SPECIFICATION.md`, `IMPLEMENTATION_STATUS.md` |
| content-factory architecture (⚠️ stack-inconsistent, flagged) | `content-factory/docs/architecture/AI_LEARNING_CONTENT_FACTORY_PROPOSITION.md` |
| Original taxonomy spec | `gocms/docs/GeekGully_Taxonomy_and_Knowledge_Architecture_Implementation_Specification.docx` |
| Prior planning docs (superseded, schema detail retained) | `gocms/docs/TAXONOMY_GAP_ANALYSIS.md`, `TOPICS_KNOWLEDGE_GRAPH_ROADMAP.md` |
| Governing architecture decision | `gocms/docs/TAXONOMY_ARCHITECTURE_DECISION.md` |
| Pre-existing platform blueprint (not yet reconciled) | `gocms/docs/GEEKGULLY-TAXONOMY-AND-PLATFORM-ARCHITECTURE.md` |
