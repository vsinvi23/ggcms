CREATE TABLE IF NOT EXISTS app_settings (
    id         SERIAL PRIMARY KEY,
    key        VARCHAR(255) UNIQUE NOT NULL,
    value      TEXT        NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (key, value) VALUES
    ('storage.provider',          'local'),
    ('storage.local.upload_dir',  './uploads'),
    ('storage.local.base_url',    'http://localhost:8080/uploads'),
    ('storage.s3.bucket',         ''),
    ('storage.s3.region',         'us-east-1'),
    ('storage.s3.access_key',     ''),
    ('storage.s3.secret_key',     ''),
    ('storage.s3.endpoint',       ''),
    ('storage.s3.public_url',     ''),
    ('upload.max_size_mb',        '10'),
    ('upload.allowed_types',      'image/jpeg,image/png,image/gif,image/webp,application/pdf')
ON CONFLICT (key) DO NOTHING;
