# API: analytics, notifications, privacy and self-service

All JSON responses use the envelope `{ "success": true, "data": ... }` unless noted. Errors use `{ "success": false, "message": "...", "code"?: "..." }`. Authenticated routes need the session cookie and, for mutating verbs, the CSRF header already used by the app. "Admin" routes require the admin role.

## 1. Analytics ingest

`POST /api/analytics/events` (public, optional auth, rate limit 120 requests/min/IP, body cap 32 KB, max 20 events). Responds `202`.

```jsonc
{
  "consent": true,                      // result of the cookie/consent banner. false => anonymous aggregate only
  "events": [{
    "schemaVersion": 1,                 // required, must be 1
    "eventId": "uuid-or-random-8-64",   // [A-Za-z0-9_-], unique per event (replays are ignored)
    "eventType": "page_view",           // see table
    "visitorId": "random-8-64",         // only stored when consent=true
    "sessionId": "random-8-64",         // only stored when consent=true
    "contentId": "123",                 // numeric id; required for types that need content
    "contentType": "article",           // article | course | lesson | path
    "clientTs": "2026-03-10T12:00:00Z", // optional, kept only if within -7d/+5m of server time
    "metadata": { }                     // allow-listed keys only, other keys silently dropped
  }]
}
```

Response `data`: `{ "accepted": 1, "deduped": 0, "rejected": [{ "index": 0, "reason": "invalid_metadata" }], "ignored": "bot" }`.
Reasons: `unsupported_schema_version`, `unknown_event_type`, `server_only_event_type`, `invalid_event_id`, `invalid_visitor_id`, `invalid_session_id`, `invalid_content_ref`, `invalid_metadata`, `queue_full`. HTTP `400` for an empty or >20 batch, `413` over 32 KB, `429` when rate limited.

| eventType | needs content | metadata (allow-list) | notes |
|---|---|---|---|
| `page_view` | yes | `referrer_host` (str), `path` (str) | deduped per visitor (or hashed IP) + content for 30 minutes |
| `article_read` | yes | `read_seconds` 0-86400, `scroll_pct` 0-100 | send once when the reader leaves/finishes |
| `search` | no | `query_text` (str), `result_count` (int, required) or `query_hash` | server hashes text with a keyed hash; `query_text` is stored (redacted: emails, long numbers, tokens removed, 100 chars) only when `consent=true` |
| `rec_impression`, `rec_click` | yes | `rec_id` (surface id), `position`, `variant` | feeds the recommendation CTR report |

Server-only (rejected from the public endpoint, emitted by the backend): `course_enrolled`, `lesson_completed`, `course_completed`, `quiz_attempted`, `certificate_issued`, `ai_tutor_question`.

Consent rules: with `consent=false` no `visitorId`, `sessionId`, user id, IP hash or user agent is stored and the event is flagged anonymous. With `consent=true` and a logged-in user the user id is attached. Raw IPs are never stored: the address is truncated (IPv4 /24, IPv6 /48) and stored as a 16-hex keyed HMAC (`ANALYTICS_IP_SALT`). Bots (empty or automated user agents) are dropped (`ignored: "bot"`).

Server-side page views (`GET /api/public/...`) still emit `page_view`. The frontend should send header `X-GG-Client-Analytics: 1` on those public content calls once it emits its own `page_view`, so views are not double counted.

## 2. Admin reports

Dates are `YYYY-MM-DD` (UTC, inclusive). Defaults: last 30 days. Max range 366 days. Reports read from daily rollups (refreshed hourly; rollups outlive the 90-day raw TTL).

