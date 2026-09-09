-- Phase P0: Default Category Tree Seed
-- Idempotently seeds the 2-level category hierarchy under the virtual 'geek' root category.
-- Per TAXONOMY_ARCHITECTURE_DECISION.md §7.

DO $$
DECLARE
    geek_root_id BIGINT;
    swe_id BIGINT;
    cloud_id BIGINT;
    sec_id BIGINT;
    data_id BIGINT;
    aiml_id BIGINT;
BEGIN
    -- Obtain virtual root ID if exists, or fallback
    SELECT id INTO geek_root_id FROM categories WHERE slug = 'geek';

    -- Top Level 1 Categories
    INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
    VALUES ('Software Engineering', 'software-engineering', geek_root_id, false, 1)
    ON CONFLICT (slug) DO NOTHING;
    SELECT id INTO swe_id FROM categories WHERE slug = 'software-engineering';

    INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
    VALUES ('Cloud & Infrastructure', 'cloud-infrastructure', geek_root_id, false, 1)
    ON CONFLICT (slug) DO NOTHING;
    SELECT id INTO cloud_id FROM categories WHERE slug = 'cloud-infrastructure';

    INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
    VALUES ('Cybersecurity', 'cybersecurity', geek_root_id, false, 1)
    ON CONFLICT (slug) DO NOTHING;
    SELECT id INTO sec_id FROM categories WHERE slug = 'cybersecurity';

    INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
    VALUES ('Data', 'data', geek_root_id, false, 1)
    ON CONFLICT (slug) DO NOTHING;
    SELECT id INTO data_id FROM categories WHERE slug = 'data';

    INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
    VALUES ('AI & Machine Learning', 'ai-machine-learning', geek_root_id, false, 1)
    ON CONFLICT (slug) DO NOTHING;
    SELECT id INTO aiml_id FROM categories WHERE slug = 'ai-machine-learning';

    -- Level 2 Subcategories
    -- Software Engineering
    IF swe_id IS NOT NULL THEN
        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Programming Languages', 'programming-languages', swe_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Backend & APIs', 'backend-apis', swe_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Software Design', 'software-design', swe_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;
    END IF;

    -- Cloud & Infrastructure
    IF cloud_id IS NOT NULL THEN
        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Cloud Platforms', 'cloud-platforms', cloud_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Containers & Orchestration', 'containers-orchestration', cloud_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Infrastructure as Code', 'infrastructure-as-code', cloud_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;
    END IF;

    -- Cybersecurity
    IF sec_id IS NOT NULL THEN
        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Identity & Access', 'identity-access', sec_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('PKI & Cryptography', 'pki-cryptography', sec_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('AppSec & Threats', 'appsec-threats', sec_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;
    END IF;

    -- Data
    IF data_id IS NOT NULL THEN
        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Databases', 'databases', data_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Data Engineering', 'data-engineering', data_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;
    END IF;

    -- AI & Machine Learning
    IF aiml_id IS NOT NULL THEN
        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Machine Learning Foundations', 'machine-learning-foundations', aiml_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO categories (name, slug, parent_id, is_virtual, required_approvals)
        VALUES ('Generative AI', 'generative-ai', aiml_id, false, 1)
        ON CONFLICT (slug) DO NOTHING;
    END IF;
END $$;
