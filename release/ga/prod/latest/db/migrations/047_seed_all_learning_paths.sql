-- Seed all remaining learning paths and junction courses cleanly

-- 1. Identity & Application Security Engineering Roadmap
INSERT INTO learning_paths (kind, title, description, slug, created_by_id)
SELECT 'SECURITY_TRACK', 'Cybersecurity & Identity Architecture', 'Deep dive into OAuth 2.0, OpenID Connect (OIDC), PKI & Cryptography, Web Application Pentesting, and Zero Trust access control.', 'cybersecurity-identity', u.id
FROM (SELECT id FROM users ORDER BY id ASC LIMIT 1) u
ON CONFLICT DO NOTHING;

-- 2. Backend Systems Engineering Roadmap
INSERT INTO learning_paths (kind, title, description, slug, created_by_id)
SELECT 'STRUCTURED_PATH', 'Full-Stack Software Engineering Track', 'Master modern frontend development, backend microservices in Go, database modeling in PostgreSQL, and cloud deployments.', 'software-engineering', u.id
FROM (SELECT id FROM users ORDER BY id ASC LIMIT 1) u
ON CONFLICT DO NOTHING;

-- 3. Cloud Platform Engineering Roadmap
INSERT INTO learning_paths (kind, title, description, slug, created_by_id)
SELECT 'STRUCTURED_PATH', 'Cloud Infrastructure & DevOps Mastery', 'Learn container orchestration with Kubernetes, Cloud Infrastructure on GCP & AWS, CI/CD automation, and Observability.', 'cloud-devops', u.id
FROM (SELECT id FROM users ORDER BY id ASC LIMIT 1) u
ON CONFLICT DO NOTHING;

-- 4. AI & ML Platform Engineering Roadmap
INSERT INTO learning_paths (kind, title, description, slug, created_by_id)
SELECT 'STRUCTURED_PATH', 'AI & Machine Learning Engineering Track', 'Build and deploy AI applications using Large Language Models (LLMs), Vector Databases, RAG architectures, and AI Agents.', 'ai-ml-engineering', u.id
FROM (SELECT id FROM users ORDER BY id ASC LIMIT 1) u
ON CONFLICT DO NOTHING;

-- 5. System Design & Technical Interview
INSERT INTO learning_paths (kind, title, description, slug, created_by_id)
SELECT 'INTERVIEW_PREP', 'System Design & Technical Interview Mastery', 'Master high-scale system design, caching strategies, load balancing, database sharding, and crack senior tech interviews.', 'system-design', u.id
FROM (SELECT id FROM users ORDER BY id ASC LIMIT 1) u
ON CONFLICT DO NOTHING;

-- 6. API Security & OWASP Top 10
INSERT INTO learning_paths (kind, title, description, slug, created_by_id)
SELECT 'SECURITY_TRACK', 'API Security & OWASP Top 10 Deep Dive', 'Identify, exploit, and patch API vulnerabilities based on OWASP API Security Top 10 guidelines.', 'api-security', u.id
FROM (SELECT id FROM users ORDER BY id ASC LIMIT 1) u
ON CONFLICT DO NOTHING;

