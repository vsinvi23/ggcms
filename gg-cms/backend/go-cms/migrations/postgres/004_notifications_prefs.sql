-- 004: notification types, user preferences/profile extras, consent history, email queue.
-- Idempotent: safe to re-run.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type VARCHAR(40) NOT NULL DEFAULT 'general';
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio                TEXT,
    location           VARCHAR(120),
    job_title          VARCHAR(120),
    notif_in_app       JSONB NOT NULL DEFAULT '{}'::jsonb,
    notif_email        JSONB NOT NULL DEFAULT '{}'::jsonb,
    digest_frequency   VARCHAR(10) NOT NULL DEFAULT 'weekly',
    email_unsubscribed BOOLEAN NOT NULL DEFAULT FALSE,
    unsubscribe_token  VARCHAR(64),
    last_digest_at     TIMESTAMPTZ,
    profile_public     BOOLEAN NOT NULL DEFAULT FALSE,
    show_activity      BOOLEAN NOT NULL DEFAULT FALSE,
    theme              VARCHAR(10) NOT NULL DEFAULT 'system',
    language           VARCHAR(10) NOT NULL DEFAULT 'en',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_preferences_unsub ON user_preferences(unsubscribe_token) WHERE unsubscribe_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_consents (
    id              BIGSERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    policy_version  VARCHAR(32) NOT NULL,
    analytics       BOOLEAN NOT NULL DEFAULT FALSE,
    personalization BOOLEAN NOT NULL DEFAULT FALSE,
    marketing       BOOLEAN NOT NULL DEFAULT FALSE,
    ip_hash         VARCHAR(32),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_consents_user ON user_consents(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS email_queue (
    id              BIGSERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    to_email        VARCHAR(320) NOT NULL,
    template        VARCHAR(40) NOT NULL,
    subject         VARCHAR(255) NOT NULL DEFAULT '',
    data            JSONB NOT NULL DEFAULT '{}'::jsonb,
    status          VARCHAR(12) NOT NULL DEFAULT 'pending',
    attempts        INTEGER NOT NULL DEFAULT 0,
    max_attempts    INTEGER NOT NULL DEFAULT 6,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_until    TIMESTAMPTZ,
    last_error      TEXT,
    dedupe_key      VARCHAR(120),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at         TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_dedupe ON email_queue(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_queue_due ON email_queue(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_email_queue_user ON email_queue(user_id);
