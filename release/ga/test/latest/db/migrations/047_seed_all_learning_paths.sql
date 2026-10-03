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

