-- Migration 042: Seed AI Operations/Lifecycle Subcategories & Extended Platform/Security Subcategories
-- Adds subcategories for AI infra/eval/governance/edge content (under existing 'ai-machine-learning'
-- domain, which already covers ML/DL/GenAI as the broader AI umbrella), plus Platform Engineering
-- (under 'cloud-infrastructure') and Security Fundamentals (under 'cybersecurity').

DO $$
DECLARE
    cloud_id BIGINT;
    sec_id BIGINT;
    aiml_id BIGINT;
BEGIN
    SELECT id INTO cloud_id FROM categories WHERE slug = 'cloud-infrastructure';
    SELECT id INTO sec_id FROM categories WHERE slug = 'cybersecurity';
    SELECT id INTO aiml_id FROM categories WHERE slug = 'ai-machine-learning';

    -- Cloud & Infrastructure
    IF cloud_id IS NOT NULL THEN
        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Platform Engineering', 'platform-engineering', cloud_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;
    END IF;

    -- Cybersecurity
    IF sec_id IS NOT NULL THEN
        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Security Fundamentals', 'security-fundamentals', sec_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;
    END IF;

    -- AI & Machine Learning
    IF aiml_id IS NOT NULL THEN
        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('AI Infrastructure', 'ai-infrastructure', aiml_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('AI Evaluation', 'ai-evaluation', aiml_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('AI Governance', 'ai-governance', aiml_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('AI Software Engineering', 'ai-software-engineering', aiml_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Edge & Physical AI', 'edge-physical-ai', aiml_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;
    END IF;
END $$;

-- 2. SEED SPECIALIZED SME TAGS
INSERT INTO tags (name, created_at, updated_at)
VALUES
  -- Platform Engineering
  ('Internal Developer Platform', NOW(), NOW()),
  ('GPU Scheduling',               NOW(), NOW()),
  ('FinOps',                       NOW(), NOW()),
  ('Golden Paths',                 NOW(), NOW()),

  -- Security Fundamentals
  ('Zero Trust',                   NOW(), NOW()),
  ('Threat Modeling',              NOW(), NOW()),
  ('CIA Triad',                    NOW(), NOW()),
  ('Incident Response',            NOW(), NOW()),

  -- AI Infrastructure
  ('Model Serving',                NOW(), NOW()),
  ('KV Cache',                     NOW(), NOW()),
  ('Inference Autoscaling',        NOW(), NOW()),

  -- AI Evaluation
  ('LLM-as-Judge',                 NOW(), NOW()),
  ('Golden Datasets',              NOW(), NOW()),
  ('Eval Harness',                 NOW(), NOW()),

  -- AI Governance
  ('Model Cards',                  NOW(), NOW()),
  ('Responsible AI',               NOW(), NOW()),
  ('AI Audit Trails',              NOW(), NOW()),

  -- AI Software Engineering
  ('Coding Agents',                NOW(), NOW()),
  ('Agentic Dev Tooling',          NOW(), NOW()),

  -- Edge & Physical AI
  ('On-Device Inference',          NOW(), NOW()),
  ('Model Quantization',           NOW(), NOW())

ON CONFLICT (LOWER(name)) DO NOTHING;

-- 3. LINK TAGS TO CATEGORIES
INSERT INTO category_tags (category_id, tag_id)
SELECT c.id, t.id
FROM categories c
CROSS JOIN tags t
WHERE c.slug = 'platform-engineering' AND t.name IN ('Internal Developer Platform', 'GPU Scheduling', 'FinOps', 'Golden Paths')
ON CONFLICT DO NOTHING;

INSERT INTO category_tags (category_id, tag_id)
SELECT c.id, t.id
FROM categories c
CROSS JOIN tags t
WHERE c.slug = 'security-fundamentals' AND t.name IN ('Zero Trust', 'Threat Modeling', 'CIA Triad', 'Incident Response')
ON CONFLICT DO NOTHING;

INSERT INTO category_tags (category_id, tag_id)
SELECT c.id, t.id
FROM categories c
CROSS JOIN tags t
WHERE c.slug = 'ai-infrastructure' AND t.name IN ('Model Serving', 'KV Cache', 'Inference Autoscaling')
ON CONFLICT DO NOTHING;

INSERT INTO category_tags (category_id, tag_id)
SELECT c.id, t.id
FROM categories c
CROSS JOIN tags t
WHERE c.slug = 'ai-evaluation' AND t.name IN ('LLM-as-Judge', 'Golden Datasets', 'Eval Harness')
ON CONFLICT DO NOTHING;

INSERT INTO category_tags (category_id, tag_id)
SELECT c.id, t.id
FROM categories c
CROSS JOIN tags t
WHERE c.slug = 'ai-governance' AND t.name IN ('Model Cards', 'Responsible AI', 'AI Audit Trails')
ON CONFLICT DO NOTHING;

INSERT INTO category_tags (category_id, tag_id)
SELECT c.id, t.id
FROM categories c
CROSS JOIN tags t
WHERE c.slug = 'ai-software-engineering' AND t.name IN ('Coding Agents', 'Agentic Dev Tooling')
ON CONFLICT DO NOTHING;

INSERT INTO category_tags (category_id, tag_id)
SELECT c.id, t.id
FROM categories c
CROSS JOIN tags t
WHERE c.slug = 'edge-physical-ai' AND t.name IN ('On-Device Inference', 'Model Quantization')
ON CONFLICT DO NOTHING;
