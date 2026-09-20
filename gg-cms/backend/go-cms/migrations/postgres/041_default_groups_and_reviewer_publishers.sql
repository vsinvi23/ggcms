-- Migration 041: Ensure default groups, reviewer/publisher links for all categories, and admin membership

-- 1. Ensure default groups exist
INSERT INTO groups (name) VALUES 
    ('Admin'),
    ('Editor'),
    ('Viewer'),
    ('Moderator'),
    ('Reviewer'),
    ('Publisher')
ON CONFLICT (name) DO NOTHING;

-- 2. Link Admin, Reviewer, Publisher, Editor, Moderator groups to ALL categories in category_reviewer_groups
INSERT INTO category_reviewer_groups (category_id, group_id)
SELECT c.id, g.id
FROM categories c
CROSS JOIN groups g
WHERE g.name IN ('Admin', 'Reviewer', 'Publisher', 'Moderator', 'Editor')
  AND c.deleted_at IS NULL
  AND g.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- 3. Add all users who are in 'Admin' group to ALL groups by default
INSERT INTO user_groups (user_id, group_id)
SELECT DISTINCT ug.user_id, g.id
FROM user_groups ug
JOIN groups ag ON ug.group_id = ag.id AND ag.name = 'Admin'
CROSS JOIN groups g
WHERE g.deleted_at IS NULL
ON CONFLICT DO NOTHING;
