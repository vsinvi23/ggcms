-- 006: in-CMS AI layer (usage accounting, drafts, tutor corpus + conversations, moderation queue).
-- Idempotent: safe to re-run. AI is disabled by default via app_settings (ai.enabled).

CREATE TABLE IF NOT EXISTS ai_usage (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             BIGINT REFERENCES users(id) ON DELETE SET NULL,
    task                VARCHAR(40) NOT NULL,
    model               VARCHAR(80) NOT NULL DEFAULT '',
    input_tokens        INTEGER NOT NULL DEFAULT 0,
    output_tokens       INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens   INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens  INTEGER NOT NULL DEFAULT 0,
    cost_micro_usd      BIGINT NOT NULL DEFAULT 0,
    latency_ms          INTEGER NOT NULL DEFAULT 0,
    status              VARCHAR(20) NOT NULL DEFAULT 'ok',
    error_code          VARCHAR(40) NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage (created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON ai_usage (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_task_created ON ai_usage (task, created_at);

CREATE TABLE IF NOT EXISTS ai_drafts (
    id              VARCHAR(36) PRIMARY KEY,
    kind            VARCHAR(30) NOT NULL,
    content_type    VARCHAR(20) NOT NULL,
    content_id      BIGINT NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    status          VARCHAR(20) NOT NULL DEFAULT 'draft',
    created_by_id   BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_by_id  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_content ON ai_drafts (content_type, content_id, kind);

CREATE TABLE IF NOT EXISTS content_chunks (
    id              BIGSERIAL PRIMARY KEY,
    content_type    VARCHAR(20) NOT NULL,
    content_id      BIGINT NOT NULL,
    ordinal         INTEGER NOT NULL,
    title           TEXT NOT NULL DEFAULT '',
    heading         TEXT NOT NULL DEFAULT '',
    anchor          VARCHAR(200) NOT NULL DEFAULT '',
    body            TEXT NOT NULL,
    source_stamp    TIMESTAMPTZ NOT NULL,
    tsv             TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(heading, '') || ' ' || body)) STORED,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (content_type, content_id, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_content_chunks_tsv ON content_chunks USING GIN (tsv);
CREATE INDEX IF NOT EXISTS idx_content_chunks_content ON content_chunks (content_type, content_id);

CREATE TABLE IF NOT EXISTS ai_conversations (
    id          VARCHAR(36) PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope_type  VARCHAR(20) NOT NULL,
    scope_id    BIGINT NOT NULL,
    title       VARCHAR(200) NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
    id               BIGSERIAL PRIMARY KEY,
    conversation_id  VARCHAR(36) NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role             VARCHAR(12) NOT NULL,
    content          TEXT NOT NULL,
    citations        JSONB NOT NULL DEFAULT '[]'::jsonb,
    grounded         BOOLEAN NOT NULL DEFAULT TRUE,
    rating           SMALLINT NOT NULL DEFAULT 0,
    feedback_comment VARCHAR(500) NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON ai_messages (conversation_id, id);

CREATE TABLE IF NOT EXISTS ai_moderation_items (
    id              BIGSERIAL PRIMARY KEY,
    comment_id      VARCHAR(40) NOT NULL,
    content_type    VARCHAR(20) NOT NULL DEFAULT '',
    content_id      VARCHAR(64) NOT NULL DEFAULT '',
    author_id       BIGINT NOT NULL DEFAULT 0,
    excerpt         VARCHAR(500) NOT NULL DEFAULT '',
    reasons         JSONB NOT NULL DEFAULT '[]'::jsonb,
    source          VARCHAR(20) NOT NULL DEFAULT 'heuristic',
    status          VARCHAR(20) NOT NULL DEFAULT 'pending_review',
    reviewed_by_id  BIGINT,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (comment_id)
);
CREATE INDEX IF NOT EXISTS idx_ai_moderation_status ON ai_moderation_items (status, created_at DESC);

INSERT INTO app_settings (key, value, created_at, updated_at) VALUES
    ('ai.enabled', 'false', NOW(), NOW()),
    ('ai.editorial.enabled', 'false', NOW(), NOW()),
    ('ai.moderation.enabled', 'false', NOW(), NOW()),
    ('ai.tutor.enabled', 'false', NOW(), NOW()),
    ('ai.quiz.enabled', 'false', NOW(), NOW()),
    ('ai.studyplan.enabled', 'false', NOW(), NOW())
ON CONFLICT (key) DO NOTHING;
