-- Phase P2: Taxonomy Integrity Auditor & Anti-Orphan Database Triggers
-- Enforces zero orphan categories, automatic parent re-linking, and audit reporting across database migrations & upgrades.

-- 1. Anti-Orphan Category Trigger Procedure
CREATE OR REPLACE FUNCTION fn_prevent_orphan_categories()
RETURNS TRIGGER AS $$
DECLARE
    geek_root_id BIGINT;
BEGIN
    -- Locate virtual 'geek' root if present
    SELECT id INTO geek_root_id FROM categories WHERE slug = 'geek' AND id != OLD.id LIMIT 1;

    -- Re-parent child categories to virtual 'geek' root (or NULL) before deletion
    UPDATE categories
    SET parent_id = geek_root_id,
        updated_at = NOW()
    WHERE parent_id = OLD.id;

    -- Clean up junction table references for deleted category
    DELETE FROM content_categories WHERE category_id = OLD.id;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger BEFORE DELETE ON categories
DROP TRIGGER IF EXISTS trg_prevent_orphan_categories ON categories;
CREATE TRIGGER trg_prevent_orphan_categories
BEFORE DELETE ON categories
FOR EACH ROW
EXECUTE FUNCTION fn_prevent_orphan_categories();

-- 2. Taxonomy Integrity Auditor & Self-Healing Procedure
CREATE OR REPLACE FUNCTION fn_audit_taxonomy_integrity()
RETURNS VOID AS $$
DECLARE
    geek_root_id BIGINT;
BEGIN
    SELECT id INTO geek_root_id FROM categories WHERE slug = 'geek' LIMIT 1;

    -- Step A: Heal orphaned parent_id pointers in categories table
    UPDATE categories c
    SET parent_id = geek_root_id,
        updated_at = NOW()
    WHERE parent_id IS NOT NULL
      AND parent_id != geek_root_id
      AND NOT EXISTS (SELECT 1 FROM categories p WHERE p.id = c.parent_id);

    -- Step B: Purge orphaned content_categories junction rows
    DELETE FROM content_categories cc
    WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = cc.category_id);

    -- Step C: Backfill missing domain_id on subcategories from parent domain
    UPDATE categories c
    SET domain_id = p.domain_id,
        updated_at = NOW()
    FROM categories p
    WHERE c.parent_id = p.id
      AND c.domain_id IS NULL
      AND p.domain_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- 3. Diagnostic Health Check Function for Verification
CREATE OR REPLACE FUNCTION fn_taxonomy_health_check()
RETURNS TABLE (
    check_name  TEXT,
    status      TEXT,
    issue_count INT,
    details     TEXT
) AS $$
BEGIN
    -- Check 1: Orphan categories (parent_id references non-existent category)
    RETURN QUERY
    SELECT 
        'Orphan Categories'::TEXT,
        CASE WHEN COUNT(1) = 0 THEN 'PASS'::TEXT ELSE 'FAIL'::TEXT END,
        COUNT(1)::INT,
        'Categories whose parent_id does not exist'::TEXT
    FROM categories c
    WHERE parent_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM categories p WHERE p.id = c.parent_id);

    -- Check 2: Orphan content-category links
    RETURN QUERY
    SELECT 
        'Orphan Content Category Links'::TEXT,
        CASE WHEN COUNT(1) = 0 THEN 'PASS'::TEXT ELSE 'FAIL'::TEXT END,
        COUNT(1)::INT,
        'Junction rows pointing to missing categories'::TEXT
    FROM content_categories cc
    WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = cc.category_id);

    -- Check 3: Subcategories missing domain_id
    RETURN QUERY
    SELECT 
        'Subcategories Missing Domain'::TEXT,
        CASE WHEN COUNT(1) = 0 THEN 'PASS'::TEXT ELSE 'WARN'::TEXT END,
        COUNT(1)::INT,
        'Categories without an assigned domain_id'::TEXT
    FROM categories c
    WHERE is_virtual = FALSE AND domain_id IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Execute self-healing audit at end of migration execution
SELECT fn_audit_taxonomy_integrity();
