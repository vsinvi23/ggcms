# GeekGully / GG-CMS — Product Gap, Security, Mock-Data, AI & Analytics Review

Reviewer role: Product Management · Basis: static code review of branch `fix/critical-security-and-data-integrity` (no dynamic testing, no dependency scan run). Companion: [SOCIAL_LOGIN_SPEC.md](SOCIAL_LOGIN_SPEC.md).

---

## 1. Executive summary

The platform has a strong **content-authoring and workflow core** (CMS, review/publish, taxonomy, import, a Python content factory). The **learner product is thin**: much of what a learner sees about themselves (profile, settings, progress, practice) is either hardcoded, stored only in the browser, or not persisted. Analytics collects almost nothing and no UI reads it. There is no AI in the learner experience.

Three things block a public launch regardless of features:

1. **Secrets are committed** (`.env` with JWT secret, admin password, DB credentials) and the JWT key may be compromised.
2. **Auth/session design is weak** (24 h non-revocable tokens, token also in localStorage, rate-limit bypass header, spoofable client IP, open self-registration with no email verification).
3. **User-facing screens show fake data** (profile, stats, practice questions, technology counts) and "save" buttons that do nothing — including a **change-password that reports success without changing anything**.

### Top 10 actions (ordered)
| # | Action | Type | Effort |
|---|---|---|---|
| 1 | Rotate all secrets; untrack `.env` files; purge git history | Security | S |
| 2 | Remove rate-limit bypass header; set trusted proxies; redact logs | Security | S |
| 3 | Fix upload-extension stored XSS, diff-view XSS, drop JWT in localStorage | Security | S–M |
| 4 | Make change-password real; remove/replace fake Profile & Settings | Product | S |
| 5 | Lock down user listing, notification IDOR, draft-content reads | Security | S |
| 6 | Email verification + short-lived tokens with refresh & revocation | Security/Product | M |
| 7 | Server-side progress, quiz scoring, "continue learning" (kill localStorage truth) | Product | M–L |
| 8 | Event tracking v1 + wire analytics UI + privacy baseline | Analytics | M |
| 9 | Social login (per spec) | Product | L |
| 10 | Search upgrade (FTS/trigram) and per-page SEO/sitemap | Product | M |

Effort: S ≤ 3 days, M ≈ 1–2 wks, L ≈ 3+ wks.

---

## 2. Security findings

Severity from code reading; **verified by me:** tracked `.env` files, `X-E2E-Bypass-Rate-Limit` honoured in `rate_limit.go:88,109`, no `SetTrustedProxies` anywhere. Others are from the audit and should be reproduced before reporting externally.

### Critical / High
| ID | Finding | Location | Fix |
|---|---|---|---|
| C1 | Real-looking secrets committed: `JWT_SECRET`, `ADMIN_PASSWORD`, DB/Mongo creds, debug mode. Also `frontend/react-ui/.env`, `.env.production`, and **`release/gcp/**/.env.cloudrun` are tracked (not yet inspected — treat as suspect)**. Admin password also hardcoded in `e2e/fixtures/auth.ts` | `backend/go-cms/.env` | Rotate everything; `git rm --cached`; ignore `.env*` except `*.example`; filter-repo history; secret manager |
| H1 | Rate-limit bypass via request header, usable by anyone in prod | `middleware/rate_limit.go:12,88,109` | Delete header bypass; env bypass refused when `APP_ENV=production`; add per-account lockout |
| H2 | `X-Forwarded-For` trusted by default → per-IP limits spoofable; limiter is in-memory per instance | `router.go` (no `SetTrustedProxies`) | Set trusted proxies; shared/edge rate limiting |
| H3 | Stored XSS: upload extension taken from client filename, magic-byte sniff only, served by extension | `storage/local.go:27-33`, `media_handler.go:101-115` | Extension from sniffed MIME allow-list; `nosniff`, CSP sandbox, `Content-Disposition`; separate cookieless origin |
| H4 | JWT stored in localStorage + sessionStorage and returned in JSON body | `frontend api/client.ts:36-40,81-88` | Cookie only; or memory-only bearer |
| H5 | DOM XSS: `ContentDiffOverlay` assigns unsanitised HTML to `innerHTML`; backend does no body sanitising | `ContentDiffOverlay.tsx:83-87` | Sanitise (DOMPurify/DOMParser); sanitise on save |
| H6 | Any registered user can list all users' PII and group members | `router.go ~249`, `user_handler.go:27-41` | `AdminOnly` or minimal DTO |
| H7 | Debug logger records request/response bodies, cookies, passwords, reset codes; admin-downloadable | `middleware/logger.go:36-100` | Redact; never log `/auth/*`, `/admin/*`, ingest; block debug in release |
| H8 | No revocation/refresh; role baked into 24 h JWT; logout = clear cookie; no iss/aud/jti | `pkg/jwt/jwt.go`, `auth_handler.go` | 15-min access + rotating refresh; `token_version`; min secret length |
| H9 | Break-glass `recover-password` and factory ingest unthrottled; recovery can reset any account | `router.go ~200` | Rate-limit, IP allow-list, admin-only target, alerting |

