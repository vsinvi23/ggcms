    'Master Strategic and Tactical Domain-Driven Design, Bounded Contexts, Aggregates, Value Objects, Domain Events, and Clean Hexagonal Architecture in Go.',
    'PUBLISHED',
    c.id,
    u.id,
    'crs-e7e85c02fb15453fb1d565919a2dc1d7',
    'domain-driven-design-principles',
    NOW(),
    'TRACK'
FROM users u 
CROSS JOIN categories c 
WHERE u.email = 'admin@gg-cms.local' AND (c.slug = 'software-design' OR c.slug = 'software-design')
ON CONFLICT (public_id) DO NOTHING;


INSERT INTO courses (title, description, status, category_id, created_by_id, public_id, slug, published_at, course_type)
SELECT 
    'Mastering Go Concurrency: Goroutines, Channels, and Select Patterns',
    'A comprehensive SME-level course on building highly concurrent, lock-free, scalable backend systems in Go using worker pools, fan-out/fan-in pipelines, context cancellation, rate limiters, race detection, assessment quizzes, and interview prep.',
    'PUBLISHED',
    c.id,
    u.id,
    'crs-1f7eeaa37e5144e58131c9208c7fef52',
    'go-concurrency-patterns',
    NOW(),
    'TRACK'
FROM users u 
CROSS JOIN categories c 
WHERE u.email = 'admin@gg-cms.local' AND (c.slug = 'programming-languages' OR c.slug = 'programming-languages')
ON CONFLICT (public_id) DO NOTHING;


-- 3. SEED LEARNING PATHS & JUNCTION COURSES

INSERT INTO learning_paths (kind, title, description, created_by_id)
SELECT 
    'AI Architect',
    'Enterprise AI & LLM Systems Engineering Roadmap',
    'Comprehensive engineering roadmap for building production RAG systems, vector search pipelines, LLM guardrails, and automated drift detection.',
    u.id
FROM users u WHERE u.email = 'admin@gg-cms.local'
ON CONFLICT DO NOTHING;


INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 1
FROM learning_paths lp
CROSS JOIN courses crs
WHERE lp.title = 'Enterprise AI & LLM Systems Engineering Roadmap' AND crs.slug = 'production-rag-and-llm-engineering'
ON CONFLICT DO NOTHING;


INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 2
FROM learning_paths lp
CROSS JOIN courses crs
WHERE lp.title = 'Enterprise AI & LLM Systems Engineering Roadmap' AND crs.slug = 'rag-architecture-llm-applications'
ON CONFLICT DO NOTHING;


INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 3
FROM learning_paths lp
CROSS JOIN courses crs
WHERE lp.title = 'Enterprise AI & LLM Systems Engineering Roadmap' AND crs.slug = 'ml-model-evaluation-metrics'
ON CONFLICT DO NOTHING;


INSERT INTO learning_paths (kind, title, description, created_by_id)
SELECT 
    'Security Engineer',
    'Cybersecurity & Application Defense Career Path',
    'Comprehensive security path covering OAuth 2.0/OIDC delegated authorization, PKCE, X.509 PKI, mTLS microservice security, and OWASP Top 10 LLM defenses.',
    u.id
FROM users u WHERE u.email = 'admin@gg-cms.local'
ON CONFLICT DO NOTHING;


INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 1
FROM learning_paths lp
CROSS JOIN courses crs
WHERE lp.title = 'Cybersecurity & Application Defense Career Path' AND crs.slug = 'enterprise-application-security'
ON CONFLICT DO NOTHING;


INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 2
FROM learning_paths lp
CROSS JOIN courses crs
WHERE lp.title = 'Cybersecurity & Application Defense Career Path' AND crs.slug = 'oauth2-oidc-implementation-guide'
ON CONFLICT DO NOTHING;


INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 3
FROM learning_paths lp
CROSS JOIN courses crs
WHERE lp.title = 'Cybersecurity & Application Defense Career Path' AND crs.slug = 'tls-x509-certificate-management'
ON CONFLICT DO NOTHING;


INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 4
FROM learning_paths lp
CROSS JOIN courses crs
WHERE lp.title = 'Cybersecurity & Application Defense Career Path' AND crs.slug = 'owasp-top-10-llm-security'
ON CONFLICT DO NOTHING;


INSERT INTO learning_paths (kind, title, description, created_by_id)
SELECT 
    'DevOps Engineer',
    'Cloud Infrastructure & DevOps Mastery Roadmap',
    'Master container orchestration, Kubernetes manifests, zero-downtime rolling updates, GCP Cloud Run, and modular Terraform IaC.',
    u.id
FROM users u WHERE u.email = 'admin@gg-cms.local'
ON CONFLICT DO NOTHING;


INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 1
FROM learning_paths lp
CROSS JOIN courses crs
WHERE lp.title = 'Cloud Infrastructure & DevOps Mastery Roadmap' AND crs.slug = 'cloud-native-kubernetes-masterclass'
ON CONFLICT DO NOTHING;


INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 2
FROM learning_paths lp
CROSS JOIN courses crs
WHERE lp.title = 'Cloud Infrastructure & DevOps Mastery Roadmap' AND crs.slug = 'gcp-cloud-run-deployment-guide'
ON CONFLICT DO NOTHING;


INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 3
FROM learning_paths lp
CROSS JOIN courses crs
WHERE lp.title = 'Cloud Infrastructure & DevOps Mastery Roadmap' AND crs.slug = 'terraform-modular-architecture'
ON CONFLICT DO NOTHING;


INSERT INTO learning_paths (kind, title, description, created_by_id)
SELECT 
    'Fullstack Engineer',
    'Go Microservices & Modern Backend Engineering Roadmap',
    'Master clean architecture, concurrency patterns, gRPC vs REST APIs, Domain-Driven Design (DDD), and PostgreSQL performance tuning.',
    u.id
FROM users u WHERE u.email = 'admin@gg-cms.local'
ON CONFLICT DO NOTHING;


INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 1
FROM learning_paths lp
CROSS JOIN courses crs
WHERE lp.title = 'Go Microservices & Modern Backend Engineering Roadmap' AND crs.slug = 'mastering-go-microservices-course'
ON CONFLICT DO NOTHING;


INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 2
FROM learning_paths lp
CROSS JOIN courses crs
WHERE lp.title = 'Go Microservices & Modern Backend Engineering Roadmap' AND crs.slug = 'go-concurrency-patterns'
ON CONFLICT DO NOTHING;


INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 3
FROM learning_paths lp
CROSS JOIN courses crs
WHERE lp.title = 'Go Microservices & Modern Backend Engineering Roadmap' AND crs.slug = 'domain-driven-design-principles'
ON CONFLICT DO NOTHING;


INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 4
FROM learning_paths lp
CROSS JOIN courses crs
WHERE lp.title = 'Go Microservices & Modern Backend Engineering Roadmap' AND crs.slug = 'postgresql-indexing-and-query-tuning'
ON CONFLICT DO NOTHING;
-- Seed default difficulty levels, learning styles, and content format types into content_types table
-- Kind = 'level' for difficulty levels
INSERT INTO content_types (kind, value, label, description, sort_order) VALUES
    ('level', 'BEGINNER',     'Beginner',     'Foundational level for newcomers', 1),
    ('level', 'INTERMEDIATE', 'Intermediate', 'Mid-level practical proficiency',   2),
    ('level', 'ADVANCED',     'Advanced',     'Production & architecture mastery', 3)
ON CONFLICT (kind, value) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;

-- Kind = 'learning_style' for learning styles
INSERT INTO content_types (kind, value, label, description, sort_order) VALUES
    ('learning_style', 'THEORY',        'Theory',        'Conceptual & architectural deep dive', 1),
    ('learning_style', 'HANDS_ON',      'Hands-on',      'Step-by-step practical implementation',2),
    ('learning_style', 'PROJECT_BASED', 'Project based', 'End-to-end real world capstone build', 3)
