-- 016: Content versioning — snapshot columns on articles/courses + version tracking in workflow_events
-- Snapshot columns hold the last-published state while a new draft revision is in review.
-- workflow_events gains version + title_snapshot for richer version-history display.

-- ── Snapshot fields on articles ──────────────────────────────────────────────
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS has_pending_draft    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS published_version    INT,
  ADD COLUMN IF NOT EXISTS published_title      TEXT,
  ADD COLUMN IF NOT EXISTS published_description TEXT,
  ADD COLUMN IF NOT EXISTS published_body       TEXT;

-- ── Snapshot fields on courses ───────────────────────────────────────────────
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS has_pending_draft    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS published_version    INT,
  ADD COLUMN IF NOT EXISTS published_title      TEXT,
  ADD COLUMN IF NOT EXISTS published_description TEXT,
  ADD COLUMN IF NOT EXISTS published_body       TEXT;

-- ── Extend workflow_events for version history display ───────────────────────
ALTER TABLE workflow_events
  ADD COLUMN IF NOT EXISTS version        INT,
  ADD COLUMN IF NOT EXISTS title_snapshot TEXT;
