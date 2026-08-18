-- 0003_create_calendars.sql

CREATE TABLE calendars (
    id UUID PRIMARY KEY,
    connection_id UUID NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
    provider_calendar_id TEXT NOT NULL,
    name TEXT NOT NULL,
    timezone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_calendars_connection_provider_id
    ON calendars(connection_id, provider_calendar_id);

CREATE INDEX idx_calendars_connection_id
    ON calendars(connection_id);