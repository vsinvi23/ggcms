-- Add configurable required_approvals count to categories.
-- Default 1 preserves existing single-reviewer behaviour.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS required_approvals INT NOT NULL DEFAULT 1;
