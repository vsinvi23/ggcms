-- Add named multi-profile support. Each user can have multiple profiles;
-- exactly one is the active default at any time (enforced by partial unique index).
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS name VARCHAR(100) NOT NULL DEFAULT 'Default';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT TRUE;

-- Remove old single-profile unique constraint (was added by GORM auto-migrate or migration 024)
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_user_id_key;

-- Partial unique index: only one row per user may have is_default = TRUE
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_one_default
    ON user_profiles(user_id) WHERE is_default = TRUE;