### Medium
| ID | Finding | Fix |
|---|---|---|
| M1 | Password policy `min=6`, no breach check, no max (bcrypt 72-byte) | ≥12 chars, breach check, caps |
| M2 | User enumeration: register 409, login timing, forgot-password timing | Uniform responses, dummy hash, async mail |
| M3 | Password reset doesn't revoke sessions/other tokens or notify user | Revoke, notify |
| M4 | No security headers on Gin-served SPA (CSP/HSTS/XFO/nosniff exist only in nginx) | Header middleware |
| M5 | CSRF guards only `p` group; Secure cookie hard-coded; register returns JWT in body | Consistent cookie issuance |
| M6 | OAuth: replayable state, no PKCE/nonce, Google `verified_email` ignored, silent email-link (account takeover), raw errors in redirect | See Social Login spec |
| M7 | AuthZ gaps: notification mark-read IDOR; all authenticated users read DRAFT/REVIEW content & history; any user can create/delete tags; public review-comments leak author email; log forging via `/logs/client`; last admin deletable; raw `err.Error()` returned | Ownership/role checks; DTO trimming; generic errors |
| M8 | Import preview has no body cap; unbounded `upload.max_size_mb`; admin can allow `text/html`/SVG upload types | `MaxBytesReader`; hard ceiling; fixed type allow-list |
| M9 | Admin-settable S3 endpoint / upload dir (SSRF, path) | Validate https/public IP; fix dir |
| M10 | `/factory` reverse proxy forwards cookie/Authorization to third party, hardcoded Cloud Run default | Strip creds, add CSRF, config-only URL |
| M11 | Sanitiser allows `svg/foreignObject`; `window.open` of arbitrary URL; CSP `unsafe-inline` styles | Tighten allow-list; http(s) only |
| M12 | Container: runs as root, HTTP apk repos, `GOSUMDB=off`, DB ports on all interfaces, default pgAdmin creds, `latest` tags | Hardening |
| M13 | GraphQL public: introspection on, no depth/complexity/size limits | Limits; disable introspection in prod |

### Low
Role-resolution duplicated in 3 places; admin re-seeded from env every boot with predictable default emails; missing `ReadHeaderTimeout`; audit log lacks failed logins/resets; outdated deps (gin 1.9.1, jwt v5.2.1, x/crypto 0.25) — run `govulncheck` and `npm audit`; two JS lockfiles.

### Already done well (keep)
bcrypt cost 12; HMAC-only JWT validation; fail-closed secret-header endpoints with constant-time compare; HttpOnly+Secure+Lax cookie with double-submit CSRF; explicit CORS allow-list; ownership checks added in `49c2947c` for CMS/sections/lessons/tasks/enrollments/profile; mass-assignment blocked on user update; MIME-sniffed upload allow-list excluding SVG/HTML; robust zip-import limits and inline-SVG sanitiser; parameterised SQL; hashed single-use reset tokens; DOMPurify on all other HTML sinks.

### Security roadmap
- **Week 0 (stop-ship):** C1, H1, H2, H7, H9.
- **Week 1–2:** H3, H4, H5, H6, M7, M4.
- **Week 3–4:** H8 (token model), M1–M3, email verification, M13, M12, dependency upgrades.
- **Then:** social login; MFA for admin roles; pen test; add `govulncheck`/`npm audit`/secret-scan to CI.

---

## 3. Product gaps (learner perspective)

### 3.1 What works (real API-backed)
Explore/Home/Courses/Learning paths/Topics/Search pages; enrollment with progress field; notes, highlights, favourites, reactions, comments; notification bell; personalization profile + onboarding widgets; rule-based recommendations.

