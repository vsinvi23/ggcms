-- 011: workflow_events audit log table
CREATE TABLE IF NOT EXISTS workflow_events (
    id          SERIAL PRIMARY KEY,
    entity_type VARCHAR(20)  NOT NULL,
    entity_id   INTEGER      NOT NULL,
    user_id     INTEGER      NOT NULL REFERENCES users(id),
    from_status VARCHAR(20),
    to_status   VARCHAR(20)  NOT NULL,
    action      VARCHAR(30)  NOT NULL,
    comment     TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_events_entity ON workflow_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_user   ON workflow_events (user_id);
