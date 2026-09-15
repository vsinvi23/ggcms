-- Tags table
CREATE TABLE IF NOT EXISTS tags (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Case-insensitive unique index (functional indexes must be created separately)
CREATE UNIQUE INDEX IF NOT EXISTS tags_name_unique ON tags (LOWER(name));

-- Category-tag association
CREATE TABLE IF NOT EXISTS category_tags (
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    tag_id      INTEGER NOT NULL REFERENCES tags(id)      ON DELETE CASCADE,
    PRIMARY KEY (category_id, tag_id)
);