### 3.2 Gaps
| Area | Gap | Why it matters | Priority |
|---|---|---|---|
| Progress | Course/path progress & read state live in `localStorage`; server `UpdateProgress` trusts a client float | Lost on device change; path progress contradicts enrollments; trivially falsified | P0 |
| Quizzes / assessments | Authoring UI exists; no learner taker, scoring, pass mark, history, or backend entity. PracticeHub fabricates generic questions and scores in browser | Core learning loop is missing; fake content | P0 |
| Certificates | None (completion only sets `CompletedAt`) | Primary motivator; shareable proof for LinkedIn | P1 |
| Resume / next | `LastAccessedAt` unused for "continue where you left off" at lesson level | Engagement/retention | P1 |
| Account | Change-password, delete-account, data export non-functional; settings don't persist | Trust, DPDP/GDPR | P0 |
| Email & notifications | Notification `Create` never called; mailer only used for password reset; no queue/templates; preferences not stored | No re-engagement | P1 |
| Email verification | Absent | Fake accounts, takeover, deliverability | P0 |
| Search | `ILIKE %q%`: no ranking, typo tolerance, suggestions, recent searches | Discovery is the product | P1 |
| Recommendations | Declared-interest only; ignores behaviour; recomputed per request; errors swallowed | Weak personalization | P2 |
| SEO | No sitemap, no per-page title/meta/canonical (index.html canonical `/` everywhere), no JSON-LD, client-rendered SPA | Organic acquisition is the growth channel for a content portal | P0/P1 |
| Gamification | No streaks/XP/badges/goals (profile "12 achievements" is fake) | Habit formation | P2 |
| Social | No sharing, public profiles, follow, threaded comments; "learning groups" in localStorage | Virality | P2 |
| Bookmarks | Flat favourites, no collections | Organisation | P3 |
| Onboarding | `OnboardingWizard` not routed; trigger on first login unverified | Activation | P1 |
| i18n | None (language setting cosmetic) | India multi-language reach | P3 |
| Accessibility | ~20 aria labels, no skip link/live regions | Compliance, reach | P1 |
| PWA/offline | None | Mobile learners | P3 |
| Admin dashboards | Counts capped to first 200 users client-side | Wrong numbers at scale | P1 |

### 3.2b Gaps reported during implementation (FIXED)
| ID | Gap | Root cause | Fix |
|---|---|---|---|
| G-1 | Related Articles on an article page opened a 404, while the same article opened from Explore worked | `PublicArticleView.tsx` built links as `/explore/articles/<slug>`; no such route exists (only `/explore/articles` and `/explore/:category`), so it fell through to NotFound. Explore uses `/article/<slug>` | Related links now use `buildArticleUrl(item)` (`/article/<category>/<slug>`) |
| G-2 | Anonymous visitors could start a course and open lessons without being asked to sign in | "Start Learning" only enrolled when authenticated but opened lesson 1 regardless; lesson list, next/prev and `?learn=true`/`?lesson=` deep links also bypassed any check; "Enroll" sent users to `/auth` with no return | `CourseViewPage` now routes every lesson open through one gated `selectLesson`: anonymous users get the login/sign-up modal, and after sign-in the chosen lesson opens and the user is auto-enrolled; deep links wait for auth to resolve before prompting; Enroll opens the same modal. Course overview stays public for SEO |

| G-3 | Same class of broken-link bug elsewhere | Highlights on the home "learning" section and Notes & Highlights page always linked to `/course/<slug>` even for article highlights (and showed no link without a slug); technology breadcrumb "Categories" pointed to `/explore/categories` (lands on generic Explore) | Links now branch on `contentType` and fall back to id; breadcrumb points to `/technologies`. Audit of all other content links found them consistent (`buildArticleUrl`/`buildCourseUrl`; backend resolves slug, UUID or numeric id) |
| G-4 | Sidebar "Help" link has no route (404) | `AppSidebar` links `/help`, no page exists | **Open** — needs a help page or removal of the link |
| G-5 | Article/course reading width too narrow on large screens | Article container capped at 1400px, course runner at 1550px | Widened 25%: article 1750px, course 1940px (rails and content scale proportionally) |

**Open follow-up on G-2:** the gate is UI-only. Public course/lesson API responses still contain lesson bodies, so a scripted client can read them. Decide whether lesson bodies should be withheld from the public API for anonymous callers (SEO trade-off: keep the first lesson or a summary public).

### 3.3 Suggested learner MVP slice ("Learn loop v1")
Server-side progress → lesson-level resume → quizzes with scoring → certificate on completion → email on completion/streak → shareable certificate page with SEO markup. This alone turns the portal from "reading site" into "learning product".

---

## 4. Mock / fake / placeholder data to clean

