# Social Login — Product & Technical Specification

Status: DRAFT v1 · Owner: Product · Audience: Product, Backend, Frontend, Security, QA
Scope: GeekGully / GG-CMS learner platform (`gg-cms/backend/go-cms`, `gg-cms/frontend/react-ui`)

---

## 1. Why

Sign-up friction is the first funnel drop-off for a learning portal. Most of our audience (developers, security and cloud engineers) already holds Google, GitHub or LinkedIn accounts. Social login lifts sign-up conversion, removes password-management burden, and gives us a verified email for free, which we currently never obtain (no email verification exists).

### Success metrics
| Metric | Baseline | Target (90 days post-launch) |
|---|---|---|
| Visitor → registered conversion | measure first (no events today) | +25% relative |
| % of new accounts via social | 0 | ≥ 55% |
| Sign-up completion time | unknown | < 20 s |
| Account-takeover incidents | n/a | 0 |
| Support tickets "can't log in" | measure | −30% |

## 2. Current state (verified in code)

| Area | Finding |
|---|---|
| Providers | Google and GitHub only: server-side authorization-code flow (`internal/application/oauth/service.go`, `handler/oauth_handler.go`). Disabled by flag `feature.social_login` (seeded false, forced false in migration). |
| LinkedIn / Microsoft / Apple | Do not exist. |
| State | Stateless `nonce.HMAC(JWT_SECRET)`; not bound to browser, no expiry, replayable → login-CSRF possible. |
| PKCE / nonce / id_token | None. Access token used to call userinfo. |
| Email verified | Google `verified_email` ignored. No email verification anywhere. |
| Account linking | Automatic by raw-string email match; runs on *any* ID-lookup error; silently overwrites existing provider ID. |
| Data model | `google_id`, `github_id` columns on `users`. No identity table. |
| Session | One HS256 JWT (24 h) in HttpOnly cookie; no refresh, no revocation; logout only clears cookies. |
| Frontend | Buttons in `Auth.tsx` / `AuthModal.tsx` behind flag; `OAuthCallback.tsx` hydrates from cookie via `/users/me`. Comment claiming token-in-URL is stale (token is not in URL — good). |
| Errors | Raw `err.Error()` placed in redirect query string. |
| Roles | Three divergent admin-role resolvers; OAuth email-link path does not preload groups. |

**Conclusion:** the happy path works but is not safe to enable. The existing code should be treated as a prototype and re-built on the design below rather than switched on.

## 3. Scope

### In scope (v1)
- Providers: **Google (OIDC)**, **GitHub (OAuth2)**, **LinkedIn (OIDC "Sign In with LinkedIn")**.
- Sign-in, sign-up, and link/unlink from account settings.
- Verified-email-only account linking with explicit confirmation.
- Email verification for local accounts (prerequisite).
- Session hardening needed to make social login safe (refresh + revocation).

### v1.1
Microsoft (Entra ID, personal + work), Apple (required if an iOS app is ever shipped).

### Out of scope
SAML/enterprise SSO, phone-OTP login, passkeys (recommended as a follow-on; the identity table below accommodates them).

## 4. User stories & acceptance criteria

**US-1 New user signs up with Google/GitHub/LinkedIn**
- Given no account exists for the provider identity or its verified email, when the user completes consent, then an account is created with status ACTIVE, `email_verified=true`, default group "Learner" and the user lands on onboarding (`OnboardingWizard`), then on the page they were trying to reach.
- If the provider returns no verified email (e.g. GitHub private email with no verified address) → show "We need a verified email" screen; allow the user to enter an email and verify it by link before account creation.

**US-2 Returning user signs in**
- Lookup is by `(provider, provider_user_id)` only — never by email. `last_login` updated; audit event written.

**US-3 Existing local user, same verified email, first social login**
- No silent link. Show "An account with this email exists. Confirm it's you" and require either (a) password entry for that account, or (b) a one-time link emailed to the address. After success, the identity is linked and the event audited and emailed ("Google was linked to your account").
- If the local account's email was never verified, the local account is treated as untrusted: the social identity wins, the unverified password is invalidated, and sessions are revoked (anti pre-hijack).

