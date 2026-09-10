-- 012: add published flag to lessons
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT false;