### 4.1 Frontend (`gg-cms/frontend/react-ui/src`)
| Location | Issue | Action |
|---|---|---|
| `pages/ProfilePage.tsx:55-89` | Hardcoded profile (+1 555 phone, San Francisco, "Senior Software Engineer"), fake stats (24 articles/8 courses/156 contributions/12 achievements), fake activity feed; save only toasts | Bind to profile API; compute stats; remove feed or use real activity |
| `pages/UserSettings.tsx:93-125` | Settings save only toasts; **change-password fakes success**; delete says "demo mode" | Real endpoints or hide; change-password is a security-trust defect |
| `pages/PracticeHub.tsx:25-80,343` | Generated generic Kubernetes questions for every topic; "coming soon" dead-end | Remove; use real assessment data |
| `pages/DomainsPage.tsx:21-58` | `mockDomains` instead of `useDomains` | Use API |
| `pages/TechnologiesPage.tsx:21-70` | `mockTechnologies` with invented counts | Derive from API |
| `data/mockContent.ts`, `data/mockUsers.ts` | Mock catalogue/129 random users | Delete |
| `store/slices/{article,content,course,user}Slice.ts` | Initial state seeded from mocks | Delete slices or start empty |
| `lib/contentStateStore.ts`, `interviewAttemptStore.ts`, `learningGroupStore.ts` | Business data in localStorage | Move to server |

### 4.2 Backend / data
| Location | Issue | Action |
|---|---|---|
| `migrations/postgres/001_initial_schema_reset.sql` ~221-231, ~1140-1330 | `system@gg-cms.local` user; sample Docker/other articles & courses (`art-docker-001-uuid-v4-sample-slug`), 2 sample learning paths, hot-linked unsplash thumbnails | Gate behind `SEED_SAMPLE_CONTENT` (default false in prod); self-host images |
| Same, ~1330+ | Catalogue seeded from `content/` | Keep, but move to import pipeline |
| `bootstrap/admin.go`, `.env.example` | Predictable admin emails (`admin@serenya.com`, `geekadmin@geekgully.com`), empty default admin password | Require strong value; warn on default |
| `test_router.go` | Stray file in package root | Delete |
| `docker-compose.yml` | `gg_cms_pass`, pgAdmin `Admin@123`, wrong init filename | Env-driven secrets |
| `content-factory/MOCK_AGENT_README.md` | Mock agent mode exists | Ensure disabled in prod |

### 4.3 Marketing site (`web/src`)
Three likely fabricated testimonials (`components/ui/testimonials.tsx`); client-side Math.random captcha (`contact.tsx:31`); dashboard mockups are illustrative (label as such).

### 4.4 Repository hygiene (tracked in git; remove)
`.env` files (above) · `release/gcp/**/.env.cloudrun` (inspect) · `gg-cms/e2e/node_modules` (≈1100 files) · `e2e/test-results`, `.e2e-state.json`, `playwright-report` · `backend/go-cms/dist/*` · `rclone-*.zip` (32 MB) and `rclone-v1.75.0-osx-arm64/` · `relink.sql` · `content/dist/*.zip` · `.DS_Store` files. Untracked but present and not to be committed: `server.exe`, `logs/`, corporate `.crt` files, `content/images/`, `docs/content-briefs/` (currently untracked in git status — decide deliberately).

---

## 5. AI & analytics

### 5.1 Current state
- **Analytics:** one Mongo collection of events, 90-day TTL, only `page_view` (server-side, anonymous, raw IP+UA, bots counted) and `reaction`. One admin endpoint (`/api/analytics/dashboard`: 30-day views + top 5) that **no frontend code calls**. Existing "Analytics" and "Dashboard" pages derive numbers from user/content/notification lists (users capped at 200).
- **Personalization:** deterministic rule-based (topic weights, topic-graph prerequisites, category match). No behavioural signals, no cache, O(n²) sort, swallowed errors. (The older consolidated review wrongly says no topic awareness — code now has it.)
- **AI:** exists only in the separate Python content-factory (Gemini/Claude agents, quality scoring, cost caps, dedup). The Go CMS has **no LLM, embedding or semantic search code**. Embeddings in the factory were de-scoped (pgvector removed; docs stale). Provenance is stored as an HTML comment, not columns. Quizzes from the factory are flattened into body text.

### 5.2 Pending — User analysis
Segmentation · behavioural learner profile / inferred proficiency · skill-gap estimation · engagement score · churn/at-risk flag · activation & onboarding funnel · cohort retention · DAU/WAU/MAU · enrollment→completion funnel. *(All missing.)*

