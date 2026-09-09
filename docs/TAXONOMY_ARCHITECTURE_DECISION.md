# Taxonomy & Knowledge Graph: Architecture Decision (governing document)

Status: **ACCEPTED, 2026-09-08, revised 2026-09-09 after external review.** This document says *in what order*, *under what invariants*, *in which system*, and *toward what end state* gg-cms's taxonomy/knowledge-graph/recommendation work should be built — it is the one to attach to any future multi-agent implementation prompt. Reviewer-attribution and rejected suggestions are kept in the **Decision Log** (§13) rather than narrated inline, so the body below reads as the current decision, not a diff.

**Implementation-readiness gate — MET 2026-09-09.** Per the Definition of Implementation-Ready (§13.4): (1) `ContentResource` decision — ✅ closed (§2), (2) recommendation candidate-generator function signatures — ✅ named (§6.1–6.2), (3) end-to-end acceptance scenarios — ✅ drafted (§12). This document is now the single source of truth for the multi-agent implementation pass (§9) — confirm with the user before launching it (see "Next step" at the bottom).

---

## 1. Objective

Do not treat this as "build domains + multi-category + topics + recommendations" — that framing optimizes for feature completeness and gets the sequencing wrong. The actual objective:

> **Build a governed knowledge architecture that can safely become the semantic backbone of the autonomous AI content factory.**

"Governed" is load-bearing. An ungoverned knowledge graph that an AI factory writes to autonomously degrades quickly (duplicate topics, unresolved aliases, unlabeled relationship confidence) and is expensive to repair after the fact — every downstream recommendation, `content_topics` row, and relationship edge inherits the ambiguity. A miscategorized article, by contrast, is a one-row fix. **This asymmetry — irreversibility of pollution, not visible user impact — is the ordering criterion for everything in §5.**

`gg-cms` is not "a CMS with AI features bolted on." It must be the **system of record** for content, taxonomy, knowledge classification, topic relationships, provenance, editorial state, user learning context, recommendation decisions, and portal experience — built so future AI capabilities (search, tutor, Q&A, gap detection, quality analysis, editorial assistance) attach without redesigning the core content model:

```
Content + Knowledge Graph + User Context + AI Intelligence  =  AI-Native Learning Platform
```
not
```
Content + Chatbot  =  AI CMS
```

### Eight concepts that must stay architecturally independent

1. Navigation taxonomy (categories/domains)
2. Knowledge graph (topics/relationships)
3. Content metadata
4. Content provenance
5. User/learning context — already exists as `UserProfile`; extend, don't fork
6. Recommendation intelligence — already exists as `personalization.Service`; extend, don't fork
7. AI assistant/context — does not exist yet; architect the seam only (§8)
8. Editorial governance — already exists as `content_reviews` + `Category.RequiredApprovals`/reviewer-groups; extend, don't fork

**Hard rules (mechanically checkable in review):**
- Do not use category membership as a substitute for semantic knowledge. Categories are navigation/editorial classification. Topics are semantic/knowledge classification. Topic relationships represent conceptual relationships. Learning paths represent pedagogical progression. Recommendations are generated from these layers independently, then combined through an explicit ranking model. Concretely: OAuth, OIDC, PKI, GCP, Go, Kubernetes are topics, never categories "because it's easier."
- Do not put recommendation logic inside content or category services — it lives in `personalization` (or a successor package), consuming topic/category data through service interfaces, never their tables directly.
- Do not put AI-specific logic (provenance parsing, generation-run linkage, quality scoring) directly into `Article`/`Course` domain entities — attach via the `ContentResource` polymorphic pattern (§2), the same way `content_reviews`/`content_topics` already do.

---

## 2. `ContentResource` — the polymorphic content contract

The `content_id + content_type` composite-key pattern already exists (`content_reviews`, `content_topics`) and is correct. **Decision: document it as an explicit contract — the `ContentResource` convention — do not create a new `content_resources` table.** Supported now: `ARTICLE`, `COURSE`. Future: `QUIZ`, `EXERCISE`, `CHEAT_SHEET`, `FAQ`, `LEARNING_PATH`. All cross-cutting systems (`content_topics`, `content_categories`, `content_skills`, `content_sources`, `content_generation_runs`) operate on `(content_id, content_type)`.

Rationale: `content_reviews` and `content_topics` already use this pattern successfully; with only two content types in production, a new abstraction table adds migration complexity (moving existing Article/Course rows through a new join table) for zero present-day benefit. Revisit only if/when a 3rd+ content type is actually being added and the convention shows real strain.

---

## 3. System boundary

Two separate systems; this document governs only the second:

```
AI Content Creator (content-factory, Python/FastAPI)     gg-cms (Go backend + React frontend)
  Strategy → Opportunity → Research →                       Taxonomy, Topics/Knowledge Graph,
  Evidence Pack → Knowledge Pack → Writer/QA                Recommendations, Search, Learning UX
        │                                                          ▲
        └──────────── publishes via Content Import Contract ───────┘
```

The recommendation engine belongs entirely in gg-cms. The content factory has no user identity, session, or UI context — it cannot personalize anything. Its job is to produce content with good metadata and correct knowledge relationships; gg-cms's job is to decide what to show a specific user, on a specific page, at a specific time. This is not a new separation to build — `UserProfile` and `personalization.Service` are already gg-cms-only, domain-layer constructs; the factory's `SyncPayload` has no user-facing fields.

Confirmed against code: `internal/application/personalization/service.go:170` (`GetRecommendations`) is a real, already-wired candidate-then-score recommendation engine — but its only signals today are preferred-category match (+4), interested-tag-via-category match (+3), and an enrolled-course penalty (-10). Zero awareness of `topics`/`topic_relationships`. This is the proof the architecture is already in the right place; it just needs richer candidate sources, not a new home.

**Practical consequence:** the Recommendation Agent (§9) extends `personalization.Service` — new candidate-generator functions feeding its existing scoring/sort/limit shape — rather than a parallel `RelatedContentService`. `PersonalizationHandler`'s existing `GET /api/personalization/recommendations` contract stays stable.

---

## 4. Knowledge graph — target shape

