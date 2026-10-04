-- +goose Up
-- +goose StatementBegin
ALTER TABLE articles ADD COLUMN interactive_metadata JSONB;
ALTER TABLE courses ADD COLUMN interactive_metadata JSONB;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE articles DROP COLUMN interactive_metadata;
ALTER TABLE courses DROP COLUMN interactive_metadata;
-- +goose StatementEnd
