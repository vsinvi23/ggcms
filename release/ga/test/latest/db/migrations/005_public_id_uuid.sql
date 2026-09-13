-- Migration 005: Add public_id UUID column to articles and courses
ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS public_id VARCHAR(36) UNIQUE;
ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS public_id VARCHAR(36) UNIQUE;

-- Backfill existing rows with random UUIDs
UPDATE articles SET public_id = gen_random_uuid()::text WHERE public_id IS NULL;
UPDATE courses SET public_id = gen_random_uuid()::text WHERE public_id IS NULL;

-- Make column NOT NULL after backfill
ALTER TABLE articles ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE courses ALTER COLUMN public_id SET NOT NULL;
