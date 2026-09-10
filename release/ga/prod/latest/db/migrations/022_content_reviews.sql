-- Tracks individual reviewer approvals for multi-review workflows.
-- A unique constraint prevents the same reviewer approving the same content twice.
CREATE TABLE IF NOT EXISTS content_reviews (
    id           BIGSERIAL PRIMARY KEY,
    content_id   BIGINT       NOT NULL,
    content_type VARCHAR(20)  NOT NULL,
    reviewer_id  BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reviewed_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (content_id, content_type, reviewer_id)
);
CREATE INDEX IF NOT EXISTS idx_content_reviews_content ON content_reviews(content_id, content_type);
