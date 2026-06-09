-- When a reviewer sends content back for revision, we save a snapshot of the
-- content at that moment so the next reviewer can see exactly what changed
-- between the returned version and the re-submitted revision.
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS review_baseline_title       TEXT,
  ADD COLUMN IF NOT EXISTS review_baseline_description TEXT,
  ADD COLUMN IF NOT EXISTS review_baseline_body        TEXT;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS review_baseline_title       TEXT,
  ADD COLUMN IF NOT EXISTS review_baseline_description TEXT,
  ADD COLUMN IF NOT EXISTS review_baseline_body        TEXT;
