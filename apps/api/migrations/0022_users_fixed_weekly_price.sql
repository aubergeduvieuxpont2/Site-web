-- Add per-user fixed weekly price
-- Idempotent: ADD COLUMN IF NOT EXISTS allows safe re-runs

ALTER TABLE users ADD COLUMN IF NOT EXISTS fixed_weekly_price NUMERIC(10, 2);
