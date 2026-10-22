# In-CMS AI Layer (backend)

Backend for PRODUCT_GAP_SECURITY_REVIEW §5.5: editorial assists, comment moderation, grounded learner tutor, quiz drafts, study plans. Everything is **off by default** and server-side only.

## Architecture

```
handler/ai_handler.go ──► application/ai (Service)
                            ├─ Gateway  (flags, limits, budgets, redaction, delimiting, output sanitising, usage)
                            ├─ editorial.go / learning.go / tutor.go / moderation.go / indexer.go / admin.go
                            └─ narrow interfaces: ContentReader, repository.AI*Repository, Analytics
infrastructure/llm        ──► Provider interface, Anthropic over net/http (no SDK dependency)
persistence/postgres/ai_repository.go ──► ai_usage, ai_drafts, content_chunks, ai_conversations/messages, ai_moderation_items
migrations/postgres/006_ai.sql
```

- Provider: `llm.Provider` (`Complete`). Anthropic implemented against `POST /v1/messages` (`x-api-key`, `anthropic-version: 2023-06-01`). Gemini can be added by implementing the same interface; not shipped.
- Models: `claude-sonnet-5-5` default tier, `claude-haiku-5-5` cheap tier (tags, seo, moderation). Both configurable (`ai.model.default`, `ai.model.cheap`). `thinking` is omitted (adaptive, the 5.x default) and `output_config.effort` is set per task to keep reasoning spend low (`low`, `medium` for quality-check and quiz). No temperature/top_p (rejected by 5.x models).
- Prompt caching: the system block (rules + task prompt) is always `cache_control: ephemeral`; the study-plan catalog block is cached too. Usage rows store `cache_read_tokens` / `cache_write_tokens` and cost accounts for them. Prefixes below the model's minimum cacheable size simply do not cache.
- Retries: 408/409/429/5xx and network errors, exponential backoff with jitter, honours `retry-after` (<30s), per-attempt timeout 45s, 2 retries. Errors never include upstream bodies or the key.
- Cost: `cost_micro_usd` = tokens x $/MTok (Sonnet 5.5 2/10, Haiku 5.5 0.10/0.50, cache read/write multipliers). Update `prices` in `gateway.go` if pricing changes.

## Configuration

Environment (never DB, never logged):

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enables the provider. Missing => all AI endpoints return 503 `AI_NOT_CONFIGURED`. |
| `AI_ALLOWED_LINK_HOSTS` | Extra comma-separated hosts AI output may link to. `geekgully.com`, `www.geekgully.com` and the `FRONTEND_URL` host are always allowed. |

Runtime settings (`app_settings`, edited via `PUT /api/ai/settings`, admin only, 5s cache):

| Key | Default | Meaning |
|---|---|---|
| `ai.enabled` | false | Global kill switch |
| `ai.editorial.enabled` / `ai.moderation.enabled` / `ai.tutor.enabled` / `ai.quiz.enabled` / `ai.studyplan.enabled` | false | Per-feature flags (also require `ai.enabled`) |
| `ai.moderation.fail_mode` | open | `open` = approve when screening fails, `closed` = send to queue |
| `ai.model.default` / `ai.model.cheap` | claude-sonnet-5-5 / claude-haiku-5-5 | Model ids (`^claude-...`) |
| `ai.limits.user_per_minute` | 10 | Per user, sliding window, in-memory per instance |
| `ai.limits.global_per_minute` | 120 | All users + moderation, per instance |
| `ai.limits.user_daily_tutor` | 30 | Successful tutor calls per user per 24h |
| `ai.limits.user_daily_other` | 50 | Successful non-tutor calls per user per 24h |
| `ai.budget.monthly_usd` | 50 | Calendar-month (UTC) spend cap across all tasks; 0 blocks everything |
| `ai.budget.per_request_usd` | 0.05 | Worst-case (input estimate + max_tokens) cap per request |

The settings API only accepts these keys; the API key can not be set or read through it. The per-minute limiters are per process; with N instances the effective limit is N times higher (daily and monthly limits are DB-backed and exact).

## Error contract

All AI errors: `{ "success": false, "code": "<CODE>", "message": "..." }`.

| HTTP | code | Meaning |
|---|---|---|
| 503 | `AI_DISABLED` | `ai.enabled` is false |
| 503 | `AI_FEATURE_DISABLED` | feature flag off |
| 503 | `AI_NOT_CONFIGURED` | no `ANTHROPIC_API_KEY` |
| 429 | `AI_RATE_LIMITED` | per-minute user/global limit |
| 429 | `AI_DAILY_LIMIT` | per-user daily limit |
| 429 | `AI_BUDGET_EXCEEDED` | monthly budget exhausted |
| 413 | `AI_REQUEST_TOO_LARGE` | exceeds per-request budget |
| 400 | `AI_INVALID_INPUT` | validation |
| 404 | `AI_NOT_FOUND` | unknown/unauthorised content, conversation, draft, message |
| 422 | `AI_REFUSED` | model declined |
| 502 | `AI_UPSTREAM_ERROR` / `AI_BAD_OUTPUT` | provider failed / output not usable |
| 401/403 | standard | not signed in / admin or verified email required |

