-- +goose Up
-- +goose StatementBegin
ALTER TABLE articles ADD COLUMN interactive_metadata JSONB;
ALTER TABLE courses ADD COLUMN interactive_metadata JSONB;
-- +goose StatementEnd

-- (Down migration removed because goose directives are not supported by the custom runner)
