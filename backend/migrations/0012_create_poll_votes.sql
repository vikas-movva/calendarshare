-- 0012_create_poll_votes.sql
--
-- A poll vote records that a person marked a slot as "works for me". Voters are
-- identified by email (not necessarily a registered user), so user_id is a
-- stable per-email UUID rather than a foreign key to users. The (slot_id,
-- user_id) pair is unique so re-voting updates the existing row.

CREATE TABLE poll_votes (
    id UUID PRIMARY KEY,
    slot_id UUID NOT NULL REFERENCES poll_slots(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (slot_id, user_id)
);

CREATE INDEX idx_poll_votes_slot_id
    ON poll_votes(slot_id);

CREATE INDEX idx_poll_votes_user_id
    ON poll_votes(user_id);
