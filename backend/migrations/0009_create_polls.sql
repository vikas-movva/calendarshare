-- 0009_create_polls.sql
--
-- A poll lets recipients vote on free time slots, like Doodle. A poll belongs
-- to exactly one share (the share whose free slots are being voted on).

CREATE TABLE polls (
    id UUID PRIMARY KEY,
    share_id UUID NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    title TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_polls_share_id
    ON polls(share_id);