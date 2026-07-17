-- Add reservations_enabled setting to toggle reservation intake (maintenance mode)
-- Idempotent: ON CONFLICT (key) DO NOTHING allows safe re-runs

INSERT INTO settings (key, value)
VALUES ('reservations_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
