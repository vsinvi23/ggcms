-- 047 referenced course slugs that were never seeded, leaving every seeded path except
-- 'backend-go-developer' empty. Link each seeded path to courses that actually exist.
-- Safe & idempotent:
--   * only fills paths that currently have NO linked courses (never touches admin-curated paths)
--   * JOIN on courses.slug silently skips slugs that do not exist in a given environment
--   * ON CONFLICT guards against duplicate (path, course) rows
--   * emits a NOTICE with the number of rows linked per path so silent no-ops are visible in logs

DO $$
DECLARE
    rec RECORD;
    linked INT;
BEGIN
    FOR rec IN
        SELECT * FROM (VALUES
            ('system-design',          ARRAY['distributed-systems-system-design-fundamentals']),
            ('api-security',           ARRAY['secure-api-design-session-security',
                                             'oauth2-oidc-jwt-from-zero-to-attacks']),
            ('cybersecurity-identity', ARRAY['cybersecurity-fundamentals-from-scratch',
                                             'oauth2-oidc-jwt-from-zero-to-attacks',
                                             'software-ai-supply-chain-security']),
            ('cloud-devops',           ARRAY['platform-engineering-for-ai-workloads',
                                             'observability-for-ai-native-systems-tracing-tokens-and-failures']),
            ('software-engineering',   ARRAY['c-internals-from-scratch',
                                             'c-internals-from-scratch-memory-ownership-concurrency-and-the-stl',
                                             'java-internals-from-scratch-jvm-memory-concurrency-and-production-services']),
            ('ai-ml-engineering',      ARRAY['platform-engineering-for-ai-workloads',
                                             'observability-for-ai-native-systems-tracing-tokens-and-failures'])
        ) AS m(path_slug, course_slugs)
    LOOP
        IF EXISTS (
            SELECT 1 FROM learning_path_courses x
            JOIN learning_paths lp ON lp.id = x.learning_path_id
            WHERE lp.slug = rec.path_slug
        ) THEN
            RAISE NOTICE '048: path % already has courses, skipped', rec.path_slug;
            CONTINUE;
        END IF;

        INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
        SELECT lp.id, c.id, s.ord
        FROM learning_paths lp
        JOIN unnest(rec.course_slugs) WITH ORDINALITY AS s(slug, ord) ON TRUE
        JOIN courses c ON c.slug = s.slug
        WHERE lp.slug = rec.path_slug
        ON CONFLICT DO NOTHING;

        GET DIAGNOSTICS linked = ROW_COUNT;
        RAISE NOTICE '048: path % linked % course(s)', rec.path_slug, linked;
    END LOOP;
END $$;
