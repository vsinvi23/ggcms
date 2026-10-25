-- Full-text + trigram search, search query log. Idempotent.

DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_trgm unavailable (%), search falls back to ILIKE for fuzzy matching', SQLERRM;
END $$;

ALTER TABLE articles ADD COLUMN IF NOT EXISTS level VARCHAR(20);
ALTER TABLE courses  ADD COLUMN IF NOT EXISTS level VARCHAR(20);

UPDATE articles SET level = lower(interactive_metadata->>'difficulty')
WHERE level IS NULL AND interactive_metadata IS NOT NULL
  AND lower(interactive_metadata->>'difficulty') IN ('beginner','intermediate','advanced','expert');
UPDATE courses SET level = lower(interactive_metadata->>'difficulty')
WHERE level IS NULL AND interactive_metadata IS NOT NULL
  AND lower(interactive_metadata->>'difficulty') IN ('beginner','intermediate','advanced','expert');

ALTER TABLE articles ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'C') ||
    setweight(to_tsvector('simple', regexp_replace(left(coalesce(body, ''), 100000), '"[A-Za-z_]+"\s*:|[{}\[\]"]', ' ', 'g')), 'D')
) STORED;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'C') ||
    setweight(to_tsvector('simple', regexp_replace(left(coalesce(body, ''), 100000), '"[A-Za-z_]+"\s*:|[{}\[\]"]', ' ', 'g')), 'D')
) STORED;

ALTER TABLE sections ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'C')
) STORED;

ALTER TABLE lessons ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'B') ||
    setweight(to_tsvector('simple', regexp_replace(left(coalesce(content, ''), 100000), '"[A-Za-z_]+"\s*:|[{}\[\]"]', ' ', 'g')), 'D')
) STORED;

CREATE INDEX IF NOT EXISTS idx_articles_search_vector ON articles USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_courses_search_vector  ON courses  USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_sections_search_vector ON sections USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_lessons_search_vector  ON lessons  USING gin (search_vector);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_articles_title_trgm ON articles USING gin (title gin_trgm_ops)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_courses_title_trgm ON courses USING gin (title gin_trgm_ops)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_topics_name_trgm ON topics USING gin (name gin_trgm_ops)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_categories_name_trgm ON categories USING gin (name gin_trgm_ops)';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS search_query_log (
    id           BIGSERIAL PRIMARY KEY,
    query_norm   VARCHAR(100) NOT NULL,
    result_count INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_search_query_log_created ON search_query_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_query_log_norm ON search_query_log (query_norm text_pattern_ops, created_at DESC);
