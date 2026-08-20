-- 0014_share_working_hours_days.sql
--
-- Persist which days of the week the 09:00–17:00 working-hours busy
-- blocks apply to. Stored as a JSON array of numbers where 0 = Sunday
-- through 6 = Saturday (matching JS Date.getDay()). When empty, the
-- legacy behaviour applies: every calendar day in the range is marked
-- busy during business hours.

ALTER TABLE shares ADD COLUMN IF NOT EXISTS working_hours_days jsonb;