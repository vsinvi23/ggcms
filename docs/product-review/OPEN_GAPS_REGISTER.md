# Open Gaps Register

Single list of every gap raised so far, with its source and status. Detailed write-ups live in the linked documents. Status is as of the `feat/platform-hardening-learning-loop-ai` branch; nothing here has been fixed unless marked **Done**.

Legend: **Open** = not started · **Planned** = plan exists, no code · **Pending verify** = fixed in code but not tested against a real DB or browser · **Done** = fixed and tested.

## 1. Inline editing (source: [INLINE_EDITING_REVIEW.md](INLINE_EDITING_REVIEW.md))

| ID | Sev | Gap | Status |
|---|---|---|---|
| DEF-01 | Critical | Unpublished draft body served to anonymous visitors when no published snapshot exists | Open |
| DEF-02 | Critical | Inline editor copies props once; saves can overwrite a pending revision with stale or empty text | Open |
| DEF-03 | Critical | Editor state persists across item navigation; saving writes the previous item's text | Open |
| DEF-04 | High | Public view stays stale after save (cache key mismatch `cms` vs `public-cms`) | Open |
| DEF-05 | High | "Live Published View" toggle changes the label only | Open |
| DEF-06 | High | Unapproved draft shown to non-author quick-edit users (policy question open) | Open, needs owner decision |
| DEF-07 | High | Revision author field never sent by backend; author banner never shows | Open |
| DEF-08 | High | UI allows inline edit for quick-edit group members; API returns 403 (policy question open) | Open, needs owner decision |
| DEF-09 | High | Block-format articles get HTML appended to JSON; public page shows raw JSON | Open |
| DEF-10 | Medium | Render sanitiser strips h5, h6, u, sup, sub, mark | Open |
| DEF-11 | Medium | Toolbar ignores cursor and inserts placeholder text | Open |
| DEF-12 | High | Editing REVIEW or APPROVED content does not return it to review | Open |
| DEF-13 | High | Empty body falls back to summary; saving writes summary into body | Open |
| DEF-14 | Medium | Concurrent saves are last-writer-wins (no version check) | Open |
| DEF-15 | Medium | Cancel and navigation discard edits without warning | Open |
| DEF-16 | Medium | Save and submit are not atomic | Open |
| DEF-17 | Low | Course save can report success without saving | Open |
| DEF-18 | Low | Backend returns 500 for every update error | Open |
| DEF-19 | Low | Status copy references a status that does not exist | Open |
| DEF-20 | Medium | No unit or e2e tests for inline editing (failing demo tests exist, untracked) | Open |
| DEF-21 | Low | Quick-edit copy and labels | Open |

## 2. Article and card UI (source: this session)

| ID | Sev | Gap | Location | Status |
|---|---|---|---|---|
| UI-01 | Medium | Blank 16:9 image box shown on articles with no thumbnail, or a broken one | `PublicArticleView.tsx` ~719–729 | Planned (see plan in chat; fix = conditional render + collapse on error + test) |
| UI-02 | Medium | Blank image tiles on cards that render images unconditionally | `ContentCard.tsx` 18, 35; `FeaturedContentCard.tsx` 42, 100 | Open |
| UI-03 | Medium | Video lessons show a play button with no video behind it | `CourseViewPage.tsx` ~1086–1091 | Open (depends on video plan) |
| UI-04 | Low | Dashboard "Saved Notes & Highlights: Active" is a static placeholder | `Dashboard.tsx` | Open |
| UI-05 | Low | Public pages use hardcoded fallback tags and levels (`'Go'`, `['Go','REST','Backend']`) | `CoursesPage.tsx`, `ExplorePage.tsx` | Open (needs backend fields) |
| UI-06 | Low | Settings fields (supportEmail etc.) are local state and never saved | Settings pages | Open |
| UI-07 | Low | Header name does not refresh after profile save until next session load | `AuthContext` | Open |
| UI-08 | Low | Language selector persists a code but the app has no translations | `UserSettings.tsx` | Open |
| UI-09 | Low | Unused `trackSearch` helper could reintroduce a duplicate search event | `useTrack`, `analytics` | Open |
| UI-10 | Medium | `CourseCategoryPage` still filters client-side and does not use the new search | `CourseCategoryPage.tsx` | Open |

## 3. Learner features and data (source: agent reports this session)

