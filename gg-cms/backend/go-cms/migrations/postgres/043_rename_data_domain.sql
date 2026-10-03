-- Migration 043: Rename 'data' domain to 'Data & Analytics' for naming consistency
-- with sibling top-level domains (all of which use compound names).
--
-- This is an in-place UPDATE, not a delete+reinsert: the row's id is preserved,
-- so every existing subcategory's parent_id and every content row's category_id
-- FK reference remains valid. No rows are deleted and no content is touched.

UPDATE categories
SET name = 'Data & Analytics',
    slug = 'data-analytics'
WHERE slug = 'data';
