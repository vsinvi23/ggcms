-- 047 referenced course slugs that were never seeded, leaving 'system-design' empty and 'api-security' short.
-- Only fills seeded paths that are still empty / incomplete; never touches paths an admin has curated.

INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, v.ord
FROM learning_paths lp
JOIN (VALUES
    (1, 'system-design-interview-track'),
    (2, 'data-modeling-event-driven-systems'),
    (3, 'postgresql-and-data-architecture')
) AS v(ord, slug) ON TRUE
JOIN courses crs ON crs.slug = v.slug
WHERE lp.slug = 'system-design'
  AND NOT EXISTS (SELECT 1 FROM learning_path_courses x WHERE x.learning_path_id = lp.id);

INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, 0
FROM learning_paths lp
JOIN courses crs ON crs.slug = 'securing-enterprise-applications-api-security'
WHERE lp.slug = 'api-security'
  AND (SELECT COUNT(*) FROM learning_path_courses x WHERE x.learning_path_id = lp.id) < 3
  AND NOT EXISTS (SELECT 1 FROM learning_path_courses x WHERE x.learning_path_id = lp.id AND x.course_id = crs.id);
