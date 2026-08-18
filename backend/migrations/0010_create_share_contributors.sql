-- 0010_create_share_contributors.sql
--
-- Records which users have contributed calendars to a share. A user can
-- contribute multiple calendars. The share's busy-time snapshot is the union
-- of every contributor's events within the share's date range.

CREATE TABLE share_contributors (
    id UUID PRIMARY KEY,
    share_id UUID NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    calendar_id UUID NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (share_id, user_id, calendar_id)
);

CREATE INDEX idx_share_contributors_share_id
    ON share_contributors(share_id);

CREATE INDEX idx_share_contributors_user_id
    ON share_contributors(user_id);