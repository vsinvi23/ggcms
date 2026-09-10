-- Backfill task records for articles that exist but have no owned task row.
-- This covers content created before the task system was introduced.
INSERT INTO tasks (type, title, status, ownership_type, user_id, content_id, created_at, updated_at)
SELECT
    'article',
    a.title,
    CASE a.status
        WHEN 'DRAFT'     THEN 'draft'
        WHEN 'REVIEW'    THEN 'in_review'
        WHEN 'APPROVED'  THEN 'approved'
        WHEN 'PUBLISHED' THEN 'published'
        ELSE 'draft'
    END,
    'owned',
    a.created_by_id,
    a.id,
    NOW(),
    NOW()
FROM articles a
WHERE a.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.content_id = a.id
        AND t.type = 'article'
        AND t.user_id = a.created_by_id
        AND t.ownership_type = 'owned'
        AND t.deleted_at IS NULL
  );

-- Backfill task records for courses that have no owned task row.
INSERT INTO tasks (type, title, status, ownership_type, user_id, content_id, created_at, updated_at)
SELECT
    'course',
    c.title,
    CASE c.status
        WHEN 'DRAFT'     THEN 'draft'
        WHEN 'REVIEW'    THEN 'in_review'
        WHEN 'APPROVED'  THEN 'approved'
        WHEN 'PUBLISHED' THEN 'published'
        ELSE 'draft'
    END,
    'owned',
    c.created_by_id,
    c.id,
    NOW(),
    NOW()
FROM courses c
WHERE c.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.content_id = c.id
        AND t.type = 'course'
        AND t.user_id = c.created_by_id
        AND t.ownership_type = 'owned'
        AND t.deleted_at IS NULL
  );
