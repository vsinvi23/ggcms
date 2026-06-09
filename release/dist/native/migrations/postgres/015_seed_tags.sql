-- Seed commonly-used tags for programming, AI, and security topics.
-- ON CONFLICT (LOWER(name)) DO NOTHING ensures idempotency on repeated runs.

INSERT INTO tags (name, created_at, updated_at)
VALUES
  -- ── Programming Languages ───────────────────────────────────────────────────
  ('Python',          NOW(), NOW()),
  ('JavaScript',      NOW(), NOW()),
  ('TypeScript',      NOW(), NOW()),
  ('Java',            NOW(), NOW()),
  ('Go',              NOW(), NOW()),
  ('Rust',            NOW(), NOW()),
  ('C++',             NOW(), NOW()),
  ('C#',              NOW(), NOW()),
  ('Ruby',            NOW(), NOW()),
  ('Swift',           NOW(), NOW()),
  ('Kotlin',          NOW(), NOW()),
  ('PHP',             NOW(), NOW()),

  -- ── Web Development ─────────────────────────────────────────────────────────
  ('React',           NOW(), NOW()),
  ('Next.js',         NOW(), NOW()),
  ('Vue.js',          NOW(), NOW()),
  ('Node.js',         NOW(), NOW()),
  ('HTML & CSS',      NOW(), NOW()),
  ('REST API',        NOW(), NOW()),
  ('GraphQL',         NOW(), NOW()),
  ('WebSockets',      NOW(), NOW()),
  ('Tailwind CSS',    NOW(), NOW()),

  -- ── AI / Machine Learning ───────────────────────────────────────────────────
  ('Machine Learning',    NOW(), NOW()),
  ('Deep Learning',       NOW(), NOW()),
  ('LLM',                 NOW(), NOW()),
  ('Generative AI',       NOW(), NOW()),
  ('NLP',                 NOW(), NOW()),
  ('Computer Vision',     NOW(), NOW()),
  ('Data Science',        NOW(), NOW()),
  ('TensorFlow',          NOW(), NOW()),
  ('PyTorch',             NOW(), NOW()),
  ('AI Agents',           NOW(), NOW()),
  ('Prompt Engineering',  NOW(), NOW()),
  ('RAG',                 NOW(), NOW()),
  ('Neural Networks',     NOW(), NOW()),

  -- ── Security ────────────────────────────────────────────────────────────────
  ('Cybersecurity',        NOW(), NOW()),
  ('Ethical Hacking',      NOW(), NOW()),
  ('Network Security',     NOW(), NOW()),
  ('OWASP',                NOW(), NOW()),
  ('Cryptography',         NOW(), NOW()),
  ('Penetration Testing',  NOW(), NOW()),
  ('Web Security',         NOW(), NOW()),
  ('Cloud Security',       NOW(), NOW()),
  ('Zero Trust',           NOW(), NOW()),

  -- ── DevOps / Cloud ──────────────────────────────────────────────────────────
  ('AWS',             NOW(), NOW()),
  ('Azure',           NOW(), NOW()),
  ('GCP',             NOW(), NOW()),
  ('Docker',          NOW(), NOW()),
  ('Kubernetes',      NOW(), NOW()),
  ('CI/CD',           NOW(), NOW()),
  ('DevOps',          NOW(), NOW()),
  ('Linux',           NOW(), NOW()),
  ('Terraform',       NOW(), NOW()),

  -- ── Databases ───────────────────────────────────────────────────────────────
  ('SQL',             NOW(), NOW()),
  ('PostgreSQL',      NOW(), NOW()),
  ('MongoDB',         NOW(), NOW()),
  ('Redis',           NOW(), NOW()),
  ('Elasticsearch',   NOW(), NOW()),

  -- ── Computer Science Fundamentals ───────────────────────────────────────────
  ('Data Structures',  NOW(), NOW()),
  ('Algorithms',       NOW(), NOW()),
  ('System Design',    NOW(), NOW()),
  ('Design Patterns',  NOW(), NOW()),
  ('Interview Prep',   NOW(), NOW()),
  ('Operating Systems',NOW(), NOW()),

  -- ── Tooling / Practices ─────────────────────────────────────────────────────
  ('Git',              NOW(), NOW()),
  ('Testing',          NOW(), NOW()),
  ('Microservices',    NOW(), NOW()),
  ('Open Source',      NOW(), NOW()),
  ('Agile',            NOW(), NOW()),
  ('Clean Code',       NOW(), NOW())

ON CONFLICT (LOWER(name)) DO NOTHING;
