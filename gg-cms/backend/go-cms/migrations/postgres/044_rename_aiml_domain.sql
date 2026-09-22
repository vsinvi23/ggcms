-- Migration 044: Rename 'ai-machine-learning' domain to 'Artificial Intelligence'
-- In-place UPDATE (not delete+reinsert): row id is preserved, so every subcategory's
-- parent_id and every content row's category_id FK reference remains valid.
-- No rows are deleted and no content is touched.

UPDATE categories
SET name = 'Artificial Intelligence',
    slug = 'artificial-intelligence'
WHERE slug = 'ai-machine-learning';
