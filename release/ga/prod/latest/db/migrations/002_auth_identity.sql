-- 002: session model, email verification, social identities, case-insensitive email.
-- Idempotent: safe to re-run.

-- Pre-check: abort loudly (listing the offending addresses) if lower-casing the
-- email column would collide. Duplicates must be merged manually first.
DO $$
DECLARE
    collisions TEXT;
BEGIN
    SELECT string_agg(lk || ' (' || cnt || ' rows)', '; ')
      INTO collisions
      FROM (
        SELECT lower(btrim(email)) AS lk, count(*) AS cnt
          FROM users
         GROUP BY 1
        HAVING count(*) > 1
      ) c;
    IF collisions IS NOT NULL THEN
        RAISE EXCEPTION 'users.email case-insensitive collisions must be merged manually before migration 002 can run: %', collisions;
    END IF;
END $$;

UPDATE users SET email = lower(btrim(email)) WHERE email <> lower(btrim(email));

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_set      BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version     INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email)) WHERE deleted_at IS NULL;

-- Default group for self-registered / social users (no admin capability).
INSERT INTO groups (name, role, created_at, updated_at)
VALUES ('Learner', 'viewer', NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id   UUID NOT NULL,
    token_hash  CHAR(64) NOT NULL,
    auth_time   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    revoked_at  TIMESTAMPTZ,
    user_agent  VARCHAR(255),
    ip          VARCHAR(64),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

CREATE TABLE IF NOT EXISTS user_identities (
    id               BIGSERIAL PRIMARY KEY,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider         VARCHAR(32)  NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    provider_email   VARCHAR(320),
    email_verified   BOOLEAN NOT NULL DEFAULT FALSE,
    display_name     VARCHAR(255),
    avatar_url       TEXT,
    linked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at    TIMESTAMPTZ,
    UNIQUE (provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);

INSERT INTO user_identities (user_id, provider, provider_user_id, email_verified)
SELECT id, 'google', google_id, FALSE FROM users WHERE google_id IS NOT NULL
ON CONFLICT (provider, provider_user_id) DO NOTHING;

INSERT INTO user_identities (user_id, provider, provider_user_id, email_verified)
SELECT id, 'github', github_id, FALSE FROM users WHERE github_id IS NOT NULL
ON CONFLICT (provider, provider_user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS oauth_transactions (
    state          VARCHAR(64) PRIMARY KEY,
    provider       VARCHAR(32)  NOT NULL,
    nonce          VARCHAR(64)  NOT NULL,
    code_verifier  VARCHAR(128) NOT NULL,
    binding_hash   CHAR(64)     NOT NULL,
    intent         VARCHAR(8)   NOT NULL,
    link_user_id   INTEGER,
    redirect_path  VARCHAR(512),
    expires_at     TIMESTAMPTZ NOT NULL,
    used_at        TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oauth_transactions_expires ON oauth_transactions(expires_at);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id               UUID PRIMARY KEY,
    user_id          INTEGER REFERENCES users(id) ON DELETE CASCADE,
    email            VARCHAR(320) NOT NULL,
    token_hash       CHAR(64) NOT NULL,
    purpose          VARCHAR(24) NOT NULL,
    pending_identity JSONB,
    expires_at       TIMESTAMPTZ NOT NULL,
    used_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_verification_tokens_hash ON email_verification_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user ON email_verification_tokens(user_id);
