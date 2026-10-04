ALTER TABLE articles ADD COLUMN IF NOT EXISTS interactive_metadata JSONB;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS interactive_metadata JSONB;

-- Convert 'Interview Track' courses into formal INTERVIEW Assessments
UPDATE courses
SET 
    course_type = 'ASSESSMENT',
    interactive_metadata = '{"assessmentType": "INTERVIEW", "contentType": "QA"}'::jsonb
WHERE title ILIKE '%Interview Track%';

-- Pick a few courses and turn them into PRACTICE Assessments so the Hub is populated
UPDATE courses
SET 
    course_type = 'ASSESSMENT',
    interactive_metadata = '{"assessmentType": "PRACTICE", "contentType": "MCQ"}'::jsonb
WHERE slug IN (
    'golang-distributed-systems',
    'oauth2-oidc-security',
    'kubernetes-advanced-networking',
    'enterprise-rag-llm'
);