ON CONFLICT (kind, value) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;

-- Additional content format types for articles and resources
INSERT INTO content_types (kind, value, label, description, sort_order) VALUES
    ('article', 'DEEP_DIVE',   'Deep Dives',    'In-depth architectural investigation',   7),
    ('article', 'CHEAT_SHEET', 'Cheat Sheets',  'Quick reference CLI & syntax guides',     8),
    ('article', 'LAB',         'Labs',          'Interactive hands-on practical lab',      9),
    ('article', 'PROJECT',     'Projects',      'Guided project implementation',          10),
    ('article', 'REFERENCE',   'References',    'API and technical reference manual',     11)
ON CONFLICT (kind, value) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
-- Migration 040: Seed Comprehensive SME Subcategories & Specialized Content Tags
-- Expands category taxonomy and tags for Software Engineering, Cloud, Security, Data, and AI/ML.

DO $$
DECLARE
    swe_id BIGINT;
    cloud_id BIGINT;
    sec_id BIGINT;
    data_id BIGINT;
    aiml_id BIGINT;
BEGIN
    SELECT id INTO swe_id FROM categories WHERE slug = 'software-engineering';
    SELECT id INTO cloud_id FROM categories WHERE slug = 'cloud-infrastructure';
    SELECT id INTO sec_id FROM categories WHERE slug = 'cybersecurity';
    SELECT id INTO data_id FROM categories WHERE slug = 'data';
    SELECT id INTO aiml_id FROM categories WHERE slug = 'ai-machine-learning';

    -- 1. SEED NEW SUBCATEGORIES
    -- Software Engineering
    IF swe_id IS NOT NULL THEN
        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('System Design & Architecture', 'system-design-architecture', swe_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Frontend Architecture & SPAs', 'frontend-architecture', swe_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('API Engineering & Protocols', 'api-engineering-protocols', swe_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;
    END IF;

    -- Cloud & Infrastructure
    IF cloud_id IS NOT NULL THEN
        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Observability & Monitoring', 'observability-monitoring', cloud_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Site Reliability Engineering', 'site-reliability-engineering', cloud_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Serverless & Edge Computing', 'serverless-edge', cloud_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;
    END IF;

    -- Cybersecurity
    IF sec_id IS NOT NULL THEN
        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Cloud Security & Compliance', 'cloud-security-compliance', sec_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('DevSecOps & Supply Chain', 'devsecops-supply-chain', sec_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('AI & LLM Security', 'ai-llm-security', sec_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;
    END IF;

    -- Data
    IF data_id IS NOT NULL THEN
        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Vector Databases & Search', 'vector-databases-search', data_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Real-time Event Streaming', 'realtime-event-streaming', data_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;
    END IF;

    -- AI & Machine Learning
    IF aiml_id IS NOT NULL THEN
        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('LLM Engineering & RAG Systems', 'llm-engineering-rag', aiml_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Autonomous AI Agents', 'autonomous-ai-agents', aiml_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;
    END IF;

END $$;

-- 2. SEED SPECIALIZED SME TAGS
INSERT INTO tags (name, created_at, updated_at)
VALUES
  -- System Design & Distributed Systems
  ('Transactional Outbox',      NOW(), NOW()),
  ('Change Data Capture',       NOW(), NOW()),
  ('Debezium',                  NOW(), NOW()),
  ('PgBouncer',                 NOW(), NOW()),
  ('Idempotency Keys',          NOW(), NOW()),
  ('Saga Pattern',              NOW(), NOW()),
  ('Circuit Breaker',           NOW(), NOW()),
  ('Bulkhead Pattern',          NOW(), NOW()),
  ('Thundering Herd',           NOW(), NOW()),
  ('Rate Limiting',             NOW(), NOW()),
  ('gRPC',                      NOW(), NOW()),
  ('Protobuf',                  NOW(), NOW()),

  -- Go Concurrency & Low Level
  ('Goroutines',                NOW(), NOW()),
  ('Worker Pools',              NOW(), NOW()),
  ('Mutex Contention',          NOW(), NOW()),
  ('sync/atomic',               NOW(), NOW()),
  ('CSP Pattern',               NOW(), NOW()),
  ('Escape Analysis',           NOW(), NOW()),
  ('pprof',                     NOW(), NOW()),
  ('Garbage Collection',        NOW(), NOW()),

  -- Identity & Security
  ('PKCE',                      NOW(), NOW()),
  ('OAuth 2.0',                 NOW(), NOW()),
  ('OpenID Connect',            NOW(), NOW()),
  ('JWKS',                      NOW(), NOW()),
  ('Token Revocation',          NOW(), NOW()),
  ('HttpOnly Cookies',          NOW(), NOW()),
  ('Open Policy Agent',         NOW(), NOW()),
  ('Rego',                      NOW(), NOW()),
  ('BOLA Defense',              NOW(), NOW()),
  ('IDOR',                      NOW(), NOW()),
  ('Row Level Security',        NOW(), NOW()),

  -- DevOps & Kubernetes
  ('Readiness Probes',          NOW(), NOW()),
  ('PreStop Hooks',             NOW(), NOW()),
  ('Graceful Shutdown',         NOW(), NOW()),
  ('Kube-Proxy',                NOW(), NOW()),
  ('Gateway API',               NOW(), NOW()),
  ('cert-manager',              NOW(), NOW()),
  ('ExternalDNS',               NOW(), NOW()),
  ('Thanos',                    NOW(), NOW()),
  ('ServiceMonitor',            NOW(), NOW()),
  ('Metric Cardinality',        NOW(), NOW()),
  ('Atlantis',                  NOW(), NOW()),
  ('Cloud Run',                 NOW(), NOW()),

  -- AI, Vector Search & RAG
  ('pgvector',                  NOW(), NOW()),
  ('Hybrid Search',             NOW(), NOW()),
  ('BM25',                      NOW(), NOW()),
  ('Reciprocal Rank Fusion',   NOW(), NOW()),
  ('RAGAS Evaluation',          NOW(), NOW()),
  ('Agentic Workflows',         NOW(), NOW()),
  ('Tool Calling',              NOW(), NOW())

ON CONFLICT (LOWER(name)) DO NOTHING;

-- 3. LINK TAGS TO CATEGORIES
INSERT INTO category_tags (category_id, tag_id)
SELECT c.id, t.id
FROM categories c
CROSS JOIN tags t
WHERE c.slug = 'backend-apis' AND t.name IN ('Transactional Outbox', 'Change Data Capture', 'Idempotency Keys', 'gRPC', 'Protobuf', 'Rate Limiting')
ON CONFLICT DO NOTHING;

INSERT INTO category_tags (category_id, tag_id)
SELECT c.id, t.id
FROM categories c
CROSS JOIN tags t
WHERE c.slug = 'programming-languages' AND t.name IN ('Goroutines', 'Worker Pools', 'Mutex Contention', 'sync/atomic', 'Escape Analysis', 'pprof')
ON CONFLICT DO NOTHING;

INSERT INTO category_tags (category_id, tag_id)
SELECT c.id, t.id
FROM categories c
CROSS JOIN tags t
WHERE c.slug = 'identity-access' AND t.name IN ('PKCE', 'OAuth 2.0', 'OpenID Connect', 'JWKS', 'Token Revocation', 'HttpOnly Cookies')
ON CONFLICT DO NOTHING;

INSERT INTO category_tags (category_id, tag_id)
SELECT c.id, t.id
FROM categories c
CROSS JOIN tags t
WHERE c.slug = 'containers-orchestration' AND t.name IN ('Readiness Probes', 'PreStop Hooks', 'Gateway API', 'cert-manager', 'ExternalDNS', 'Thanos')
ON CONFLICT DO NOTHING;

INSERT INTO category_tags (category_id, tag_id)
SELECT c.id, t.id
FROM categories c
CROSS JOIN tags t
WHERE c.slug = 'generative-ai' AND t.name IN ('pgvector', 'Hybrid Search', 'BM25', 'Reciprocal Rank Fusion', 'RAGAS Evaluation', 'Agentic Workflows')
ON CONFLICT DO NOTHING;
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
-- Migration 044: Rename 'ai-machine-learning' domain to 'Artificial Intelligence'
-- In-place UPDATE (not delete+reinsert): row id is preserved, so every subcategory's
-- parent_id and every content row's category_id FK reference remains valid.
-- No rows are deleted and no content is touched.

UPDATE categories
SET name = 'Artificial Intelligence',
    slug = 'artificial-intelligence'
WHERE slug = 'ai-machine-learning';
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
-- Seed all remaining learning paths and junction courses cleanly

-- 1. Identity & Application Security Engineering Roadmap
INSERT INTO learning_paths (kind, title, description, slug, created_by_id)
SELECT 'SECURITY_TRACK', 'Cybersecurity & Identity Architecture', 'Deep dive into OAuth 2.0, OpenID Connect (OIDC), PKI & Cryptography, Web Application Pentesting, and Zero Trust access control.', 'cybersecurity-identity', u.id
FROM (SELECT id FROM users ORDER BY id ASC LIMIT 1) u
ON CONFLICT DO NOTHING;

INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 1 FROM learning_paths lp CROSS JOIN courses crs WHERE lp.slug = 'cybersecurity-identity' AND crs.slug = 'oauth2-oidc-implementation-guide'
ON CONFLICT DO NOTHING;
INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 2 FROM learning_paths lp CROSS JOIN courses crs WHERE lp.slug = 'cybersecurity-identity' AND crs.slug = 'tls-x509-certificate-management'
ON CONFLICT DO NOTHING;
INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 3 FROM learning_paths lp CROSS JOIN courses crs WHERE lp.slug = 'cybersecurity-identity' AND crs.slug = 'enterprise-application-security'
ON CONFLICT DO NOTHING;

-- 2. Backend Systems Engineering Roadmap
INSERT INTO learning_paths (kind, title, description, slug, created_by_id)
SELECT 'STRUCTURED_PATH', 'Full-Stack Software Engineering Track', 'Master modern frontend development, backend microservices in Go, database modeling in PostgreSQL, and cloud deployments.', 'software-engineering', u.id
FROM (SELECT id FROM users ORDER BY id ASC LIMIT 1) u
ON CONFLICT DO NOTHING;

INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 1 FROM learning_paths lp CROSS JOIN courses crs WHERE lp.slug = 'software-engineering' AND crs.slug = 'mastering-go-microservices-course'
ON CONFLICT DO NOTHING;
INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 2 FROM learning_paths lp CROSS JOIN courses crs WHERE lp.slug = 'software-engineering' AND crs.slug = 'go-concurrency-patterns'
ON CONFLICT DO NOTHING;
INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 3 FROM learning_paths lp CROSS JOIN courses crs WHERE lp.slug = 'software-engineering' AND crs.slug = 'postgresql-indexing-and-query-tuning'
ON CONFLICT DO NOTHING;

-- 3. Cloud Platform Engineering Roadmap
INSERT INTO learning_paths (kind, title, description, slug, created_by_id)
SELECT 'STRUCTURED_PATH', 'Cloud Infrastructure & DevOps Mastery', 'Learn container orchestration with Kubernetes, Cloud Infrastructure on GCP & AWS, CI/CD automation, and Observability.', 'cloud-devops', u.id
FROM (SELECT id FROM users ORDER BY id ASC LIMIT 1) u
ON CONFLICT DO NOTHING;

INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 1 FROM learning_paths lp CROSS JOIN courses crs WHERE lp.slug = 'cloud-devops' AND crs.slug = 'cloud-native-kubernetes-masterclass'
ON CONFLICT DO NOTHING;
INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 2 FROM learning_paths lp CROSS JOIN courses crs WHERE lp.slug = 'cloud-devops' AND crs.slug = 'gcp-cloud-run-deployment-guide'
ON CONFLICT DO NOTHING;
INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 3 FROM learning_paths lp CROSS JOIN courses crs WHERE lp.slug = 'cloud-devops' AND crs.slug = 'terraform-modular-architecture'
ON CONFLICT DO NOTHING;

-- 4. AI & ML Platform Engineering Roadmap
INSERT INTO learning_paths (kind, title, description, slug, created_by_id)
SELECT 'STRUCTURED_PATH', 'AI & Machine Learning Engineering Track', 'Build and deploy AI applications using Large Language Models (LLMs), Vector Databases, RAG architectures, and AI Agents.', 'ai-ml-engineering', u.id
FROM (SELECT id FROM users ORDER BY id ASC LIMIT 1) u
ON CONFLICT DO NOTHING;

INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 1 FROM learning_paths lp CROSS JOIN courses crs WHERE lp.slug = 'ai-ml-engineering' AND crs.slug = 'production-rag-and-llm-engineering'
ON CONFLICT DO NOTHING;
INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 2 FROM learning_paths lp CROSS JOIN courses crs WHERE lp.slug = 'ai-ml-engineering' AND crs.slug = 'rag-architecture-llm-applications'
ON CONFLICT DO NOTHING;
INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 3 FROM learning_paths lp CROSS JOIN courses crs WHERE lp.slug = 'ai-ml-engineering' AND crs.slug = 'ml-model-evaluation-metrics'
ON CONFLICT DO NOTHING;

-- 5. System Design & Technical Interview
INSERT INTO learning_paths (kind, title, description, slug, created_by_id)
SELECT 'INTERVIEW_PREP', 'System Design & Technical Interview Mastery', 'Master high-scale system design, caching strategies, load balancing, database sharding, and crack senior tech interviews.', 'system-design', u.id
FROM (SELECT id FROM users ORDER BY id ASC LIMIT 1) u
ON CONFLICT DO NOTHING;

INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 1 FROM learning_paths lp CROSS JOIN courses crs WHERE lp.slug = 'system-design' AND crs.slug = 'sharded-multi-tenant-postgres-schema-design'
ON CONFLICT DO NOTHING;
INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 2 FROM learning_paths lp CROSS JOIN courses crs WHERE lp.slug = 'system-design' AND crs.slug = 'high-throughput-cdc-kafka-event-pipeline'
ON CONFLICT DO NOTHING;

-- 6. API Security & OWASP Top 10
INSERT INTO learning_paths (kind, title, description, slug, created_by_id)
SELECT 'SECURITY_TRACK', 'API Security & OWASP Top 10 Deep Dive', 'Identify, exploit, and patch API vulnerabilities based on OWASP API Security Top 10 guidelines.', 'api-security', u.id
FROM (SELECT id FROM users ORDER BY id ASC LIMIT 1) u
ON CONFLICT DO NOTHING;

INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 1 FROM learning_paths lp CROSS JOIN courses crs WHERE lp.slug = 'api-security' AND crs.slug = 'secure-api-design-session-security'
ON CONFLICT DO NOTHING;
INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 2 FROM learning_paths lp CROSS JOIN courses crs WHERE lp.slug = 'api-security' AND crs.slug = 'enterprise-application-security'
ON CONFLICT DO NOTHING;
INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 3 FROM learning_paths lp CROSS JOIN courses crs WHERE lp.slug = 'api-security' AND crs.slug = 'owasp-top-10-llm-security'
ON CONFLICT DO NOTHING;

-- 047 referenced course slugs that were never seeded, leaving every seeded path except
-- 'backend-go-developer' empty. Link each seeded path to courses that actually exist.
-- Safe & idempotent:
--   * only fills paths that currently have NO linked courses (never touches admin-curated paths)
--   * JOIN on courses.slug silently skips slugs that do not exist in a given environment
--   * ON CONFLICT guards against duplicate (path, course) rows
--   * emits a NOTICE with the number of rows linked per path so silent no-ops are visible in logs

DO $$
DECLARE
    rec RECORD;
    linked INT;
BEGIN
    FOR rec IN
        SELECT * FROM (VALUES
            ('system-design',          ARRAY['distributed-systems-system-design-fundamentals']),
            ('api-security',           ARRAY['secure-api-design-session-security',
                                             'oauth2-oidc-jwt-from-zero-to-attacks']),
            ('cybersecurity-identity', ARRAY['cybersecurity-fundamentals-from-scratch',
                                             'oauth2-oidc-jwt-from-zero-to-attacks',
                                             'software-ai-supply-chain-security']),
            ('cloud-devops',           ARRAY['platform-engineering-for-ai-workloads',
                                             'observability-for-ai-native-systems-tracing-tokens-and-failures']),
            ('software-engineering',   ARRAY['c-internals-from-scratch',
                                             'c-internals-from-scratch-memory-ownership-concurrency-and-the-stl',
                                             'java-internals-from-scratch-jvm-memory-concurrency-and-production-services']),
            ('ai-ml-engineering',      ARRAY['platform-engineering-for-ai-workloads',
                                             'observability-for-ai-native-systems-tracing-tokens-and-failures'])
        ) AS m(path_slug, course_slugs)
    LOOP
        IF EXISTS (
            SELECT 1 FROM learning_path_courses x
            JOIN learning_paths lp ON lp.id = x.learning_path_id
            WHERE lp.slug = rec.path_slug
        ) THEN
            RAISE NOTICE '048: path % already has courses, skipped', rec.path_slug;
            CONTINUE;
        END IF;

        INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
        SELECT lp.id, c.id, s.ord
        FROM learning_paths lp
        JOIN unnest(rec.course_slugs) WITH ORDINALITY AS s(slug, ord) ON TRUE
        JOIN courses c ON c.slug = s.slug
        WHERE lp.slug = rec.path_slug
        ON CONFLICT DO NOTHING;

        GET DIAGNOSTICS linked = ROW_COUNT;
        RAISE NOTICE '048: path % linked % course(s)', rec.path_slug, linked;
    END LOOP;
END $$;
-- Referential integrity for learning_path_courses: remove orphans/duplicates, then enforce FK + uniqueness.
DELETE FROM learning_path_courses x WHERE NOT EXISTS (SELECT 1 FROM courses c WHERE c.id = x.course_id);

DELETE FROM learning_path_courses a USING learning_path_courses b
WHERE a.learning_path_id = b.learning_path_id AND a.course_id = b.course_id AND a.id > b.id;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_lpc_course') THEN
        ALTER TABLE learning_path_courses
            ADD CONSTRAINT fk_lpc_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lpc_path_course ON learning_path_courses (learning_path_id, course_id);
-- +goose Up
-- +goose StatementBegin
ALTER TABLE articles ADD COLUMN interactive_metadata JSONB;
ALTER TABLE courses ADD COLUMN interactive_metadata JSONB;
-- +goose StatementEnd

-- (Down migration removed because goose directives are not supported by the custom runner)
ALTER TABLE articles ADD COLUMN IF NOT EXISTS interactive_metadata JSONB;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS interactive_metadata JSONB;

-- Convert 'Interview Track' courses into formal INTERVIEW Assessments
UPDATE courses
SET 
    course_type = 'ASSESSMENT',
    interactive_metadata = '{"assessmentType": "INTERVIEW", "contentType": "QA"}'::jsonb
WHERE title ILIKE '%Interview Track%';

-- Pick a few courses and turn them into PRACTICE Assessments so the Hub is populated
UPDATE courses
SET 
    course_type = 'ASSESSMENT',
    interactive_metadata = '{"assessmentType": "PRACTICE", "contentType": "MCQ"}'::jsonb
WHERE slug IN (
    'golang-distributed-systems',
    'oauth2-oidc-security',
    'kubernetes-advanced-networking',
    'enterprise-rag-llm'
);
