-- Add role and permissions columns to groups table
ALTER TABLE groups ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'viewer';
ALTER TABLE groups ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}';
