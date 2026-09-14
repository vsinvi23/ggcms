-- Phase P0: Content Provenance Infrastructure
-- Creates structured storage for AI content generation runs, matching factory payload fields.

CREATE TABLE IF NOT EXISTS content_generation_runs (
    id                SERIAL PRIMARY KEY,
    content_id        BIGINT NOT NULL,
    content_type      VARCHAR(20) NOT NULL,
    model             VARCHAR(100) NOT NULL,
    provider          VARCHAR(100) NOT NULL,
    prompt_version    VARCHAR(50),
    agent_version     VARCHAR(50),
    knowledge_pack_id VARCHAR(100),
    quality_score     DOUBLE PRECISION,
    quality_report    JSONB,
    generated_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gen_runs_content ON content_generation_runs(content_id, content_type);
CREATE INDEX IF NOT EXISTS idx_gen_runs_model ON content_generation_runs(model, provider);
