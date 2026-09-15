-- Phase P1: Navigation Architecture & Staged Category Migration
-- Creates domains table, links categories to domains, and introduces content_categories junction table.

-- 1. domains table
CREATE TABLE IF NOT EXISTS domains (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    slug        VARCHAR(220) NOT NULL UNIQUE,
    description TEXT,
    icon        VARCHAR(100),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domains_slug ON domains(slug);

-- 2. add domain_id to categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS domain_id BIGINT REFERENCES domains(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_categories_domain ON categories(domain_id);

-- 3. content_categories junction table
CREATE TABLE IF NOT EXISTS content_categories (
    content_id   BIGINT NOT NULL,
    content_type VARCHAR(20) NOT NULL,
    category_id  BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    is_primary   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (content_id, content_type, category_id)
);

CREATE INDEX IF NOT EXISTS idx_content_categories_cat ON content_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_content_categories_primary ON content_categories(content_id, content_type, is_primary);

-- 4. Seed initial domains matching §7 categories
INSERT INTO domains (name, slug, description) VALUES
('Software Engineering', 'software-engineering', 'Programming languages, backend systems, and software design principles'),
('Cloud & Infrastructure', 'cloud-infrastructure', 'Cloud platforms, DevOps, containers, and IaC'),
('Cybersecurity', 'cybersecurity', 'Identity, cryptography, threat modeling, and application security'),
('Data', 'data', 'Databases, data pipelines, and analytics engineering'),
('AI & Machine Learning', 'ai-machine-learning', 'Machine learning foundations, deep learning, and generative AI')
ON CONFLICT (slug) DO NOTHING;

-- Backfill categories.domain_id for top-level categories
UPDATE categories SET domain_id = (SELECT id FROM domains WHERE slug = 'software-engineering') WHERE slug = 'software-engineering';
UPDATE categories SET domain_id = (SELECT id FROM domains WHERE slug = 'cloud-infrastructure') WHERE slug = 'cloud-infrastructure';
UPDATE categories SET domain_id = (SELECT id FROM domains WHERE slug = 'cybersecurity') WHERE slug = 'cybersecurity';
UPDATE categories SET domain_id = (SELECT id FROM domains WHERE slug = 'data') WHERE slug = 'data';
UPDATE categories SET domain_id = (SELECT id FROM domains WHERE slug = 'ai-machine-learning') WHERE slug = 'ai-machine-learning';

-- Backfill child categories domain_id from parent category
UPDATE categories c SET domain_id = p.domain_id FROM categories p WHERE c.parent_id = p.id AND c.domain_id IS NULL;

-- 5. Staged migration phase (A): Backfill existing Article/Course CategoryID into content_categories
INSERT INTO content_categories (content_id, content_type, category_id, is_primary)
SELECT id, 'ARTICLE', category_id, TRUE FROM articles WHERE category_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO content_categories (content_id, content_type, category_id, is_primary)
SELECT id, 'COURSE', category_id, TRUE FROM courses WHERE category_id IS NOT NULL
ON CONFLICT DO NOTHING;
