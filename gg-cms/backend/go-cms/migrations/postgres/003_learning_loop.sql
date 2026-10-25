-- 003: learning loop — server-authoritative progress, assessment attempts, certificates.
-- Idempotent: safe to re-run.

ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS last_lesson_id INTEGER REFERENCES lessons(id) ON DELETE SET NULL;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS assessment_id INTEGER REFERENCES courses(id) ON DELETE SET NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS require_assessment_pass BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_courses_assessment_id ON courses(assessment_id) WHERE assessment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS assessment_attempts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assessment_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    answers JSONB,
    score DECIMAL(5,2),
    correct_count INTEGER NOT NULL DEFAULT 0,
    total_questions INTEGER NOT NULL DEFAULT 0,
    pass_mark DECIMAL(5,2) NOT NULL DEFAULT 70,
    passed BOOLEAN NOT NULL DEFAULT false,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assessment_attempts_user_assessment ON assessment_attempts(user_id, assessment_id, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_assessment_attempts_one_open ON assessment_attempts(user_id, assessment_id) WHERE status = 'in_progress';

CREATE TABLE IF NOT EXISTS certificates (
    id SERIAL PRIMARY KEY,
    code VARCHAR(36) NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    enrollment_id INTEGER REFERENCES enrollments(id) ON DELETE SET NULL,
    recipient_name VARCHAR(255) NOT NULL,
    course_title VARCHAR(500) NOT NULL,
    score DECIMAL(5,2),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked BOOLEAN NOT NULL DEFAULT false,
    revoked_at TIMESTAMPTZ,
    revoked_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    revoke_reason VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_certificates_code ON certificates(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_certificates_user_course ON certificates(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_certificates_user_id ON certificates(user_id);
