-- Create learning_paths and learning_path_courses tables
CREATE TABLE IF NOT EXISTS learning_paths (
    id           SERIAL PRIMARY KEY,
    kind         VARCHAR(30)  NOT NULL,
    title        VARCHAR(500) NOT NULL,
    description  TEXT         NOT NULL DEFAULT '',
    created_by_id INT         NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_paths_kind ON learning_paths (kind);

CREATE TABLE IF NOT EXISTS learning_path_courses (
    id               SERIAL PRIMARY KEY,
    learning_path_id INT NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
    course_id        INT NOT NULL,
    sort_order       INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_lpc_path_id ON learning_path_courses (learning_path_id);
