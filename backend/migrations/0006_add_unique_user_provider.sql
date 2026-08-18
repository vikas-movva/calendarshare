-- 0006_add_unique_user_provider.sql
--
-- upsert_connection relies on ON CONFLICT (user_id, provider) to update an
-- existing calendar connection when a user re-authenticates with the same
-- provider. The original migration never created that constraint, so the
-- upsert fails with "no unique or exclusion constraint matching the ON CONFLICT
-- specification". Add it here.

ALTER TABLE calendar_connections
    ADD CONSTRAINT uq_calendar_connections_user_provider
    UNIQUE (user_id, provider);