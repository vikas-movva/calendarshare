-- 0008_share_contributor_user_id.sql
--
-- A share can be created by a logged-in user (owner) but later extended by
-- other logged-in users who add their own calendars to the same date range.
-- contributor_user_id records the user whose calendars were merged into the
-- share's busy-time snapshot. It is NULL for the original owner-created share.

ALTER TABLE shares
    ADD COLUMN contributor_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_shares_contributor_user_id
    ON shares(contributor_user_id);