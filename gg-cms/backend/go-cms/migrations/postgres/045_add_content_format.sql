-- Migration 045: Add content_format discriminator column to articles and courses.
-- 'blocks' (custom block editor JSON array), 'html' (legacy raw HTML),
-- 'tiptap' (new WYSIWYG editor JSON doc). Backfilled by sniffing existing body shape.

ALTER TABLE articles ADD COLUMN IF NOT EXISTS content_format VARCHAR(20) NOT NULL DEFAULT 'blocks';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS content_format VARCHAR(20) NOT NULL DEFAULT 'blocks';

UPDATE articles
SET content_format = 'html'
WHERE body IS NOT NULL AND btrim(body) <> '' AND left(btrim(body), 1) <> '[';

UPDATE courses
SET content_format = 'html'
WHERE body IS NOT NULL AND btrim(body) <> '' AND left(btrim(body), 1) <> '[';