### 5.3 Pending — Data analysis
Per-content views / unique readers / read-time / scroll / completion rate · trending & stale content · reaction ratios · **search query log + zero-result report** · recommendation impression→click→completion · A/B and feature-flag framework · SEO analytics (Search Console) · LLM cost/quality surfaced in CMS · rollups and warehouse export beyond 90 days · metrics/tracing (Prometheus/OTel) · event schema versioning. *(All missing.)*

### 5.4 Pending — Privacy
No consent capture, IP hashing/truncation, event purge on account deletion, or data-subject export. Required for DPDP Act 2023 / GDPR **before** richer tracking.

### 5.5 Pending — AI features (learner & editorial)
| Feature | Value | Complexity | Order |
|---|---|---|---|
| Postgres FTS/trigram search (non-AI quick win) | High | Low | 1 |
| Auto-tag/taxonomy suggestion in CMS (reuse factory resolver) | Med | Low | 2 |
| Article TL;DR / summary | Med | Low | 3 |
| Comment moderation (toxicity/spam) | Med | Low | 4 |
| Quiz generation stored as structured entities + adaptive practice | High | Med | 5 |
| RAG "Ask this course" tutor grounded in published content (needs embeddings + citations + guardrails) | High | High | 6 |
| Personalised study plan / skill-gap paths | High | High | 7 |
| Editorial QA / SEO-GEO suggestions in editor | Med | Med | 8 |
Prerequisites: decide vector store (pgvector vs file store); LLM gateway with cost caps/observability in the Go app; prompt-injection and PII guardrails (content is user-influenced).

### 5.6 Analytics roadmap
1. **Now:** wire `/api/analytics/dashboard` to UI; replace 200-user client counts with server aggregates; hash IPs; filter bots; purge on deletion.
2. **Event taxonomy v1:** `visitor_id/session_id`, `article_read{time,scroll}`, `search{q,results}`, `course_enrolled`, `lesson_completed`, `quiz_attempted`, `rec_impression/click`; versioned ingest endpoint; emit from `enrollment/service.go`.
3. **Reporting:** content-performance and search reports; funnels.
4. **Retention:** daily rollups, cohorts, nightly warehouse export (BigQuery or similar).
5. **Use the data:** personalization v2 using completion/recency; churn and engagement scores; A/B on recommendations.

---

## 6. Recommended delivery plan

| Release | Theme | Contents |
|---|---|---|
| R0 (1 wk) | Stop-ship security | Secret rotation/purge, rate-limit & proxy fixes, log redaction, recover-password hardening, delete junk from git |
| R1 (2–3 wks) | Trust & truth | Upload/XSS fixes, user-list lockdown, IDOR/draft read fixes, real change-password/profile/settings, delete mock data & seed gating, security headers |
| R2 (3–4 wks) | Identity foundation | Email verification, token model (access/refresh/revocation), password policy, privacy baseline (consent, IP hashing, deletion/export) |
| R3 (4–6 wks) | Learn loop v1 | Server-side progress, resume, quizzes+scoring, certificates, transactional emails, search FTS, SEO (sitemap/meta/JSON-LD, prerender) |
| R4 (3–4 wks) | Social login | Per SOCIAL_LOGIN_SPEC (Google, GitHub, LinkedIn) |
| R5 (4–6 wks) | Insight | Event taxonomy v1, analytics UI, content/search reports, funnels, rollups |
| R6+ | Intelligence | Personalization v2, auto-tagging, summaries, moderation, RAG tutor, adaptive quizzes |

Dependencies: R4 needs R2; R5 needs R2 privacy baseline; RAG tutor needs R5 telemetry and a vector-store decision.

## 7. Open questions for the owner
1. Has the committed `JWT_SECRET`/admin password ever been used in a deployed environment? (Determines incident severity.)
2. Are `release/gcp/**/.env.cloudrun` files real credentials?
3. Target launch audience/geography (drives DPDP vs GDPR scope and i18n priority).
4. Is SSR/prerendering acceptable for SEO, or will a separate static public site be used?
5. Budget stance on LLM spend inside the learner product.
6. Should `content/images/` and `docs/content-briefs/` (currently untracked) be committed?

## 8. Review limitations
Static read only; the app was not run; no `govulncheck`/`npm audit`/secret scanner executed; secret values were not read in full (lengths/prefixes only); some line numbers are approximate; `release/` files and several FE store slices were not read in depth.
