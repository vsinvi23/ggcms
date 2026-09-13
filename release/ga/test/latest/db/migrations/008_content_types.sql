-- Create content_types table for configurable article/course type labels
CREATE TABLE IF NOT EXISTS content_types (
    id          SERIAL PRIMARY KEY,
    kind        VARCHAR(20)  NOT NULL,
    value       VARCHAR(50)  NOT NULL,
    label       VARCHAR(100) NOT NULL,
    description TEXT         NOT NULL DEFAULT '',
    sort_order  INT          NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Idempotent unique index (replaces the DO-block constraint approach)
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_types_kind_value ON content_types (kind, value);

CREATE INDEX IF NOT EXISTS idx_content_types_kind ON content_types (kind);

-- Seed default article types
INSERT INTO content_types (kind, value, label, description, sort_order) VALUES
    ('article', 'BLOG',       'Blog Post',     'General-purpose blog article',              1),
    ('article', 'TUTORIAL',   'Tutorial',      'Step-by-step how-to guide',                 2),
    ('article', 'GUIDE',      'Guide',         'In-depth reference guide',                  3),
    ('article', 'NEWS',       'News',          'News and updates',                          4),
    ('article', 'CASE_STUDY', 'Case Study',    'Real-world problem and solution walkthrough',5),
    ('article', 'HOW_TO',     'How-To',        'Practical how-to instructions',             6)
ON CONFLICT (kind, value) DO NOTHING;

-- Seed default course types
INSERT INTO content_types (kind, value, label, description, sort_order) VALUES
    ('course', 'STANDARD',      'Standard Course',   'Full-length structured course',  1),
    ('course', 'BYTE',          'Byte',              'Short focused micro-course',      2),
    ('course', 'LEARNING_PLAN', 'Learning Plan',     'Curated sequence of courses',    3),
    ('course', 'CAPSULE',       'Interview Capsule', 'Interview preparation capsule',  4)
ON CONFLICT (kind, value) DO NOTHING;
