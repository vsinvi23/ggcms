-- Add article_type column to articles table
ALTER TABLE articles ADD COLUMN IF NOT EXISTS article_type VARCHAR(50) NOT NULL DEFAULT '';
