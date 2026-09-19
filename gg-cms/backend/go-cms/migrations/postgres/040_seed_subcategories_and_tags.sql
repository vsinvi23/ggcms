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
