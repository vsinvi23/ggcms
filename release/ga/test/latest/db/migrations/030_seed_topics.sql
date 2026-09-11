-- Seed starter topic registry per GEEKGULLY Universal Taxonomy spec §20.
-- entity_type values: technology, protocol, standard, concept, framework, platform, tool, language, skill, methodology
-- ON CONFLICT (slug) ensures idempotency on repeated runs.

INSERT INTO topics (name, slug, entity_type, created_at, updated_at)
VALUES
  -- ── Programming ─────────────────────────────────────────────────────────────
  ('Python',              'python',              'language',  NOW(), NOW()),
  ('Go',                  'go',                  'language',  NOW(), NOW()),
  ('JavaScript',          'javascript',          'language',  NOW(), NOW()),
  ('TypeScript',          'typescript',          'language',  NOW(), NOW()),
  ('Object-Oriented Programming', 'object-oriented-programming', 'concept', NOW(), NOW()),
  ('Concurrency',         'concurrency',         'concept',   NOW(), NOW()),

  -- ── Backend ─────────────────────────────────────────────────────────────────
  ('REST',                'rest',                'protocol',  NOW(), NOW()),
  ('GraphQL',             'graphql',             'protocol',  NOW(), NOW()),
  ('gRPC',                'grpc',                'protocol',  NOW(), NOW()),
  ('Microservices',       'microservices',       'concept',   NOW(), NOW()),
  ('Message Queues',      'message-queues',      'concept',   NOW(), NOW()),

  -- ── Identity ────────────────────────────────────────────────────────────────
  ('OAuth 2.0',           'oauth-2',             'standard',  NOW(), NOW()),
  ('OpenID Connect',      'openid-connect',      'standard',  NOW(), NOW()),
  ('JWT',                 'jwt',                 'standard',  NOW(), NOW()),
  ('SAML',                'saml',                'standard',  NOW(), NOW()),

  -- ── PKI ─────────────────────────────────────────────────────────────────────
  ('TLS',                 'tls',                 'protocol',  NOW(), NOW()),
  ('X.509 Certificates',  'x509-certificates',   'standard',  NOW(), NOW()),
  ('Public Key Infrastructure', 'public-key-infrastructure', 'concept', NOW(), NOW()),

  -- ── Cloud ───────────────────────────────────────────────────────────────────
  ('AWS',                 'aws',                 'platform',  NOW(), NOW()),
  ('Azure',               'azure',               'platform',  NOW(), NOW()),
  ('GCP',                 'gcp',                 'platform',  NOW(), NOW()),

  -- ── Containers ──────────────────────────────────────────────────────────────
  ('Docker',              'docker',              'tool',      NOW(), NOW()),
  ('Kubernetes',          'kubernetes',          'platform',  NOW(), NOW()),

  -- ── Infrastructure as Code ──────────────────────────────────────────────────
  ('Terraform',           'terraform',           'tool',      NOW(), NOW()),
  ('Ansible',             'ansible',             'tool',      NOW(), NOW()),

  -- ── Data ────────────────────────────────────────────────────────────────────
  ('SQL',                 'sql',                 'language',  NOW(), NOW()),
  ('PostgreSQL',          'postgresql',          'technology',NOW(), NOW()),
  ('MongoDB',             'mongodb',             'technology',NOW(), NOW()),
  ('Data Modeling',       'data-modeling',       'skill',     NOW(), NOW()),

  -- ── Security ────────────────────────────────────────────────────────────────
  ('OWASP Top 10',        'owasp-top-10',        'standard',  NOW(), NOW()),
  ('Threat Modeling',     'threat-modeling',     'methodology',NOW(), NOW()),
  ('Penetration Testing', 'penetration-testing', 'skill',     NOW(), NOW()),
  ('Zero Trust Architecture', 'zero-trust-architecture', 'concept', NOW(), NOW()),

  -- ── AI ──────────────────────────────────────────────────────────────────────
  ('Machine Learning',    'machine-learning',    'concept',   NOW(), NOW()),
  ('Large Language Models','large-language-models','concept', NOW(), NOW()),
  ('Retrieval-Augmented Generation', 'retrieval-augmented-generation', 'methodology', NOW(), NOW()),
  ('Prompt Engineering',  'prompt-engineering',  'skill',     NOW(), NOW())

ON CONFLICT (slug) DO NOTHING;