Use `GET /api/ai/status` to gate UI: `{ enabled, configured, features: { editorial, moderation, tutor, quiz, studyPlan } }` (each already ANDed with enabled + configured).

## Endpoint contract

All under `/api/ai`, JSON, authenticated, CSRF-protected (same as other protected routes). Responses use `{ success, data }`. Body limit 64 KB.

### Editorial (content creator, assigned reviewer, or admin; otherwise 404)
`contentType` is `article` or `course`; `contentId` is the numeric CMS id (draft content allowed).

- `POST /tags/suggest` `{contentType, contentId}` -> `{ topics[], categories[], tags[], source: "llm"|"heuristic", note? }`, each item `{id, name, score, reason?}`. Ids are validated against the existing taxonomy; `score` is the token-overlap score used by the content-factory resolver. On provider failure it falls back to heuristic results with a `note`. Nothing is applied; the UI uses the normal CMS tag/topic endpoints after the editor picks.
- `POST /summary` -> `{ draftId, tldr, takeaways[], status: "draft" }`. Stored in `ai_drafts`; never written to the content automatically.
- `POST /seo` -> `{ draftId, metaTitle (<=60), metaDescription (<=160), keywords[], lengthAdjusted }`.
- `POST /quality-check` -> `{ score 0-100, issues[{severity: info|warn|error, category: structure|readability|broken_link|missing_section|unsupported_claim, message, location?}], stats, aiUsed, note? }`. Deterministic lint (structure, sentence length, long paragraphs, internal links resolved against published slugs/ids) plus LLM review for missing sections and unsupported claims.
- `POST /quiz/generate` `{contentType, contentId, count (1-15, default 5), difficulty: easy|medium|hard}` -> `{ draftId, difficulty, questions[{type:"mcq", question, options[3-5], correctIndex, explanation, anchor?}], status:"draft" }`.
- `GET /drafts?contentType=&contentId=&kind=summary|seo|quiz` -> drafts (`id, kind, payload, status, createdAt`).
- `POST /drafts/:id/accept` | `/reject` -> updated draft. Accept only marks the draft; the UI applies the fields via the normal CMS update.

### Learner (verified email required for ask and study-plan)
- `POST /tutor/ask` `{courseId | contentId (+contentType, default article), question (3-1000 chars), conversationId?}` ->
  `{ conversationId, messageId, answer, grounded, citations[{id, title, heading, anchor, url, contentType, contentId}] }`.
  When nothing relevant is retrieved, or the model cannot support the answer with a valid citation, `grounded=false`, `citations=[]` and `answer` is a fixed "could not find support" message. No tokens are spent when retrieval is empty. `url` is `/courses/<slug|publicId>#<anchor>` or `/articles/<slug|publicId>#<anchor>`. Only PUBLISHED content is answerable (404 otherwise); history (last 6 messages) is replayed only for the owner.
- `GET /tutor/conversations` -> own conversations. `GET /tutor/conversations/:id` -> `{conversation, messages[{id, role, content, citations, grounded, rating, createdAt}]}`. `DELETE /tutor/conversations/:id` deletes it and its messages (also cascades on user deletion).
- `POST /tutor/messages/:id/feedback` `{rating: 1|-1, comment?}` (assistant messages of own conversations only).
- `POST /study-plan` `{goals (3-600), level: beginner|intermediate|advanced}` -> `{ summary, items[{type:"course"|"path", id, title, reason, order}], note? }`. Items not present in the published course / learning-path catalog are dropped.

### Moderation
- Hook: `commentsvc.NewServiceWithScreener`. Every new review comment is screened; heuristics first (PII, spam phrases, link floods, threats/slurs flag outright; links, mild profanity, shouting, repetition are "ambiguous"), the cheap model only for ambiguous text. Flagged comments are stored with the comment id in `ai_moderation_items` (`pending_review`) and hidden from `GET /review-comments` and replies until approved. The create response carries `moderationStatus: "pending_review"` so the UI can tell the author it is held.
- `GET /moderation?status=pending_review|approved|rejected&page=&size=` (admin) -> Strapi-paged items `{id, commentId, contentType, contentId, authorId, excerpt (redacted), reasons[], source: heuristic|llm|fail_open|fail_closed, status, createdAt}`.
- `POST /moderation/:id/approve` | `/reject` (admin). Rejected comments stay hidden.

