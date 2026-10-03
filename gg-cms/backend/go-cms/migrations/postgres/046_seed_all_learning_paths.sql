-- Seed all remaining learning paths and junction courses cleanly

-- 1. Identity & Application Security Engineering Roadmap
INSERT INTO learning_paths (kind, title, description, slug, created_by_id)
SELECT 'Security Engineer', 'Identity & Application Security Engineering Roadmap', 'Comprehensive security engineering roadmap covering OAuth 2.0/OIDC delegated authorization, PKCE, X.509 PKI, mTLS microservice security, and OWASP Top 10 LLM defenses.', 'identity-appsec-engineer-roadmap', u.id
FROM users u WHERE u.email = 'admin@gg-cms.local'
ON CONFLICT DO NOTHING;

-- 2. Backend Systems Engineering Roadmap
INSERT INTO learning_paths (kind, title, description, slug, created_by_id)
SELECT 'Backend Engineer', 'Backend Systems Engineering Roadmap', 'Advanced backend engineering roadmap covering Go microservices, concurrency patterns, DDD, and high-throughput gRPC services.', 'backend-systems-engineer-roadmap', u.id
FROM users u WHERE u.email = 'admin@gg-cms.local'
ON CONFLICT DO NOTHING;

-- 3. Cloud Platform Engineering Roadmap
INSERT INTO learning_paths (kind, title, description, slug, created_by_id)
SELECT 'Platform Engineer', 'Cloud Platform Engineering Roadmap', 'Production platform engineering roadmap covering GCP Cloud Run, Kubernetes rolling updates, and Terraform modular IaC.', 'cloud-platform-engineer-roadmap', u.id
FROM users u WHERE u.email = 'admin@gg-cms.local'
ON CONFLICT DO NOTHING;

-- 4. AI & ML Platform Engineering Roadmap
INSERT INTO learning_paths (kind, title, description, slug, created_by_id)
SELECT 'AI Engineer', 'AI & ML Platform Engineering Roadmap', 'Production AI engineering roadmap covering RAG architecture, vector search, prompt engineering, and ML model evaluation metrics.', 'ai-ml-platform-engineer-roadmap', u.id
FROM users u WHERE u.email = 'admin@gg-cms.local'
ON CONFLICT DO NOTHING;
