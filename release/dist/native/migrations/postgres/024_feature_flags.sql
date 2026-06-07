INSERT INTO app_settings (key, value) VALUES
    ('feature.learning_paths', 'false'),
    ('feature.interview_prep', 'false'),
    ('feature.social_login',   'false')
ON CONFLICT (key) DO NOTHING;