| Route | Query | `data` |
|---|---|---|
| `GET /api/analytics/dashboard` | | `{ page_views_30d, top_content: [{ contentId, contentType, views, title, slug }] }` |
| `GET /api/analytics/overview` | `from,to` | `{ from, to, dau, wau, mau, totals: { pageViews, reads, searches, newUsers, enrollments, completions }, timeline: [{ day, activeUsers, visitors, pageViews, newUsers, enrollments, completions }] }`. DAU/WAU/MAU are distinct logged-in users active on the last day / 7 / 30 days ending at `to` |
| `GET /api/analytics/content` | `from,to,limit` | `{ top: ContentRow[], trending: ContentRow[], stale: [{ contentType, contentId, title, slug, views, updatedAt }] }`; `ContentRow = { contentType, contentId, title, slug, views, uniqueVisitors, uniqueReaders, avgReadSeconds, completionRate, enrollments, completions, trendPct }`. Unique counts are the sum of daily uniques. `completionRate` = completions/enrollments for courses, otherwise share of reads reaching 80% scroll. Trending = last 7 days vs prior 7. Stale = published, not updated for 180 days, fewest views first |
| `GET /api/analytics/search` | `from,to,limit` | `{ totalSearches, zeroResultRate, top: SearchRow[], zeroResults: SearchRow[] }`; `SearchRow = { queryHash, queryText?, count, zeroResultCount, avgResults }` |
| `GET /api/analytics/funnel` | `from,to` | `{ steps: [{ step: visit|signup|enroll|complete, count, conversionFromPrevious }], note }` |
| `GET /api/analytics/cohorts` | `weeks` (default 8, max 26) | `{ weeks, cohorts: [{ cohortWeek, size, retention: [0..1, week0, week1, ...] }] }` (signup-week cohorts, retained = any logged-in activity that week) |
| `GET /api/analytics/recommendations` | `from,to` | `{ rows: [{ recId, impressions, clicks, completions, ctr, completionRate }], total, note }`; completion is attributed same-UTC-day |
| `GET /api/analytics/users/engagement` | `page` (0-based), `size` (max 100) | paged (`items,total,currentPage,pageSize`) of `{ userId, name, email, score, level, churnRisk, atRisk, lastActiveAt, activeDays30d, reads30d, lessonsCompleted30d }` sorted by score within the page |

Engagement formula (30 days): `40*min(activeDays/12,1) + 20*min(reads/15,1) + 20*min(lessonsCompleted/8,1) + 10 (any enrollment) + 10 (completed a course)`; level `high>=70`, `medium>=40`, `low>=15`, else `dormant`. Churn risk: accounts under 7 days old are `new`; idle (last event, login or signup) 30+ days is `high`; 14+ days is `high` with an active enrollment else `medium`; 7+ days is `medium` with an active enrollment else `low`. `atRisk` is true for `high` and `medium`.

## 3. Privacy and self-service

| Route | Body | `data` |
|---|---|---|
| `GET /api/privacy/retention` (public) | | `{ consentPolicyVersion, analyticsRawEventsDays, analyticsRollupDays, readNotificationsDays, sentEmailLogDays, accountDeletion }` |
| `GET /api/users/me/consent` | | `{ current: ConsentRecord\|null, currentPolicyVersion, needsReconsent, history: ConsentRecord[] }` |
| `POST /api/users/me/consent` (201) | `{ policyVersion (<=32), analytics, personalization, marketing }` | same as GET. Append-only history |
| `GET /api/users/me/export` | | JSON download: `account, enrollments, certificates, assessment_attempts, notifications, learning_profiles, preferences, consents, linked_identities, notes, highlights, favourites, reactions, exportedAt, exportVersion`. No credentials |
| `DELETE /api/users/me` | `{ password? }` | `{ message }`. Needs a login within the re-auth window (5 min) else send the password; otherwise `403 { code: "reauth_required" }`. Revokes all sessions, purges analytics events, reactions, notes, highlights, favourites, notifications, preferences, consents, identities and queued email, scrubs comment author name/email and certificate recipient name, anonymises and soft-deletes the user. `409` if the user is the last admin |
| `PUT /api/users/me` | any of `{ name, mobileNo, avatarUrl, bio, location, jobTitle }` | `{ id, email, name, mobileNo, avatarUrl, bio, location, jobTitle }`. Name 1-100 chars; phone `+` digits/spaces/()-, empty clears; avatar must be `https://` or `/uploads/...` (<=1024); bio <=500; location/jobTitle <=120. Status, groups and email cannot be changed here. `400` on validation errors |

## 4. Notification preferences

`GET /api/users/me/preferences` and `PUT /api/users/me/preferences` (partial update). Shape:

