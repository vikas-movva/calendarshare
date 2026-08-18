-- 0013_share_event_owner.sql
--
-- Track which user each share_event belongs to. When a logged-in user adds
-- their calendar to a share, their events are merged in; this column lets the
-- public page attribute each busy block to the contributor who owns it.

ALTER TABLE share_events ADD COLUMN IF NOT EXISTS owner_user_id UUID;