Beyond what's already in `029_topics.sql`, the knowledge layer must eventually support topic hierarchy, aliases, canonical topic resolution, controlled relationship types, relationship confidence and provenance, content-topic roles, topic importance, and topic evolution (deprecate/merge/redirect). Concretely, add to the schema:

**`topics`** — add `status` (`ACTIVE` / `DEPRECATED` / `MERGED`) and `merged_into_topic_id` (nullable FK — without this, `MERGED` is unenforceable, nothing records the redirect target). Verified `topics` has no status column today (`topic.go` lines 5–13).

**`topic_aliases`** — the current unique index is `LOWER(alias)`; add `normalized_alias` (punctuation/whitespace-stripped, so "OAuth 2.0" and "OAuth2.0" collide) and its own `status` column. The simple lowercase case is already handled — this closes the gap for punctuation/whitespace variants specifically.

**Topic resolution workflow** — must return one of **`MATCH`** (exact or alias hit, safe to reuse automatically), **`SUGGESTION`** (high-confidence normalized or fuzzy candidate, requires editor/governance sign-off before creating or merging), or **`NEW`** (no plausible match, safe to create). Never auto-create or auto-merge purely on a fuzzy trigram score. Example: "OAuth2"/"OAuth 2"/"OAuth 2.0" can resolve via `MATCH` or a high-confidence `SUGGESTION`; "Go"/"Go programming"/"GoLang" needs careful `SUGGESTION`-tier review; "Java"/"JavaScript" must never merge. Confirmed: zero resolution logic exists in the repo today (`topic_repository.go`/`topic/service.go` only expose CRUD).

**`topic_relationships`** — add `weight`, `confidence`, `source_type` (`SYSTEM` / `HUMAN` / `AI` / `IMPORT`), `source_reference`, `status`, `created_by`, `created_at`, `updated_at`. This is what distinguishes "an editor asserted this" from "AI inferred this at 0.73 confidence" — a fundamentally different trust level, elevated here to an explicit P0 schema item (not a side-note). `relationship_type` itself stays a controlled VARCHAR enum, seeded from the spec's 13 types (RELATED_TO, PREREQUISITE_OF, BUILDS_ON, IMPLEMENTS, USED_WITH, DEPENDS_ON, SECURES, AUTHENTICATES, AUTHORIZES, DEPLOYS, RUNS_ON, ALTERNATIVE_TO, SIMILAR_TO) — not a separate lookup table with inverse-type auto-traversal (see §13.2 for why).

**`content_topics`** — add `role` (`PRIMARY` / `SECONDARY` / `MENTIONED` / `PREREQUISITE`) and `weight` (0.0–1.0). Today it's a bare 3-column composite-PK join (`topic.go` lines 35–41) — every attached topic is structurally indistinguishable, so no ranking logic can tell "this article is fundamentally about OAuth 2.0" from "this article name-drops JWT in passing." Worked example — article "Securing a Go API with OAuth 2.0":

| Topic | Role | Weight |
|---|---|---|
| Go | PRIMARY | 0.85 |
| OAuth 2.0 | PRIMARY | 1.00 |
| API Security | SECONDARY | 0.75 |
| JWT | MENTIONED | 0.30 |
| GCP | MENTIONED | 0.20 |

`TopicRepository.FindAll` also needs cursor pagination + a `FindBySlugs(ctx, []string)` bulk lookup (mirroring `pkg/pagination`), for efficient AI auto-tagging. Add `FindReachable(ctx, topicID, maxDepth)` backed by a recursive CTE, established before any caller needs it, to prevent raw SQL creeping into handlers later.

---

## 5. Priority order

