-- Category → Reviewer Group mapping.
-- Allows admins to assign one or more reviewer groups to a category.
-- When content is submitted, reviewer group members can see the open review queue
-- and self-assign via "Assign to Me". Admins can also assign a specific reviewer.

CREATE TABLE IF NOT EXISTS category_reviewer_groups (
    category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    group_id    BIGINT NOT NULL REFERENCES groups(id)    ON DELETE CASCADE,
    PRIMARY KEY (category_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_crg_category ON category_reviewer_groups(category_id);
CREATE INDEX IF NOT EXISTS idx_crg_group    ON category_reviewer_groups(group_id);
