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