**US-4 Link / unlink**
- Account Settings → "Connected accounts" lists providers with linked date and provider email. Link requires fresh login (≤ 5 min). Unlink is blocked if it would leave the account with no login method; user must first set a password or link another provider.

**US-5 Social-only user wants a password**
- "Set password" in settings (requires recent re-auth). Password reset on a social-only account does not auto-enable local login without verified email possession (it already requires the emailed token).

**US-6 Admin**
- Admin/SuperAdmin roles are never granted by social login. Admin accounts must additionally pass the same-provider link flow and, recommended, MFA (see §10).

**US-7 Error handling**
- All failures redirect to `/auth/callback?error=<code>` with a fixed enum code; UI maps code → message. No provider/internal error text is ever reflected.

### Error code enum
`access_denied`, `invalid_state`, `provider_error`, `email_unverified`, `email_missing`, `account_disabled`, `link_required`, `identity_already_linked`, `provider_disabled`, `rate_limited`, `server_error`.

## 5. Target architecture

```
Browser ──(1) GET /api/auth/{provider}/start?redirect=/x──▶ API
   ◀── 302 to provider  (Set-Cookie: oauth_tx=<signed, HttpOnly, SameSite=Lax, 10 min>)
Browser ──(2) provider consent──▶ Provider
Provider ──(3) 302 /api/auth/{provider}/callback?code&state──▶ API
API: verify oauth_tx cookie ↔ state, single-use, expiry; exchange code with PKCE verifier;
     validate id_token (iss, aud, exp, nonce, signature via JWKS) or fetch userinfo (GitHub);
     resolve identity → login | create | link-required | email-needed
API ──(4) 302 /auth/callback?status=ok|link_required|error=<code>  + session cookies──▶ SPA
SPA: GET /api/users/me → hydrate; or show link-confirmation screen
```

### 5.1 Transaction state (replaces stateless HMAC state)
- On `start`: generate `state` (32 B), `nonce` (32 B), `code_verifier` (43–128 chars). Store server-side (Redis, or Postgres table `oauth_transactions` if Redis is not available) keyed by `state` with `{provider, nonce, code_verifier, redirect_path, created_at, expires_at=+10m, used=false, intent: login|link, link_user_id?}`.
- Also set an HttpOnly `oauth_tx` cookie containing a random binding value; the callback must present both. This binds the flow to the initiating browser (login-CSRF fix).
- Consume atomically on callback (single-use). Reject expired/replayed/provider-mismatched state with `invalid_state`.
- `redirect` is a **relative path allow-list** (must start with `/`, not `//`, no scheme) — prevents open redirect.
- Use a separate `OAUTH_STATE_SECRET` if any signing is used; do not reuse `JWT_SECRET`.

### 5.2 Provider specifics
| | Google | GitHub | LinkedIn |
|---|---|---|---|
| Protocol | OIDC auth-code + PKCE (S256) | OAuth2 auth-code + PKCE (supported) | OIDC auth-code |
| Scopes | `openid email profile` | `read:user user:email` | `openid profile email` |
| Identity key | `sub` | numeric `id` | `sub` |
| Email trust | require `email_verified=true` in validated id_token | call `/user/emails`, use only `primary && verified` | `email_verified` claim |
| Notes | Reject unverified. Treat `hd` (Workspace) as informational. | Never trust `/user.email` unless confirmed verified in `/user/emails`. Check HTTP status of every call. | Confirm app is approved for "Sign In with LinkedIn using OpenID Connect" product. |
Provider enablement is per-provider config; the server refuses to start a flow for a provider with missing client id/secret (`provider_disabled`), and the `/api/auth/providers` endpoint tells the SPA which buttons to render (replaces the single global flag).

