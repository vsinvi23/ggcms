-- Add slug column to learning_paths table and index it
ALTER TABLE learning_paths ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_paths_slug ON learning_paths (slug);

-- Update existing seeded learning paths with their canonical human-readable slugs
UPDATE learning_paths SET slug = 'fullstack-go-engineer-roadmap' WHERE title = 'Go Microservices & Modern Backend Engineering Roadmap' AND (slug IS NULL OR slug = '');
UPDATE learning_paths SET slug = 'ai-systems-engineer-roadmap' WHERE title = 'Enterprise AI & LLM Systems Engineering Roadmap' AND (slug IS NULL OR slug = '');
UPDATE learning_paths SET slug = 'cybersecurity-architect-roadmap' WHERE title = 'Cybersecurity & Application Defense Career Path' AND (slug IS NULL OR slug = '');
UPDATE learning_paths SET slug = 'devops-engineer-roadmap' WHERE title = 'Cloud Infrastructure & DevOps Mastery Roadmap' AND (slug IS NULL OR slug = '');

-- Fallback for any un-slugged learning paths to populate slug from title
UPDATE learning_paths SET slug = LOWER(REGEXP_REPLACE(title, '[^a-zA-Z0-9]+', '-', 'g')) WHERE slug IS NULL OR slug = '';
