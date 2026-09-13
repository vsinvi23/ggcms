-- Migration 013: Add slug column to articles and courses
ALTER TABLE articles ADD COLUMN IF NOT EXISTS slug VARCHAR(600) NOT NULL DEFAULT '';
ALTER TABLE courses  ADD COLUMN IF NOT EXISTS slug VARCHAR(600) NOT NULL DEFAULT '';

-- Backfill: lowercase title → replace non-alphanumeric runs with '-' → trim leading/trailing dashes
UPDATE articles
SET slug = REGEXP_REPLACE(
               REGEXP_REPLACE(LOWER(title), '[^a-z0-9]+', '-', 'g'),
               '^-+|-+$', '', 'g'
           )
WHERE slug = '';

UPDATE courses
SET slug = REGEXP_REPLACE(
               REGEXP_REPLACE(LOWER(title), '[^a-z0-9]+', '-', 'g'),
               '^-+|-+$', '', 'g'
           )
WHERE slug = '';

-- Index for fast slug lookup (not unique — duplicates handled at application layer)
CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles (slug);
CREATE INDEX IF NOT EXISTS idx_courses_slug  ON courses  (slug);
