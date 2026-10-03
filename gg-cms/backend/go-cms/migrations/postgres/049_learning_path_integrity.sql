-- Referential integrity for learning_path_courses: remove orphans/duplicates, then enforce FK + uniqueness.
DELETE FROM learning_path_courses x WHERE NOT EXISTS (SELECT 1 FROM courses c WHERE c.id = x.course_id);

DELETE FROM learning_path_courses a USING learning_path_courses b
WHERE a.learning_path_id = b.learning_path_id AND a.course_id = b.course_id AND a.id > b.id;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_lpc_course') THEN
        ALTER TABLE learning_path_courses
            ADD CONSTRAINT fk_lpc_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lpc_path_course ON learning_path_courses (learning_path_id, course_id);