| ID | Sev | Gap | Status |
|---|---|---|---|
| LRN-01 | High | Interview-prep answers stored only on this device; needs `/api/interview-attempts` | Open |
| LRN-02 | Medium | Learning groups stored only on this device; needs `/api/learning-groups` | Open |
| LRN-03 | Medium | Last-opened lesson not recorded unless a lesson is completed | Open |
| LRN-04 | Medium | Course and article read badges on cards still read local state, not enrollment data | Open |
| LRN-05 | Medium | Public accepted-summary (TL;DR) endpoint missing; readers cannot see TL;DR | Open |
| LRN-06 | Low | Tutor citation URLs use `/articles` and `/courses`; the SPA routes are `/article` and `/course` (client rewrites them) | Open (backend fix) |
| LRN-07 | Low | AI daily-quota endpoint missing; limit shown only after it is hit | Open |
| LRN-08 | Low | Tags cannot be applied from AI suggestions (no per-content tags endpoint) | Open |
| LRN-09 | Low | Notification delete endpoint missing | Open |
| LRN-10 | Low | Self-service profile update and user counts by status endpoints incomplete | Open |
| LRN-11 | Low | Interview and learning-path pages do not record server-side progress | Open |

## 4. Backend and infrastructure (source: agent reports this session)

| ID | Sev | Gap | Status |
|---|---|---|---|
| BE-01 | Critical | Migrations 002–006 and raw SQL never run against a real Postgres | Pending verify |
| BE-02 | High | Mongo analytics aggregations and index changes not run against real Mongo | Pending verify |
| BE-03 | High | `.env.example` was truncated by a script and rebuilt from HEAD; diff against your copy | Pending verify |
| BE-04 | High | Login lockout is per instance and resets on restart (no shared store, Redis not present) | Open |
| BE-05 | High | Rate limiter is in-memory per instance; needs shared or edge limiting | Open |
| BE-06 | Medium | Search-vector columns sent with every article and lesson read (roughly doubles payloads) | Open |
| BE-07 | Medium | Group `Delete` and renaming the admin group are not guarded by the last-admin check | Open |
| BE-08 | Medium | Password-reset confirm audited without user id | Open |
| BE-09 | Medium | Tutor index updates only on the 5-minute tick or manual reindex, not on publish | Open |
| BE-10 | Medium | Tutor retrieval does not use the search service; separate FTS path | Open (design decision) |
| BE-11 | Medium | Replica lag can reject a freshly issued token if `DB_READ_URL` is a replica | Open |
| BE-12 | Medium | Reply visibility check and some authz paths lack tests | Pending verify |
| BE-13 | Low | `ai_eval` script not run against the real model | Open |
| BE-14 | Low | Golden-set tests run offline only | Open |
| BE-15 | Low | Lesson-gate test references a method that may not exist after merge | Pending verify |
| BE-16 | Low | `go.mod` changed by `go mod tidy`; module versions bumped beyond the audit list | Pending verify |

## 5. Security and repository hygiene (source: security review and branch work)

| ID | Sev | Gap | Status |
|---|---|---|---|
| SEC-01 | Critical | Secrets (JWT secret, admin password, DB credentials) are in git history on earlier commits | Open (you rotate and purge; see [ROTATION_AND_HISTORY_PURGE.md](ROTATION_AND_HISTORY_PURGE.md)) |
| SEC-02 | High | `release/gcp/*.env.cloudrun` and `firebase-sa.json` were tracked; still in history | Open (same as SEC-01) |
| SEC-03 | High | Frontend commit `6d41a767` was not run through the secret scan | Open |
| SEC-04 | High | Content factory `.env` needs `FACTORY_PROXY_SECRET` or it fails outside mock mode | Open (config) |
| SEC-05 | Medium | Dependencies: npm audit shows 12 high findings needing breaking upgrades; Go toolchain needs 1.25.x patch | Open ([DEPENDENCY_AUDIT.md](DEPENDENCY_AUDIT.md)) |
| SEC-06 | Medium | Sample seed is dev and test only; production catalogue must come from import | Open (decision) |
| SEC-07 | Low | Repo still tracks `release/dist/native` and `release/ga` build outputs | Open |
| SEC-08 | Low | `content/images/` and `docs/content-briefs/` untracked, decision pending | Open (your decision) |

## 6. Product and market (sources: [MARKET_REVIEW.md](MARKET_REVIEW.md), [PRODUCT_GAP_SECURITY_REVIEW.md](PRODUCT_GAP_SECURITY_REVIEW.md))

