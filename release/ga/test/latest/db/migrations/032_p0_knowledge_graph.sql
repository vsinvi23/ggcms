-- Phase P0: Knowledge Graph Hardening & Protection Schema Migration
-- Updates topics, topic_aliases, topic_relationships, and content_topics per TAXONOMY_ARCHITECTURE_DECISION.md §4

-- 1. topics additions
ALTER TABLE topics ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE topics ADD COLUMN IF NOT EXISTS merged_into_topic_id BIGINT REFERENCES topics(id) ON DELETE SET NULL;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS parent_topic_id BIGINT REFERENCES topics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status);
CREATE INDEX IF NOT EXISTS idx_topics_parent ON topics(parent_topic_id);

-- 2. topic_aliases additions
ALTER TABLE topic_aliases ADD COLUMN IF NOT EXISTS normalized_alias VARCHAR(200);
ALTER TABLE topic_aliases ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

-- Backfill normalized_alias for existing rows if null
UPDATE topic_aliases SET normalized_alias = LOWER(REGEXP_REPLACE(alias, '[^a-zA-Z0-9]', '', 'g')) WHERE normalized_alias IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_aliases_normalized ON topic_aliases (LOWER(normalized_alias));

-- 3. topic_relationships additions
ALTER TABLE topic_relationships ADD COLUMN IF NOT EXISTS weight DOUBLE PRECISION NOT NULL DEFAULT 1.0;
ALTER TABLE topic_relationships ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0;
ALTER TABLE topic_relationships ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'SYSTEM';
ALTER TABLE topic_relationships ADD COLUMN IF NOT EXISTS source_reference TEXT;
ALTER TABLE topic_relationships ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE topic_relationships ADD COLUMN IF NOT EXISTS created_by BIGINT;
ALTER TABLE topic_relationships ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_topic_rel_status ON topic_relationships(status);
CREATE INDEX IF NOT EXISTS idx_topic_rel_source_type ON topic_relationships(source_type);

-- 4. content_topics additions
ALTER TABLE content_topics ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'PRIMARY';
ALTER TABLE content_topics ADD COLUMN IF NOT EXISTS weight DOUBLE PRECISION NOT NULL DEFAULT 1.0;

CREATE INDEX IF NOT EXISTS idx_content_topics_role ON content_topics(role);
