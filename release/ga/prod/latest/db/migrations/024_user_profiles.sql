-- User learning profiles: persona, experience level, interests, preferred categories, learning goals.
-- Personalization event types added to MongoDB analytics_events (not SQL).
CREATE TABLE IF NOT EXISTS user_profiles (
    id                    SERIAL PRIMARY KEY,
    user_id               INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    experience_level      VARCHAR(20) NOT NULL DEFAULT 'beginner',   -- beginner | intermediate | advanced | expert
    role_type             VARCHAR(50) NOT NULL DEFAULT 'learner',    -- learner | developer | architect | manager | researcher | executive
    learning_goals        TEXT,
    onboarding_completed  BOOLEAN NOT NULL DEFAULT FALSE,
    interested_tag_ids    JSONB NOT NULL DEFAULT '[]',               -- tag IDs from the tags table
    preferred_category_ids JSONB NOT NULL DEFAULT '[]',              -- category IDs
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
