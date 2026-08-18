-- 0011_create_poll_slots.sql
--
-- A poll slot is one free time slot that voters can mark as "works for me".
-- Slots are derived from the share's free-time computation at poll creation
-- time, so they are immutable once created.

CREATE TABLE poll_slots (
    id UUID PRIMARY KEY,
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_poll_slots_poll_id
    ON poll_slots(poll_id);