```jsonc
{
  "notifications": {                       // per type, all keys always present on GET
    "review_decision":   { "inApp": true, "email": true },
    "review_assigned":   { "inApp": true, "email": true },
    "content_published": { "inApp": true, "email": true },
    "comment_reply":     { "inApp": true, "email": true },
    "comment_mention":   { "inApp": true, "email": true },
    "enrollment":        { "inApp": true, "email": false },
    "course_completed":  { "inApp": true, "email": true },
    "welcome":           { "inApp": true, "email": true }
  },
  "digestFrequency": "weekly",             // off | daily | weekly
  "emailUnsubscribed": false,              // global email kill switch
  "privacy":    { "profilePublic": false, "showActivity": false },
  "appearance": { "theme": "system", "language": "en" },   // theme: system|light|dark; language: ISO code
  "profile":    { "bio": "", "location": "", "jobTitle": "" }  // read-only here; edit via PUT /api/users/me
}
```

PUT accepts the same keys with all fields optional, for example `{ "notifications": { "comment_reply": { "email": false } }, "digestFrequency": "off" }`. Unknown types or values return `400`.

`GET /api/notifications` items now include `type` (one of the keys above or `general`).

Unsubscribe links in emails point to `GET {APP_BASE_URL}/api/notifications/unsubscribe?token=...` (HTML confirmation page; `POST` performs it and is the RFC 8058 one-click target). It sets `emailUnsubscribed=true` and `digestFrequency=off`.

### Triggers

In-app notification and (if allowed) email are created for: review decision (approve, send back, reject) to the content owner; reviewer assigned (assign or submit with reviewer) to the reviewer; published to the owner; comment reply to the parent author; `@user@example.com` mention in a comment; course completed (via the enrollment module); welcome (once, after email verification); weekly or daily digest of newly published content. Emails go to verified addresses only and honour per-type preferences and the global unsubscribe. Verification and password-reset emails reuse the identity module and are routed through the same retrying queue (not subject to preferences).

Other modules call `notification.Service.Notify(ctx, notification.Notice{UserID, Type, Title, Message, Link, EmailTemplate, EmailData, DedupeKey})` (type `notification.Notifier`); `Create(ctx,userID,title,message,link)` still works and always creates a `general` in-app notification. Server-side analytics: `analytics.Service.TrackEvent(ctx, eventType, userID, contentID, contentType, metadata)`; `analytics.LegacyTracker{Service}` adapts the old 8-argument form.

## 5. Observability

* `GET /metrics` (Prometheus text): bearer `METRICS_TOKEN`, or an admin session. Set `METRICS_ADDR` (for example `127.0.0.1:9090`) to serve `/metrics` on an internal listener without auth and remove it from the public router.
* Series: `http_requests_total{method,route,status}`, `http_request_duration_seconds{method,route}`, `db_pool_*{pool="write|read"}`, `analytics_queue_depth`, `analytics_events_dropped_total`, Go and process collectors.
* Every response carries `X-Request-ID` (a valid inbound id is kept, otherwise generated); request logs include `request_id`.

## 6. Environment

`ANALYTICS_IP_SALT` (set a stable secret in production), `ANALYTICS_RAW_RETENTION_DAYS` (90), `ANALYTICS_ROLLUP_RETENTION_DAYS` (730), `ANALYTICS_QUEUE_SIZE` (5000), `ANALYTICS_ROLLUP_ENABLED` (true), `APP_BASE_URL` (public API base for unsubscribe links), `EMAIL_WORKER_ENABLED` (true), `EMAIL_MAX_ATTEMPTS` (6), `DIGEST_ENABLED` (true), `RETENTION_EMAIL_QUEUE_DAYS` (30), `RETENTION_NOTIFICATIONS_DAYS` (180, read notifications), `CONSENT_POLICY_VERSION` (2026-01), `METRICS_ADDR`, `METRICS_TOKEN`. Uses the existing `SMTP_*` and `FRONTEND_URL`. Without `SMTP_HOST` the worker logs emails and marks them sent outside production; in production they retry with backoff (30s doubling, max 1h) and become `dead` after the maximum attempts.