| ID | Sev | Gap | Status |
|---|---|---|---|
| MKT-01 | Critical | No product-market-fit evidence (no traffic, retention or revenue data in repo) | Open |
| MKT-02 | High | AI tutor routes every call to the expensive model; a Haiku-first router is needed for margin | Open |
| MKT-03 | High | Organic search is the main channel and exposed to AI Overviews | Open (strategy) |
| MKT-04 | High | Certificates carry little signal until scenario-based grading exists | Open |
| MKT-05 | High | No monetisation, pricing, subscriptions or UPI | Open (after waitlist test) |
| MKT-06 | Medium | Only about 19 of roughly 540 content files mention India-related topics | Open |
| MKT-07 | Medium | 138 articles have `articleType` but no `type:` line | Open (importer check) |
| MKT-08 | Medium | Competitor pricing partly unverified (Udemy, Naukri, Killercoda pages unreachable) | Open |

## 7. Code syntax and execution (sources: [CODE_EXECUTION_PLAN.md](CODE_EXECUTION_PLAN.md); syntax review pending)

| ID | Sev | Gap | Status |
|---|---|---|---|
| CODE-01 | High | Course lesson code is never highlighted; legacy course overview also skipped (`CourseViewPage.tsx` ~317–334, ~1095–1103). Likely cause of the reported complaint | Open (E2E not run) |
| CODE-02 | Medium | `htmlParser.ts` writes `class="language-${lang}"` without escaping | Planned (Phase 0) |
| CODE-03a | High | Fence info strings like `c++`, `c#`, `objective-c`, `vb.net` are rejected, so the closing fence opens a block that runs to end of document (`htmlParser.ts` ~126, ~133) | Open (reproduced) |
| CODE-03b | Medium | Tilde fences (`~~~`) rejected in frontend, accepted in backend | Open |
| CODE-04 | Medium | Sanitiser strips `language-c++` and similar classes, so highlighting falls back to auto-detect with wrong colours (`sanitize.ts` 23, 33) | Open (reproduced) |
| CODE-05 | Medium | 49 of 1,919 tagged fences use grammars missing from the hljs bundle (hcl, rego, sqlx, mermaid, …) and render plain | Open |
| CODE-06 | Medium | 43% of fences (830) cannot be picked in the editor language dropdown (`languages.ts`) | Open |
| CODE-07 | Medium | Light-mode token contrast fails WCAG AA (keyword 2.81:1, string 1.93:1, built-in 1.65:1); only the dark theme is loaded (`main.tsx:5`) | Open |
| CODE-08 | Medium | Dark-mode comments 2.95:1 | Open |
| CODE-09 | Medium | Course importer splits lessons on `### Lesson:` lines inside code samples (`importer/parser.go` ~206, ~211) | Open (reproduced) |
| CODE-10 | Medium | Prose underscores become emphasis (`my_var_name` → `my<em>var</em>name`, `htmlParser.ts` ~455–460) | Open (reproduced) |
| CODE-11 | Medium | `&` double-escaped in link URLs (`htmlParser.ts` ~424, 438, 450) | Open (reproduced) |
| CODE-12 | Low | `unescapeHtml` is a no-op (dead code, `htmlParser.ts` 258–263) | Open |
| CODE-13 | Pending | Browser behaviour of highlight effects and 390px layout not yet verified (E2E plan in review §6.3) | Open |
| CODE-03 | High | No runtime or execution of code anywhere in the product | Planned ([CODE_EXECUTION_PLAN.md](CODE_EXECUTION_PLAN.md)) |
| CODE-04 | Medium | Assessments: question model needs a code-question type; hidden tests need their own table | Planned |
| CODE-05 | Decision | Language order, engine (Judge0 vs Piston vs buy), budget, proctoring, counsel review of offensive labs | Open (your decision) |

## 8. Decisions waiting on you

1. Should quick-edit group members see unapproved drafts? (DEF-06)
2. Should quick-edit group members be able to save at all, or only owner and admins? (DEF-08)
3. Fix order for the inline defects (critical first, then the data-integrity highs).
4. Price-test and pricing assumptions for the waitlist (MKT-05).
5. Code execution: language order, engine, budget (CODE-05).
6. Whether to commit `content/images/` and `docs/content-briefs/` (SEC-08).
