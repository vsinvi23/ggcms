-- Migration 037: Seed sample published content for public portal exploration

INSERT INTO articles (
    title,
    description,
    body,
    status,
    category_id,
    created_by_id,
    public_id,
    slug,
    published_at,
    thumbnail_url
)
SELECT 
    'Mastering Docker Containers & Microservices',
    'A comprehensive guide to building, running, and optimizing production-grade Docker containers and multi-container microservice stacks.',
    '# Mastering Docker Containers & Microservices\n\nDocker has revolutionized software delivery by enabling developers to package applications and their dependencies into lightweight, isolated containers.\n\n## Key Concepts\n- **Images & Containers**: Understand how layer caching speeds up builds.\n- **Networking**: Multi-container network isolation.\n- **Volume Storage**: Persistent data strategies.\n\n```bash\n# Run a local container\ndocker run -d -p 8080:80 nginx:alpine\n```',
    'PUBLISHED',
    11, -- Containers & Orchestration
    u.id,
    'art-docker-001-uuid-v4-sample-slug',
    'mastering-docker-containers-microservices',
    NOW(),
    'https://images.unsplash.com/photo-1605745341112-85968b19335b?w=600&auto=format&fit=crop'
FROM users u WHERE u.email = 'admin@gg-cms.local'
ON CONFLICT (public_id) DO NOTHING;

INSERT INTO articles (
    title,
    description,
    body,
    status,
    category_id,
    created_by_id,
    public_id,
    slug,
    published_at,
    thumbnail_url
)
SELECT 
    'OWASP Top 10 for LLM & AI Applications (2026 Edition)',
    'Detailed breakdown of critical vulnerabilities in modern AI applications, including prompt injection, model denial of service, and sensitive data leakage.',
    '# OWASP Top 10 for LLM & AI Applications\n\nAs Generative AI models integrate into enterprise architectures, securing the LLM processing pipeline becomes mandatory.\n\n## Top Threats\n1. **Prompt Injection**: Overriding model system prompts via untrusted input.\n2. **Insecure Output Handling**: Executing LLM outputs directly in shell scripts or database queries.\n3. **Training Data Poisoning**: Manipulating fine-tuning datasets.',
    'PUBLISHED',
    15, -- AppSec & Threats
    u.id,
    'art-owasp-002-uuid-v4-sample-slug',
    'owasp-top-10-for-llm-ai-applications',
    NOW(),
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=600&auto=format&fit=crop'
FROM users u WHERE u.email = 'admin@gg-cms.local'
ON CONFLICT (public_id) DO NOTHING;

INSERT INTO articles (
    title,
    description,
    body,
    status,
    category_id,
    created_by_id,
    public_id,
    slug,
    published_at,
    thumbnail_url
)
SELECT 
    'High-Performance PostgreSQL Query Optimization',
    'Learn how indexing, EXPLAIN ANALYZE, query planner statistics, and connection pooling dramatically speed up database response times.',
    '# High-Performance PostgreSQL Query Optimization\n\nOptimizing database queries is the single most effective way to improve web application latency.\n\n## Techniques\n- **B-Tree & GIN Indexes**: Choosing the right index type.\n- **EXPLAIN ANALYZE**: Reading PostgreSQL execution plans.\n- **Connection Pooling**: Using PgBouncer for high concurrency.',
    'PUBLISHED',
    16, -- Databases
    u.id,
    'art-postgres-003-uuid-v4-sample-slug',
    'high-performance-postgresql-query-optimization',
    NOW(),
    'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=600&auto=format&fit=crop'
FROM users u WHERE u.email = 'admin@gg-cms.local'
ON CONFLICT (public_id) DO NOTHING;

INSERT INTO articles (
    title,
    description,
    body,
    status,
    category_id,
    created_by_id,
    public_id,
    slug,
    published_at,
    thumbnail_url
)
SELECT 
    'Building Enterprise RAG Architectures with Vector Databases',
    'Architecting scalable Retrieval-Augmented Generation systems using PgVector, hybrid search, and semantic re-ranking.',
    '# Building Enterprise RAG Architectures\n\nRetrieval-Augmented Generation connects LLMs with proprietary company knowledge bases safely.\n\n## Architecture Overview\n- Chunking documents into semantic passages.\n- Generating embeddings with OpenAI/Gemini APIs.\n- Storing vectors in PostgreSQL using `pgvector`.',
    'PUBLISHED',
    19, -- Generative AI
    u.id,
    'art-rag-004-uuid-v4-sample-slug',
    'building-enterprise-rag-architectures-vector-databases',
    NOW(),
    'https://images.unsplash.com/photo-1677442136019-21780efad99a?w=600&auto=format&fit=crop'
FROM users u WHERE u.email = 'admin@gg-cms.local'
ON CONFLICT (public_id) DO NOTHING;

-- Seed Sample Courses
INSERT INTO courses (
    title,
    description,
    status,
    category_id,
    created_by_id,
    public_id,
    slug,
    published_at,
    thumbnail_url
)
SELECT 
    'Cloud-Native Kubernetes & DevOps Bootcamp',
    'Zero to hero guide covering Docker, Kubernetes deployment manifests, Helm charts, and GitOps CI/CD pipelines.',
    'PUBLISHED',
    11, -- Containers & Orchestration
    u.id,
    'course-k8s-001-uuid-v4-sample-slug',
    'cloud-native-kubernetes-devops-bootcamp',
    NOW(),
    'https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?w=600&auto=format&fit=crop'
FROM users u WHERE u.email = 'admin@gg-cms.local'
ON CONFLICT (public_id) DO NOTHING;

INSERT INTO courses (
    title,
    description,
    status,
    category_id,
    created_by_id,
    public_id,
    slug,
    published_at,
    thumbnail_url
)
SELECT 
    'Securing Enterprise Applications & API Security',
    'Hands-on security course covering OAuth 2.0, OpenID Connect, JWT validation, and threat modeling.',
    'PUBLISHED',
    15, -- AppSec & Threats
    u.id,
    'course-sec-002-uuid-v4-sample-slug',
    'securing-enterprise-applications-api-security',
    NOW(),
    'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=600&auto=format&fit=crop'
FROM users u WHERE u.email = 'admin@gg-cms.local'
ON CONFLICT (public_id) DO NOTHING;

-- Seed Sample Learning Paths
INSERT INTO learning_paths (
    kind,
    title,
    description,
    created_by_id
)
SELECT 
    'DevOps Engineer',
    'Cloud Infrastructure & DevOps Mastery',
    'Master Linux, Docker, Kubernetes, Terraform, and CI/CD automation to become a certified DevOps Engineer.',
    u.id
FROM users u WHERE u.email = 'admin@gg-cms.local'
ON CONFLICT DO NOTHING;

INSERT INTO learning_paths (
    kind,
    title,
    description,
    created_by_id
)
SELECT 
    'Security Engineer',
    'Cybersecurity & Application Defense Path',
    'Learn vulnerability management, threat modeling, cloud security, and OWASP defenses.',
    u.id
FROM users u WHERE u.email = 'admin@gg-cms.local'
ON CONFLICT DO NOTHING;