### 5.3 Data model (new migration)
```sql
ALTER TABLE users
  ADD COLUMN email_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN email_verified_at  TIMESTAMPTZ,
  ADD COLUMN password_set       BOOLEAN NOT NULL DEFAULT TRUE,   -- FALSE for social-only
  ADD COLUMN avatar_url         TEXT,
  ADD COLUMN token_version      INTEGER NOT NULL DEFAULT 0;      -- bump to revoke sessions
CREATE UNIQUE INDEX idx_users_email_lower ON users (lower(email)) WHERE deleted_at IS NULL;

CREATE TABLE user_identities (
  id               BIGSERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         VARCHAR(32)  NOT NULL,           -- google|github|linkedin|microsoft|apple
  provider_user_id VARCHAR(255) NOT NULL,
  provider_email   VARCHAR(320),
  email_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  display_name     VARCHAR(255),
  avatar_url       TEXT,
  linked_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at    TIMESTAMPTZ,
  UNIQUE (provider, provider_user_id)
);
CREATE INDEX idx_user_identities_user ON user_identities(user_id);

CREATE TABLE oauth_transactions (            -- only if Redis not used
  state VARCHAR(64) PRIMARY KEY, provider VARCHAR(32) NOT NULL,
  nonce VARCHAR(64) NOT NULL, code_verifier VARCHAR(128) NOT NULL,
  intent VARCHAR(8) NOT NULL, link_user_id INTEGER, redirect_path VARCHAR(512),
  expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ
);

CREATE TABLE email_verification_tokens (
  id UUID PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(320) NOT NULL, token_hash CHAR(64) NOT NULL,
  purpose VARCHAR(16) NOT NULL,              -- verify_email | confirm_link
  pending_identity JSONB,                    -- for confirm_link
  expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ
);
```
Backfill: copy existing `google_id`/`github_id` into `user_identities` (provider email unknown → null, `email_verified=false`), then drop the columns in a later release. Email lowercasing migration must first detect case-collisions and report them for manual merge.

### 5.4 Backend components
- `internal/application/identity` (new): `ResolveLogin(provider, claims) → {Login|Create|LinkRequired|EmailNeeded}`; single place for linking rules.
- `internal/application/oauth`: provider adapters behind one interface `Provider{ AuthURL(tx), Exchange(code, verifier) → Claims }`; JWKS caching for OIDC providers.
- One shared `RoleResolver` used by local login, OAuth and `/users/me` (removes the 3 divergent copies); always preload groups; fail closed on lookup error.
- Never fall back to `FindByEmail` on a generic error; only on `ErrNotFound` and only to *offer* link-required.
- Routes (public, all under the `AuthRateLimit` limiter + per-IP callback limiter):
  - `GET /api/auth/providers`
  - `GET /api/auth/{provider}/start`
  - `GET /api/auth/{provider}/callback`
  - `POST /api/auth/link/confirm` (password or emailed token)
  - `POST /api/auth/email/verify`, `POST /api/auth/email/resend`
  - Authenticated: `GET /api/users/me/identities`, `POST /api/users/me/identities/{provider}/link`, `DELETE /api/users/me/identities/{provider}`
- Audit events: `auth.social.login`, `auth.social.signup`, `auth.identity.linked`, `auth.identity.unlinked`, `auth.link.rejected`, `auth.state.invalid`.
- Config validation at boot: each enabled provider requires id, secret, https redirect URL in non-dev; `JWT_SECRET` ≥ 32 bytes.

### 5.5 Session hardening (prerequisite)
- Access JWT 15 min with `iss`, `aud`, `jti`, `token_version`; opaque rotating refresh token (HttpOnly cookie, 30 d, hashed in DB, reuse detection → revoke family).
- Middleware compares `token_version` (cached) so deactivation, role change, password reset and unlink can revoke immediately.
- `logout` revokes refresh family; `logout-all` bumps `token_version`.
- Stop writing the JWT to `localStorage`/`sessionStorage` on local login; cookie only.

