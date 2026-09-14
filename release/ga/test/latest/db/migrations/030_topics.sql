-- Knowledge-graph topic registry (P0 slice of GEEKGULLY Universal Taxonomy spec).
-- Additive layer: does not touch categories/tags. Content association is polymorphic
-- (content_id + content_type), matching the existing content_reviews pattern.

CREATE TABLE IF NOT EXISTS topics (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    slug        VARCHAR(220) NOT NULL UNIQUE,
    entity_type VARCHAR(30)  NOT NULL DEFAULT 'concept',
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topics_entity_type ON topics(entity_type);

CREATE TABLE IF NOT EXISTS topic_aliases (
    id       SERIAL PRIMARY KEY,
    topic_id BIGINT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    alias    VARCHAR(200) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_aliases_alias_lower ON topic_aliases (LOWER(alias));
CREATE INDEX IF NOT EXISTS idx_topic_aliases_topic ON topic_aliases(topic_id);

CREATE TABLE IF NOT EXISTS topic_relationships (
    id                SERIAL PRIMARY KEY,
    source_topic_id   BIGINT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    target_topic_id   BIGINT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    relationship_type VARCHAR(30) NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_topic_id, target_topic_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_topic_rel_source ON topic_relationships(source_topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_rel_target ON topic_relationships(target_topic_id);

CREATE TABLE IF NOT EXISTS content_topics (
    content_id   BIGINT NOT NULL,
    content_type VARCHAR(20) NOT NULL,
    topic_id     BIGINT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    PRIMARY KEY (content_id, content_type, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_content_topics_topic ON content_topics(topic_id);