- **P0 — Protect the knowledge graph.** Everything in §4: aliases + staged resolution workflow, `parent_topic_id` hierarchy, relationship vocabulary + provenance metadata, `content_topics` role/weight.
- **P0 — Default category tree seed (not domains).** Seed the §7 category tree (Software Engineering, Cloud & Infrastructure, Cybersecurity, Data, AI & Machine Learning and their subcategories) as plain `categories` rows now, the same idempotent-SQL way `030_seed_topics.sql` already seeds topics (`INSERT ... ON CONFLICT (slug) DO NOTHING`). This is safe in P0 because it needs no `domains` table or `domain_id` column — those stay P1 per the row below. **Do not seed a `domains` table in P0** — a proposal to do so was considered and rejected: `domains` doesn't exist until P1, and creating it early would reopen the already-decided sequencing (irreversibility-of-pollution ordering, §1) without new justification. No YAML manifest, versioned bootstrap package, or `taxonomy_source`/`is_system_default` metadata columns are introduced for this — see the rejection recorded in §13.7.
- **P0 — Provenance.** Ship now: `content_generation_runs` with `model`/`provider`/`prompt_version`/`quality_report` — this matches the factory's existing `FactoryProvenanceSpecs` field-for-field (`Model`/`Provider`/`AgentVersion`/`KnowledgePackID`/`GeneratedAt`/`QualityScore`), so it's a re-plumbing, not new data collection. Defer: `content_sources`/`claims`/`claim_sources` — the factory payload today is one flat struct, not an array of sources/claims, so the full four-table chain would be more schema than the producer actually populates. Full target chain (for later): `Content → Generation Run → Model → Prompt Version → Sources → Claims → Topics → Quality Review → Publication`. The markdown-comment-blob approach in `factory_import_handler.go` is explicitly disqualified as an interim store, not merely a known gap. The broader concept is **content provenance**, not AI-only — the eventual `origin` value set should include `AI_GENERATED` / `HUMAN_AUTHORED` / `HUMAN_EDITED` / `AI_ASSISTED` / `IMPORTED` / `MIGRATED` / `CURATED`.
- **Integration checkpoint.** One explicit review/integration gate here, after P0 completes and before P1 begins — since P1 recommendation work directly consumes the P0 schema, this is the one seam where an AI-agent contract mismatch would be expensive to discover late. Not a gate after every phase (see §13.2).
- **P1 — Navigation architecture.** `domains` table (seeded now, per the §7 tree — `domain_id` backfilled onto the categories already seeded in P0 above, not a re-taxonomization), `categories.domain_id`, `content_categories` many-to-many — deliberately *after* the graph is hardened. `Category.ParentID` stays an unconstrained self-referencing FK — depth (≤2 levels, per §7) is editorial/UI policy, never a DB constraint; verified no depth CHECK exists today and none should be added. Migration staged, not an immediate cutover: **(A)** `CategoryID` and `content_categories` coexist, both populated on write; **(B)** new code paths read/write `content_categories`, `CategoryID` kept in sync; **(C)** `CategoryID` read-only/deprecated once all read paths — especially `RequiredApprovals` resolution (`service.go` ~lines 528–530/588–591, which reads it directly today) — have migrated; **(D)** drop `CategoryID`. **Every consumer must be checked before stage (D):** Articles, Courses, publication/review workflows, `RequiredApprovals` resolution, public APIs, Admin UI, reader UI, search/filtering, recommendation candidate generators, background jobs, and tests — not just the obvious read paths. **Approval-policy decision, locked now:** primary category alone determines `RequiredApprovals`; secondary categories affect discovery/navigation only and never add or independently trigger review requirements. Resolve before `content_categories` implementation begins.
- **P1 — Recommendation foundation.** Candidate generation — `GenerateTopicCandidates` (shared topics), `GenerateRelationshipCandidates` (relationship traversal — PREREQUISITE_OF, SIMILAR_TO, and other relationship types; mode-dependent filtering, see §6.2), `GenerateCategoryCandidates` (category signal) — plus a separate ranking stage. Basic personalization (interest/history-based score adjustment, `recommended` mode) ships in P1 as a ranking signal on top of these three generators (see §6.2 invariant 3); deeper personalization (topic affinity modeling, richer history weighting) is P3, per the row below. See §6 for the full contract.
- **P1 — Frontend.** Its own explicit stream, sequenced after the backend contracts it depends on, shipped incrementally across three sub-streams (not one sprint): **Admin** (Domains, Categories, Topics, Topic Aliases, Topic Relationships under an `Admin → Taxonomy` nav group — category tree/list view with domain/active/system-vs-custom filters; a topic detail screen showing canonical slug, status, aliases, related topics, relationships, and content count), **Content Editor** (primary + secondary category pickers, primary/secondary/mentioned topic pickers as autocomplete chips — never uncontrolled free text — with a "Did you mean OAuth 2.0?" alias-resolution prompt on typed input that doesn't exact-match, and a "+ Create new topic" path that routes through the §4 canonical-resolution workflow, not a bare insert), **Reader** (domain-driven main navigation exposing categories on selection, not individual topics — topics are too numerous/dynamic for primary nav — plus Topics/Prerequisites/Builds On/Related/Recommended Next on content pages). See `GG_CMS_AI_NATIVE_PLATFORM_CONSOLIDATED_REVIEW.md` Appendix B for the concrete file list.
- **P2 — Autonomous factory integration.** Strategy → Opportunity → Research → Knowledge Pack → Content Jobs → existing content-factory → Quality → CMS ingest. **Factory classification ownership, decided:** the factory is never the authority for canonical topics or categories — it only *proposes* free-text candidates (e.g. `{"topics": ["oauth2", "oidc", "jwt"]}`); gg-cms resolves every proposal through the P0 alias/governance workflow (§4) before it becomes a `content_topics` row. This is what prevents "factory's topic registry" and "gg-cms's topic registry" from becoming two permanently diverging concepts of "topic" — confirmed today, `Opportunity.canonical_topic` in the factory's `models/domain.py` is exactly such an unreconciled free-text field.

  ```
  Content Factory ─▶ proposed content + proposed topics/categories + provenance ─▶ GG-CMS Import ─▶ Canonical Resolution (§4 MATCH/SUGGESTION/NEW) ─┬─▶ Content Store
                                                                                                                                                      └─▶ Knowledge Graph
  ```
- **P3.** Learning paths, skills, personalization depth.
- **P4/P5.** Embeddings, semantic retrieval, vector search, advanced/ML personalization — per the spec's own phasing, not before.

---

## 6. Recommendation architecture

Independent candidate generators feed a candidate set; a **separate** ranking stage scores using deterministic + personalization signals — never one monolithic `RelatedContentService` that hard-codes the combination logic:

```
Content A ─▶ [Topic Graph Traversal, Shared Topics, Category Signal, Prerequisite Traversal] ─▶ Candidate Set ─▶ Ranking Engine ─▶ [deterministic signals, personalization signals] ─▶ Recommendations
```

**Implementation shape: plain functions with shared struct types, not formal interfaces.** `personalization/service.go`'s `GetRecommendations` (lines 170–241) is ~70 lines, `scoreItem` is a single pure function (lines 243–265), handling exactly two content types with three signals today. Candidate generators and the ranker are plain Go functions sharing a common request/return type — not a formal `CandidateGenerator`/`RankingSignal`/`RecommendationRanker` interface hierarchy — root `gg-cms/CLAUDE.md` explicitly prohibits new abstractions for one-off operations, and there is no genuinely pluggable, runtime-swappable implementation yet to justify interfaces (see §13.2 for the same reasoning applied to `topic_relationship_types`).

### 6.1 Contract types

```go
type RecommendationRequest struct {
    ContentID    uint            // the content the user is currently viewing (0 for user-home/anonymous contexts)
    ContentType  string          // ContentResource type, e.g. "ARTICLE" | "COURSE"
    UserID       *uint           // nil for anonymous
    Mode         RecommendationMode
    Limit        int
}

type RecommendationMode string
const (
    ModeRelated     RecommendationMode = "related"
    ModeRecommended RecommendationMode = "recommended"
    ModeNext        RecommendationMode = "next"
)

type CandidateSignal struct {
    SignalType  string  // e.g. "TOPIC_MATCH" | "RELATIONSHIP_MATCH" | "PREREQUISITE_MATCH" | "CATEGORY_MATCH"
    SignalValue float64 // raw, generator-local strength (0.0-1.0) — not yet weighted or combined
}

type RecommendationCandidate struct {
    ContentID   uint
    ContentType string
    Signals     []CandidateSignal // one entry per generator that produced this candidate — see dedup invariant below
}
```

Each generator emits one `RecommendationCandidate` per hit, with exactly one entry in `Signals` (its own). This is the type both individual generator output *and* the post-dedup merged form use — a candidate found by only one generator has `len(Signals) == 1`; the deduplication invariant below merges same-`(ContentID, ContentType)` candidates by concatenating their `Signals` slices, so a candidate found by three generators ends up with `len(Signals) == 3` and `RankCandidates` scores using all of them. No separate "merged candidate" type is needed — merging is a slice-append, not a type change.

```go
type RecommendationScore struct {
    Candidate RecommendationCandidate
    Score     float64          // final combined score after ranking
    Reason    RecommendationExplanation
}

type RecommendationExplanation struct {
    Code    string // public reason_code, e.g. "PREREQUISITE" | "RELATED_TOPIC" | "SAME_CATEGORY"
    Message string // public human-readable reason
    // internal-only signal breakdown (never serialized on the public response — see §6.3) is attached
    // out-of-band (logged / admin-debug-endpoint) rather than carried on this struct's JSON tags.
}

type RecommendationResponse struct {
    ContentID       uint
    Recommendations []RecommendationScore
}
```

### 6.2 Candidate generation and ranking functions

Each candidate generator takes the request and returns candidates from one independent signal source; `RankCandidates` combines them. Every generator shares the same signature shape so adding a new one is additive. **P1 ships three generators; a fourth (`GeneratePrerequisiteCandidates`) is deliberately deferred to P3** — see the note below the function list.

```go
func GenerateTopicCandidates(ctx, req RecommendationRequest) ([]RecommendationCandidate, error)
// shared-topic overlap: candidates that share a content_topics entry with req.ContentID, weighted by content_topics.role/weight (§4)

func GenerateRelationshipCandidates(ctx, req RecommendationRequest) ([]RecommendationCandidate, error)
// One-hop traversal of relationship_type edges out from req.ContentID's topics, ranked using the §4
// weight/confidence columns. Which edge types are considered is mode-dependent (req.Mode): for `related`,
// all relationship types contribute; for `next`, this generator filters to PREREQUISITE_OF/BUILDS_ON edges
// only (see §6.3) — this is what satisfies acceptance scenario 3 (§12) in P1, since PREREQUISITE_OF is one
// relationship type this generator already traverses, not a separate mechanism.
// This generator is content-centric, not user-centric — it has no notion of what the user has or hasn't learned.

func GenerateCategoryCandidates(ctx, req RecommendationRequest) ([]RecommendationCandidate, error)
// same-category fallback signal — today's only signal (personalization/service.go scoreItem), demoted to one
// input among several rather than the sole signal

func RankCandidates(ctx, candidates []RecommendationCandidate, req RecommendationRequest) ([]RecommendationScore, error)
// see the four ranking invariants below (deduplication, exclusion, personalization-as-signal, deterministic ordering)

func GetRecommendations(ctx, req RecommendationRequest) (RecommendationResponse, error)
// orchestrates: call the generator set → RankCandidates → truncate to req.Limit → return
```

**`GeneratePrerequisiteCandidates` is deferred to P3 — but its scope is narrower than "PREREQUISITE_OF traversal," which already ships in P1 via `GenerateRelationshipCandidates` above.** Correction from an earlier draft of this section: P0 already builds `weight`/`confidence`/`source_type` on `topic_relationships` (§4) specifically so edges including PREREQUISITE_OF can be trusted and ranked in P1 — there is no reason to withhold basic prerequisite-edge traversal until P3, and §12 acceptance scenario 3 requires it to work in P1. What genuinely needs P3 is *learning-state-aware* sequencing: "what should I learn next, given what I personally have and haven't completed" requires knowing the user's completion history against the prerequisite graph, which needs the learning-path/skill model (P3) — not just the existence of PREREQUISITE_OF edges, which P0/P1 already provide. Until P3, `next` mode answers "what's the logical next step from this content" (content-centric, via `GenerateRelationshipCandidates`) but not "what's next specifically for this learner" (user-state-centric, the P3 addition). When P3 lands, `GeneratePrerequisiteCandidates` follows the same signature shape as the three above, adding the user-completion filter that `GenerateRelationshipCandidates` cannot apply on its own.

**Two other signal sources are not named at all yet, by design.** A freshness generator is explicitly on the §8 "deferred, do not build" list, and no learning-progression generator beyond the prerequisite one above exists until P3's `UserProfile` history fields exist. Follow the same signature shape when those phases land — do not stub them out now with nothing to generate from.

### Ranking invariants (apply inside `RankCandidates`)

1. **Deduplicate by `(ContentID, ContentType)` before scoring, concatenating `Signals`.** The same content can enter the candidate set from multiple generators (e.g. a topic-relationship match *and* a same-category match for the same article) — these must collapse into one `RecommendationCandidate` whose `Signals` slice holds every contributing generator's `CandidateSignal`, not be treated as separate recommendations. Concretely: group the raw generator output by `(ContentID, ContentType)`, concatenate each group's `Signals` slices into one candidate, then score. See §6.1 for why this needs no separate "merged" type.
2. **Exclude:** unpublished/rejected content, the content the request is currently viewing (never recommend a piece of content to itself), content the requesting user is not authorized to see, and — specifically for `next` mode — content already completed by the user, once completion tracking exists.
3. **Personalization is a ranking signal, not a candidate generator.** `UserProfile` data (interests, history) adjusts the *score* a candidate receives in `RankCandidates` when `req.UserID != nil` — it does not itself produce new candidates that wouldn't otherwise exist. (A personalized *candidate source*, e.g. "people who read X also read Y," could exist later as a P3+ generator — but that is distinct from personalization-as-scoring-adjustment, which is what powers `recommended` mode today.)
4. **Deterministic ordering.** When final scores tie, break ties by a fixed, documented order — e.g. `score DESC, freshness DESC, content_id ASC` — so recommendation ordering never varies between otherwise-identical requests.

### 6.3 Related / Recommended / Next

| Mode | Question answered | Primary generators used |
|---|---|---|
| `related` | What is connected to this? | `GenerateTopicCandidates` + `GenerateRelationshipCandidates` + `GenerateCategoryCandidates` — works for anonymous readers (no `req.UserID` needed) |
| `recommended` | What should I consume? | All of `related`'s generators, with personalization applied as a **ranking signal** in `RankCandidates` when `req.UserID != nil` (invariant 3 above) — requires a profile |
| `next` | What should I learn next? | P1: `GenerateRelationshipCandidates` filtered/prioritized to PREREQUISITE_OF/BUILDS_ON edges, `GenerateTopicCandidates` as fallback when no such edge exists — content-centric ("what's next from here," §6.2), works for anonymous readers. P3 adds `GeneratePrerequisiteCandidates`, which additionally filters by the user's completion history — learner-centric ("what's next for *you*"), requires a profile |

Exposed as **one endpoint with a mode parameter** — `GET /api/personalization/recommendations?mode=related|recommended|next` reusing the existing `PersonalizationHandler.GetRecommendations` handler — not three separate routes, matching the "no new endpoints as ranking evolves" contract below and avoiding duplicated auth/pagination/error-handling plumbing.

### 6.4 Response contract (must not change as ranking evolves)

```json
{
  "content_id": 123,
  "recommendations": [
    { "content_id": 456, "reason_code": "PREREQUISITE", "reason": "Builds on OAuth 2.0 concepts", "score": 0.92 }
  ]
}
```

This is the wire form of `RecommendationResponse`/`RecommendationScore` above — the JSON's flat `content_id`/`reason_code`/`reason`/`score` per entry is produced by flattening `RecommendationScore.Candidate.ContentID` and `.Reason.Code`/`.Reason.Message` at the JSON-marshaling boundary (a custom `MarshalJSON` or a small DTO-mapping step in the handler) rather than mirroring the nested Go struct shape directly — the internal struct nesting (§6.1) and the public wire shape are intentionally different, only the wire shape is the frozen contract. `reason_code`/`reason` are new public fields on `personalization.RecommendedItem` (today only a numeric `Score` exists). **Two-tier explanation:** this public shape is the only thing serialized to clients. Internal per-signal score breakdowns (e.g. `{type: "TOPIC_RELATIONSHIP", value: 0.95}`, held on each `RecommendationCandidate.Signals[i].SignalType`/`.SignalValue` before `RankCandidates` collapses the whole slice into one score) are a server-side/debug-only concern — logged or admin-endpoint-gated — never on the public JSON. Future ranking extensions — semantic retrieval, embeddings, ML ranking, collaborative signals, LLM-assisted ranking — plug into the existing candidate/ranking pipeline as new scorers inside `RankCandidates` (or, where genuinely candidate-producing rather than score-adjusting, as new generator functions per §6.2), without ever changing this public response shape. This is the concrete path from deterministic scoring → weighted scoring → semantic ranking → ML ranking → LLM-assisted ranking without ever changing `RecommendationResponse`'s shape.

**Repository methods** — replace `FindAll()` scans (currently unpaginated, ≤200 articles + ≤200 courses per request, no cache — `service.go` lines 181/185) with purpose-specific queries: `FindRecommendationCandidates(...)`, `FindByTopicIDs(...)`, `FindByCategoryIDs(...)`, `FindByIDs(...)`. Cache tiering: aggressive shared cache (Redis) for anonymous/topic-based/category-based/popularity candidates (don't vary per-user); short-lived per-user-keyed cache for personalized results. This must ship concurrently with — not after — the topic-relationship traversal work, per root `CLAUDE.md`'s scalability targets (`singleflight.Group` for thundering-herd prevention).

### 6.5 Generality

Recommendations should eventually rank content, courses, quizzes, exercises, topics, learning paths, and skills — not just articles/courses. `RecommendationCandidate.ContentType` already keys on the `ContentResource` polymorphic type (§2), not on `Article`/`Course` structs, so adding e.g. Quiz recommendations later is a new candidate generator function, not a rewrite of the contract types above.

---

## 7. Category structure — covering cross-domain content

The instinct to fix cross-domain discovery in the category tree is a trap: categories must not carry semantic/cross-domain meaning — that's what topics and `topic_relationships` are for. The category tree is optimized purely for browsability (shallow, stable, low-churn); cross-domain coverage comes from topics + (later) multi-category assignment, not category-tree cleverness.

Confirmed against schema: `categories` today (`001_initial.sql`) is a single self-nesting tree with only `parent_id`, no domain grouping; the only migration-seeded category is the virtual `geek` root (`020_virtual_category.sql`) — "Cybersecurity" etc. exist today only as a **tag** (`015_seed_tags.sql`), not a category. The real domain-spanning content already lives in the P0 topic seed (`030_seed_topics.sql`): Identity, PKI, Cloud, Containers, IaC, Data, Security, AI. There is no existing category tree to migrate — this is a from-scratch design.

**Design principle:** a category answers "where do I browse to find this?" — one primary home, editorial guidance of ≤2 levels deep (never a schema constraint — see §5), changes slowly.

**Proposed 2-level seed tree** (built on today's schema, no `domains` table needed yet), aligned with the shipped topic seed data so each branch becomes a trivial `domain_id` backfill once P1's `domains` table ships:

```
geek (virtual root, unchanged)
├── Software Engineering
│   ├── Programming Languages       (topics: python, go, javascript, typescript)
│   ├── Backend & APIs              (topics: rest, graphql, grpc, microservices, message-queues)
│   └── Software Design             (topics: object-oriented-programming, concurrency)
├── Cloud & Infrastructure
│   ├── Cloud Platforms             (topics: aws, azure, gcp)
│   ├── Containers & Orchestration  (topics: docker, kubernetes)
│   └── Infrastructure as Code      (topics: terraform, ansible)
├── Cybersecurity
│   ├── Identity & Access           (topics: oauth-2, openid-connect, jwt, saml)
│   ├── PKI & Cryptography          (topics: tls, x509-certificates, public-key-infrastructure)
│   └── AppSec & Threats            (topics: owasp-top-10, threat-modeling, penetration-testing, zero-trust-architecture)
├── Data
│   ├── Databases                   (topics: sql, postgresql, mongodb)
│   └── Data Engineering            (topics: data-modeling)
└── AI & Machine Learning
    ├── Machine Learning Foundations (topics: machine-learning)
    └── Generative AI                (topics: large-language-models, retrieval-augmented-generation, prompt-engineering)
```

A starting seed, not a locked taxonomy — idempotent `INSERT ... ON CONFLICT (slug) DO NOTHING`, editable afterward via existing category CRUD.

**How cross-domain content is actually covered** — e.g. "Securing a GCP-hosted Go microservice with OAuth 2.0" (Cybersecurity + Cloud + Software Engineering at once) is **not** solved by a "Cross-Domain" category or deep-nesting under all three trees. Three mechanisms working together: (1) one primary category for the browse home (breadcrumbs/URL/primary path) — here, Cybersecurity → Identity & Access; (2) multiple topics (already shipped) — tag with `oauth-2`, `gcp`, `go`, `microservices` regardless of category, already making it discoverable from three domains simultaneously, today; (3) secondary categories (P1, `content_categories`) — additive polish once built, not a substitute for (2).

**Litmus test:** wanting to add a category node so content "shows up in the right places" is a signal the content needs a topic tag (or later, a secondary category), not a new tree branch.

**What not to do:** no category-per-topic (duplicates the topic registry in the wrong layer); no catch-all "Cross-Domain"/"General" category (becomes a dumping ground); no more than 2 levels deep in the seed tree.

---

## 8. AI Context — architect the seam now, do not build the assistant

"AI context" is a stub interface decision now, not an implementation: a **stateless, read-only aggregator** in the application layer composing existing services (topic service, recommendation service, user-profile/personalization service) — never a new domain entity with its own persisted representation of knowledge or user state. Illustrative (non-binding) sketch: `getContentContext(contentID)`, `getTopicContext(topicID)`, `getUserContext(userID)`, `getLearningContext(userID, contentID)`. This is what makes "the AI assistant consumes the same knowledge/recommendation services used by the portal, not an independent representation" hold true later — if this shape isn't pinned now, a future assistant implementation will be tempted to query tables directly and drift out of sync.

**Explicitly deferred — do not build now, must not be architecturally precluded:** AI search, conversational search, AI tutor, personalized learning guidance, automatic summarization, content Q&A, topic exploration UI, recommendation-explanation UI beyond `reason_code`/`reason`, freshness/knowledge-gap/quality/duplicate detection, automatic metadata enrichment, AI-assisted editorial workflows. No new "Content Intelligence" service boundary at this stage — see §13.2 for why.

**Taxonomy-specific non-goals for the default-taxonomy phase (P0/P1):** a category per topic, automatic category explosion, AI-owned canonical taxonomy, runtime LLM-driven navigation, autonomous topic merging (fuzzy matches always land as `SUGGESTION`, never auto-merged — §4), automatic fuzzy topic creation, full claim/source provenance chain (deferred per §5's ship-now/defer split), a full AI assistant, and a learning-path engine. Vector search/embeddings/ML ranking are already covered by the P4/P5 phasing (§5).

---

## 9. Multi-agent assignment for the implementation pass

| Agent | Responsibility | Sequencing |
|---|---|---|
| Architect | Inspect repo + existing contracts (topic entity/repo/service, `ContentResource` convention, factory sync payload) | First |
| Knowledge Graph Agent | Topics, aliases, relationships, hierarchy | Parallel, P0 |
| Provenance Agent | `content_generation_runs`, `content_sources` | Parallel, P0 |
| Content Classification Agent | content↔topics wiring | Parallel, P0 |
| Taxonomy Agent (P0 slice) | Seed the §7 category tree via idempotent SQL — no `domains` table, no YAML manifest (§13.7) | Parallel, P0 |
| Test Agent | Contract/E2E tests (including §12 acceptance scenarios) | Parallel throughout |
| **— Integration checkpoint: P0 review/merge gate — recommendation and navigation agents below do not start until this passes —** | | |
| Taxonomy Agent (P1 slice) | `domains` table + `domain_id` backfill, `categories.domain_id`, `content_categories`, staged `CategoryID` migration (§5), idempotent installation, upgrade-safe re-runs that never overwrite admin edits, unit/integration tests, expose via canonical CMS APIs, coordinate the `CategoryID`→`content_categories` cutover with the CMS Agent | Parallel, P1, after P0 checkpoint |
| Recommendation Agent | Candidate generation + ranking engine | Parallel, P1, after P0 checkpoint |
| CMS Agent | Publication lifecycle touchpoints, `RequiredApprovals` migration | Parallel, P1, after P0 checkpoint |
| Frontend Agent(s) | Admin / Content Editor / Reader streams (§5) | After the backend contracts each stream depends on |
| Factory Integration Agent | Knowledge Pack → Content Jobs, topic resolution on ingest | P2, after Knowledge Graph + Provenance |
| Scheduler Agent | Autonomous execution | After Factory Integration |
| Review Agent | Architecture/security/regression review | Final |

**Key invariant:** Taxonomy Agent and Knowledge Graph Agent are independent workstreams with no shared schema coupling beyond the `ContentResource` contract — the enforcement mechanism for "Category answers where; Topic answers what." A category ID doubling as a topic-relationship input is a design defect to flag in Review, not a valid shortcut.

---

## 10. Comparison lens — GeeksforGeeks / Substack / LeetCode / Educative

Informational only — these are precedents that validate specific design choices above, not independent architectural justification on their own.

| Platform trait | Relevant to this proposal |
|---|---|
| GeeksforGeeks-style topic tagging across DSA/System Design/Language tracks | Maps to `content_topics` + cross-category topic discovery (§7) — GFG's own site struggles with exactly the "one category, many relevant tags" tension the litmus test in §7 addresses. |
| Substack-style single-author, single-primary-category publishing | Matches gg-cms's current single-`CategoryID` model closely — validates that P1 multi-category is additive polish, not a blocker to shipping value now via topics alone. |
| LeetCode-style "prerequisite" and "similar problems" surfacing | Maps to PREREQUISITE_OF/BUILDS_ON relationship types and the Related/Recommended/Next split (§6) — the concrete UX precedent for why those three stay distinct. |
| Educative-style structured learning paths with skill progression | Maps to the P3 learning-paths/skills phase — correctly deferred behind knowledge-graph hardening, since Educative's path model depends on a trustworthy prerequisite graph. |

---

## 11. Open items requiring product/reviewer sign-off

1. **Reviewer-gating for topic assignment** — should topic assignment be reviewer-gated like category, or free-form like tags? Currently wired as free-form/non-admin.
2. **Stack discrepancy in content-factory docs** — `AI_LEARNING_CONTENT_FACTORY_PROPOSITION.md` describes a Go/Gemini-Batch stack contradicting the actual Python/FastAPI/LangGraph stack confirmed elsewhere. Confirm Python is authoritative before any factory-integration work references it.
3. **Pre-existing platform blueprint reconciliation** — `GEEKGULLY-TAXONOMY-AND-PLATFORM-ARCHITECTURE.md` (archived to `docs/archive/` with a superseded-notice header) has not been reconciled against this document.
4. **Factory-side auto-topic-assignment** — in scope now, or should factory-generated content stay manually tagged for the foreseeable future? Gates whether P2 (Factory integration) is scheduled soon or deferred.
5. ~~**Recommendation candidate-generator function signatures**~~ — **CLOSED** — see §6.1–6.2.

---

## 12. End-to-end acceptance scenarios (Definition of Done — not unit tests alone)

An implementation must not be reported as "done" based on unit test coverage alone. These scenarios gate P0/P1 completion:

1. **Cross-domain content.** An article "Secure Go microservice on GCP with OAuth 2.0," primary category Cybersecurity/Identity, tagged with topics Go/GCP/Microservices/OAuth 2.0/OIDC/PKI — verify all topics are searchable and the content is recommendable via each of them independently.
2. **Topic canonicalization.** Input "OAuth2", "OAuth 2", "OAuth 2.0" — verify they resolve to one canonical topic where policy allows (per the `MATCH`/`SUGGESTION`/`NEW` staged resolver in §4), and that "Java"/"JavaScript" never merge.
3. **Relationship recommendation.** Given `OAuth 2.0 --PREREQUISITE_OF--> OIDC`, verify OIDC ranks above an arbitrary same-category article with no topic relationship.
4. **Personalized recommendation.** A user profile with interests in Go/Cloud and a completed-OAuth history produces different ranking than category-only scoring would.
5. **Provenance (scoped to what P0 actually ships).** For any AI-generated article, `content → generation_run → model/provider/prompt_version/quality_report` must be queryable. **Note:** this scenario currently stops at the generation-run level, matching the ship-now/defer split in §5 — it does **not** yet require a queryable claim→source chain, since that's explicitly deferred until the factory payload carries per-claim data. Revise this scenario once `content_sources`/`claims` ship.
6. **Explainability.** The recommendation API can answer "why was this recommended?" via `reason_code`/`reason` on any returned item.
7. **Backward compatibility.** Existing `Article.CategoryID`-based imports and UI continue working throughout the staged `content_categories` migration (§5) — verify at each of the four migration stages, not just at the end.

---

## 13. Decision log — external review response (2026-09-09)

A senior-architect reviewer produced 25 numbered points of feedback on an earlier revision of this document (and the companion `GG_CMS_AI_NATIVE_PLATFORM_CONSOLIDATED_REVIEW.md`). A 5-agent panel independently assessed each point against the actual code before the document was amended into its current form (§1–§12 above already reflect the outcome). This section is the compact record of that process — what was accepted, what was rejected and why, and what's still open.

### 13.1 Accepted and folded into §1–§12
`#3` ContentResource decision (§2) · `#4` topic status/merge lifecycle (§4) · `#5` staged alias resolver MATCH/SUGGESTION/NEW (§4) · `#6` relationship provenance columns (§4) · `#8` content_topics role/weight (§4) · `#9` provenance ship-now/defer split (§5) · `#10` content-provenance origin taxonomy (§5) · `#11` plain functions not formal interfaces (§6) · `#12` two-tier reason/signals (§6) · `#13` one endpoint with a mode param (§6) · `#14` cache method names + tiering (§6) · `#15` depth as editorial policy not DB constraint (§5, §7) · `#16` staged content_categories migration (§5) · `#17` primary-category-controls-approval decision (§5) · `#18` explicit frontend workstreams (§5) · `#19` AI Context method sketch (§8, non-binding) · `#22` one integration checkpoint after P0 (§5, §9) · `#23` acceptance scenarios (§12, with scenario 5 rescoped to match the #9 ship-now/defer split) · partial `#2` — Frontend pulled out as its own explicit row (§5), full 8-phase renumbering rejected (see 13.2).

### 13.2 Rejected — recorded, not silently dropped

| # | Reviewer's ask | Why rejected at this stage |
|---|---|---|
| **7** | A `topic_relationship_types` lookup table (code, inverse_type, directional, default_weight) with automatic inverse-relationship traversal | No caller anywhere in the codebase, or in this document's own recommendation design, ever traverses a relationship backward (e.g. "what depends on X"). A DB table only pays off once the vocabulary needs runtime editing by non-engineers — nothing proposes that. Per root `gg-cms/CLAUDE.md`'s "no new abstractions for one-off operations": keep `relationship_type` a controlled VARCHAR enum; if reverse traversal is ever needed, a Go-level `map[string]string` type→inverse lookup delivers the same value with zero migration risk. **Revisit if a concrete reverse-traversal feature is actually requested.** |
| **20 / 21** | A new "Content Intelligence" service boundary (classify topics, detect duplicates, identify skills/difficulty, assess freshness, detect knowledge gaps), placed prominently in the target architecture diagram | Duplicates work already assigned elsewhere: topic classification/duplicate-detection is the P0 topic-resolution workflow; freshness/knowledge-gap detection is already in the "explicitly deferred" list (§8); skill/difficulty are already populated by content-factory today for factory-sourced content. Diagramming an unbuilt boundary this early (topics still have zero frontend surface, recommendation still does unpaginated full scans) risks agents building toward the diagram box instead of the priority list — the exact failure mode the reviewer's own point #22 warns against. **Revisit once P0/P1 ship and a concrete need emerges to enrich non-factory-sourced content specifically.** |
| **2** (partial) | Renumber the priority list into an explicit 8-stage "Phase 0–7" taxonomy | The P0–P5 buckets in §5 already encode the same dependency order; running two parallel phase-numbering schemes is bookkeeping overhead with no corresponding risk reduction for this team size (~20.8K LOC Go backend, 158 files, effectively 1–2 contributors, pre-implementation). The genuinely useful piece — Frontend as its own explicit row — was kept (§5). |

### 13.3 Point #24 (reviewer's own section-edit table) — assessed here

The reviewer's point #24 proposed ~15 section-by-section edits to the (then-current) consolidated review document. Assessment: this table is now **superseded by the actual rewrite** — every substantive edit it named (ContentResource decision, candidate-generator interfaces, category-depth policy, primary/secondary category governance, AI Context/Content Intelligence, agent phase dependencies, comparison-lens framing, open-items additions, acceptance tests) has been applied directly to §1–§12 above, in most cases going further than the table's one-line description (e.g. with worked examples, staged migration steps, and code citations). No further action needed on #24 specifically.

### 13.4 Definition of Implementation-Ready

Expanded per a second review pass specifically on this document (2026-09-09) — the checklist below supersedes the three-item version from the first pass, folding the recommendation-contract completeness criteria that review added:

1. ✅ `ContentResource` decision closed (§2).
2. ✅ Recommendation contract finalized (§6), consisting of: `RecommendationRequest`/`RecommendationCandidate`/`CandidateSignal`/`RecommendationScore`/`RecommendationExplanation`/`RecommendationResponse` types (§6.1) · candidate-generator function signatures (§6.2) · `RankCandidates` signature (§6.2) · all four ranking invariants — deduplication (§6.2, invariant 1), exclusion rules (invariant 2), personalization-as-ranking-signal-not-generator (invariant 3), deterministic tie-breaking (invariant 4) · public response compatibility, including the internal-struct-to-wire-shape mapping (§6.4).
3. ✅ End-to-end acceptance scenarios written (§12).

**This document is implementation-ready.**

### 13.5 Status of prior planning docs

`TOPICS_KNOWLEDGE_GRAPH_ROADMAP.md` and `TAXONOMY_GAP_ANALYSIS.md` were deleted 2026-09-09 as superseded — their schema-comparison table and frontend file list are preserved verbatim in `GG_CMS_AI_NATIVE_PLATFORM_CONSOLIDATED_REVIEW.md` Appendices A and B. That consolidated document remains the fuller narrative built on top of this one — both are kept. `GEEKGULLY-TAXONOMY-AND-PLATFORM-ARCHITECTURE.md` was archived to `docs/archive/` with a superseded-notice header rather than deleted (§11 item 3).

### 13.6 Second review pass — recommendation contract completion (2026-09-09)

A second, narrower review focused specifically on this document (not the broader consolidated review) assessed §6 as the one remaining gap before implementation-readiness. Accepted and applied: the four ranking invariants (deduplication by `(ContentID, ContentType)`, exclusion rules, personalization-as-ranking-signal not generator, deterministic tie-breaking — all now in §6.2); deferring `GeneratePrerequisiteCandidates` to P3 rather than shipping it with the other three P1 generators, to avoid fabricating prerequisite logic before a trustworthy learning-path model exists; the corrected framing that future ranking extensions (semantic retrieval, embeddings, ML/LLM ranking, collaborative signals) plug in as scorers/generators, not as an undifferentiated list alongside personalization (§6.4). Not adopted: the reviewer's proposed bare positional-parameter generator signatures (`func GenerateX(ctx, contentID uint, contentType string, limit int)`) — kept as struct-based (`func GenerateX(ctx, req RecommendationRequest)`, §6.2) since a shared request struct absorbs future field additions (exclusion lists, user context) without changing every generator's signature each time, which is more idiomatic Go for this shape and doesn't reintroduce the interface-hierarchy overhead already rejected in §13.2. Confirmed as already-correct and unchanged by this pass: no formal `CandidateGenerator`/`RankingSignal` interfaces (§13.2), `ContentResource` as a documented convention not a table (§2). Two independent agent-review passes verified §6's final form (structural type gap, a checklist omission, and a genuine reasoning contradiction — all found and fixed, then re-verified clean).

### 13.7 "GeekGully System Default Taxonomy" spec — assessed and folded in (2026-09-09)

A separate implementation/UI specification proposing a default category tree, a versioned taxonomy bootstrap package, and UI mockups was reviewed against this document and the actual codebase. Outcome:

- **Adopted directly (no conflict):** the category tree it proposes is identical to §7's — already decided, nothing to change. Its recommendation-usage section matches §6.2's generators exactly. Its factory-taxonomy-resolution flow matches §5's factory-classification-ownership decision exactly. Its non-goals list is now in §8. Its category-migration consumer checklist (Articles, Courses, workflows, APIs, admin UI, reader UI, search, recommendation, jobs, tests) is now in §5's P1 navigation bullet. Its 12-item Taxonomy Agent responsibility list is now split across the P0/P1 Taxonomy Agent rows in §9. Its UI mockups (admin taxonomy nav, topic detail screen, content-editor autocomplete/alias-resolution UX, domain-driven reader nav) are now folded into §5's P1 Frontend bullet.
- **Rejected: seeding a `domains` table in P0.** The spec's own priority list put "default domains/categories/topics/aliases" under P0, but `domains` is a P1 concept (§5) — creating it early would reopen the already-decided, twice-reviewed sequencing (irreversibility-of-pollution ordering, §1) without new justification. Resolution: the flat category-tree seed (which needs no `domains` table) can and does move to P0 (§5); `domains` itself, `domain_id`, and the backfill stay P1.
- **Rejected: the YAML-manifest versioned bootstrap package** (`config/taxonomy/v1/*.yaml`, install/upgrade state machine, `taxonomy_source`/`taxonomy_version`/`is_system_default` metadata columns). This is new infrastructure with no current justification: `yaml.v3` is only an indirect Go dependency today (not imported anywhere in the codebase), every existing seed (`030_seed_topics.sql`) already uses plain idempotent SQL, and the proposal's own §7 admits the metadata needed to make "don't overwrite admin changes" actually safe (`taxonomy_source`, `is_system_default`) can be deferred — without that metadata, the manifest-versioning machinery has limited payoff over what `ON CONFLICT DO NOTHING` already provides for free. Per root `gg-cms/CLAUDE.md`'s no-premature-abstraction rule (the same reasoning that already rejected the `topic_relationship_types` lookup table in §13.2 and formal recommendation interfaces in §6): ship the default category/topic seed as idempotent SQL following the existing convention; revisit a versioned-manifest system only if/when a real upgrade-without-overwrite scenario actually occurs in production.

---

## Next step

This document is implementation-ready per §13.4. Confirm with the user before launching the actual multi-agent implementation (via the Workflow tool) — that confirmation, not another architecture-document revision, is the next artifact.