### 5.6 Frontend
- Replace single `social_login` flag with `GET /api/auth/providers`.
- Branded buttons per provider (follow each provider's brand guidelines; Google button must use official styling), in `Auth.tsx` and `AuthModal.tsx`.
- `OAuthCallback.tsx`: handle `status=ok`, `link_required` (confirmation screen), `email_needed`, and enum `error` codes via a fixed message map (unknown → generic).
- New Settings section "Connected accounts" (link/unlink, last used, "set password").
- Preserve intended destination via validated relative `redirect`.
- Analytics events: `login_started`, `login_succeeded`, `signup_succeeded`, `link_required_shown`, `login_failed{code}`.
- i18n-ready strings; keyboard accessible; visible focus; buttons labelled "Continue with …".

## 6. Rollout workflow

| Phase | Work | Exit criteria |
|---|---|---|
| 0 — Prereqs (1 wk) | Rotate secrets; untrack `.env`; lowercase-email migration; single RoleResolver; email sender (SMTP/SES) with templates | Mails delivered in staging; no case-duplicate emails |
| 1 — Foundations (1.5 wk) | Migration 5.3; email verification flow; refresh/revocation; stop localStorage JWT | Local sign-up requires verification; revocation tested |
| 2 — Core OAuth (2 wk) | Transaction store, PKCE, provider interface, Google OIDC, GitHub, identity resolution, link-confirm | Security test suite (§8) green |
| 3 — UI (1 wk) | Buttons, callback states, Connected accounts, error map | UX review + a11y pass |
| 4 — LinkedIn + hardening (1 wk) | LinkedIn adapter, rate limits, alerts, runbook | Pen-test sign-off |
| 5 — Staged release (1 wk) | Flag on for staff → 10% → 50% → 100%; dashboards | No P1 for 7 days; metrics at target |
| 6 — Cleanup | Drop `google_id`/`github_id` columns and old flag | — |

Rollback: per-provider kill switch in `app_settings`; identity data is additive so disabling does not strand users (they retain email-reset path to set a password).

## 7. Privacy & compliance (DPDP Act 2023 / GDPR)
- Request minimum scopes; store only provider id, email, name, avatar URL. Do not store provider access/refresh tokens.
- Show a consent notice and privacy-policy link on first social sign-up; record consent timestamp and policy version.
- Account deletion removes identities and revokes sessions; data-export includes linked providers.
- Document provider-side data processors in the privacy policy.

## 8. Test plan (must pass before enabling)
Security
- Replayed / expired / cross-provider / cross-browser `state` rejected.
- Missing or wrong PKCE verifier and wrong `nonce` rejected; id_token with bad `iss`/`aud`/signature/`exp` rejected.
- Google `email_verified=false` and GitHub unverified email → no link, no create.
- Pre-hijack: attacker-registered unverified local account is neutralised when the real owner signs in socially.
- Existing verified local account never auto-linked without confirmation.
- Provider-ID overwrite impossible (unique `(provider, provider_user_id)`; unlink explicit).
- Social login never yields admin role; admin seed email attack fails.
- Open redirect: `redirect=//evil.com`, `https://evil.com`, `/\evil.com` rejected.
- No internal error text reachable in any redirect.
- Rate limits trigger on `start` and `callback`.

Functional / e2e (Playwright): each provider happy path via mocked IdP, link-required flow, unlink guard (last method), deactivated user, provider outage, flag off, mobile viewport.

## 9. Risks
| Risk | Mitigation |
|---|---|
| Account takeover via email linking | Provider-verified email + confirmation + untrusted-unverified-local rule |
| Provider outage / app suspension | Local login/reset remains; per-provider kill switch |
| GitHub users without public email | Use `/user/emails`; fallback verified-email prompt |
| LinkedIn product approval delay | Ship Google+GitHub first |
| Email deliverability (SPF/DKIM/DMARC) | Phase 0 gate |
| Migration case-collisions | Pre-check report before unique index |

## 10. Open decisions for Product
1. Default group for new learners (proposed: new "Learner" group, no admin capabilities).
2. Mandatory MFA for Admin/Editor roles (recommended yes, TOTP first).
3. Redis introduction vs Postgres `oauth_transactions` table (recommended Postgres for v1).
4. Whether to allow sign-up with unverified email domains at all (recommended no).
5. Providers beyond v1 (Microsoft vs Apple priority).
