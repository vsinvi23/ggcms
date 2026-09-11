-- 018_chapter_snapshots.sql
-- Store a snapshot of the chapter/lesson hierarchy at publish and send-back time
-- so the review diff view can highlight new, modified, and removed items.

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS published_chapters_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS review_baseline_chapters    JSONB;
