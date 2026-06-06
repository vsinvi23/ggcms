INSERT INTO app_settings (key, value) VALUES
    ('feature.learning_paths', 'false'),
    ('feature.interview_prep', 'false'),
    ('feature.social_login',   'true')
ON CONFLICT (key) DO NOTHING;