### Admin
- `GET /usage?from=YYYY-MM-DD&to=YYYY-MM-DD` (default last 30 days, max 366) -> `{ total, byTask[], byUser[top 20], byDay[] }`, rows `{key, calls, inputTokens, outputTokens, costMicroUsd, avgLatencyMs, errors}`. Blocked and failed calls are recorded too.
- `GET /settings` -> effective settings + `keyConfigured`, `provider`. `PUT /settings` `{settings: {"ai.enabled": "true", ...}}` (validated, allowlisted).
- `POST /admin/reindex` -> `{updated}` forces a tutor index refresh.
- Audit events: `ai.settings.updated`, `ai.tags.suggested`, `ai.summary.generated`, `ai.seo.generated`, `ai.quiz.generated`, `ai.draft.accepted|rejected`, `ai.moderation.approved|rejected`, `ai.reindex`.

## Tutor index (RAG-lite)

`content_chunks` holds heading-delimited chunks (about 1200 chars, code fences kept intact) of PUBLISHED articles and courses (course body + lessons, using the published snapshot while a newer draft is in review). A background indexer (every 5 minutes while `ai.enabled` and `ai.tutor.enabled`) re-chunks content whose `updated_at` (courses: max of course/lesson updated_at) is newer than the indexed stamp and prunes unpublished content. Retrieval is Postgres FTS (`to_tsquery('english', ...)` OR-ed keywords, `ts_rank_cd`) scoped to the course/content id, top 6. It is self-contained so it does not depend on the search service; swapping `AIChunkRepository.SearchChunks` for the search service (or pgvector) is a one-method change. Content published before the first run is picked up by the first indexer tick or `POST /admin/reindex`. A publish-time hook is not wired; `IndexContent` equivalent is `Reindex`.

## Threat model

| Threat | Mitigations |
|---|---|
| Prompt injection via course/article/comment/user text | All such text is wrapped in `<untrusted_data label=...>`; embedded delimiter tokens are neutralised; system rules instruct the model to ignore embedded instructions; no tools, no browsing, no function calling; outputs are parsed as strict JSON and re-validated against ground truth (taxonomy ids, catalog ids, retrieved passage labels, length caps) so an injected instruction can at worst change wording inside validated fields; tutor answers without a valid citation are replaced by a refusal. |
| Data exfiltration via output (markdown images/links, raw URLs, HTML) | Images, script/iframe/img/svg/form tags removed; markdown links and bare URLs kept only for relative paths or allowlisted hosts, otherwise reduced to text / `[link removed]`. Applied to every model output in the gateway. |
| PII leakage to the provider / into logs | Emails and phone numbers (10-15 digits) redacted from every untrusted block, history turn and question before the call; moderation queue stores a redacted 300-char excerpt; tutor analytics event carries no text; the API key lives only in env and is never in logs, errors, settings or responses; prompts/answers are not logged (only task, code). Stored conversations are the user's own and deletable. |
| Cost abuse / denial of wallet | Kill switch, per-feature flags, per-user and global per-minute limits, per-user daily caps, monthly budget, per-request worst-case budget, max output tokens per task, input clipping, empty-retrieval short-circuit, auth + verified email for learner features, body cap. Blocked and failed attempts are accounted in `ai_usage`. |
| Cross-user access | Conversations, messages, feedback and deletion are filtered by `user_id`; editorial endpoints require ownership/reviewer/admin and answer 404 otherwise; tutor retrieval is restricted to published content scope. |
| Hallucinated references | Taxonomy ids, study-plan items and citations are validated server-side; unknown ones are dropped. |
| Unattended publishing | Summary/SEO/quiz are drafts needing explicit accept; nothing writes to articles or courses. |
| Provider outage / fail behaviour | Gated features return 503/502 with codes; tags fall back to heuristics; quality-check falls back to lint-only; moderation fails open or closed by setting. |

Residual risks: per-minute limits are per instance; regex-based PII redaction is best effort (names, addresses, IDs are not detected); sanitising allows `http(s)` links to allowlisted hosts only.

## Evaluation harness

- Fixtures: `internal/application/ai/testdata/golden_tutor.json` (answerable, out-of-scope, injection-in-context, prompt-exfiltration). Each case lists retrieved passages, expected grounded/refusal, expected citation headings, and must/must-not-contain strings. `fakeReply` is the scripted provider output used offline.
- Offline (CI): `go test ./internal/application/ai/ -short` runs the set through the real service and gateway with the fake provider (this proves the guardrails: for example the injected `evil.example` link in the scripted reply is stripped).
- Online: `ANTHROPIC_API_KEY=... go run -tags aieval ./scripts/ai_eval.go [path/to/golden.json]` calls the real model through the same gateway and reports PASS/FAIL per case (groundedness, citation validity, leakage). It spends tokens; run it before changing prompts or models.

## Notes for the frontend wave
- Gate UI with `GET /api/ai/status`; treat 503 codes as "feature unavailable", 429 `AI_DAILY_LIMIT` / `AI_RATE_LIMITED` as retry-later messages.
- Always render tutor `answer` as text/markdown without raw HTML, and link citations via `url`.
- Show a held-for-review notice when a created comment has `moderationStatus: "pending_review"`.
- Drafts: show `payload` for review, then call accept/reject, and apply accepted fields through the existing CMS update endpoints.
