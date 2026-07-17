-- Add weekly price setting with default 560
-- Idempotent: ON CONFLICT (key) DO NOTHING allows safe re-runs

INSERT INTO settings (key, value)
VALUES ('weekly_price', '560')
ON CONFLICT (key) DO NOTHING;
