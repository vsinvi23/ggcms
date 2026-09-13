-- 020: Add is_virtual flag to categories and create the system "geek" root.
--
-- "Geek" is the virtual root category. It is:
--   1. Hidden from all regular category listings (is_virtual = true).
--   2. The parent of every top-level category — so assigning a reviewer group
--      to "Geek" grants access to ALL content across ALL categories.
--   3. Created once here and seeded by bootstrap/admin.go on every startup.

-- Step 1: Add the is_virtual column (safe to run multiple times).
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS is_virtual BOOLEAN NOT NULL DEFAULT FALSE;

-- Step 2: Create the "geek" virtual root category if it doesn't exist yet,
--         then re-parent all existing top-level categories under it.
DO $$
DECLARE
  geek_id BIGINT;
BEGIN
  -- Insert "geek" only once; get back its ID either way.
  INSERT INTO categories (name, slug, parent_id, is_virtual, created_at, updated_at)
    VALUES ('geek', 'geek', NULL, TRUE, NOW(), NOW())
    ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO geek_id FROM categories WHERE slug = 'geek' AND is_virtual = TRUE;

  IF geek_id IS NULL THEN
    RAISE EXCEPTION 'Failed to resolve geek virtual root category ID';
  END IF;

  -- Re-parent every existing top-level (non-virtual) category under "geek".
  UPDATE categories
    SET parent_id = geek_id, updated_at = NOW()
    WHERE parent_id IS NULL
      AND id <> geek_id
      AND is_virtual = FALSE;
END $$;

-- Step 3: Index the new column so virtual-filter queries stay fast.
CREATE INDEX IF NOT EXISTS idx_categories_is_virtual ON categories(is_virtual);
