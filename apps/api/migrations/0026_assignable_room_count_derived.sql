-- Migration 0026: assignable_room_count is now derived from the number of
-- public rooms rather than manually edited. Seed/refresh the settings cache from
-- the current rooms table so it matches reality; the API keeps it in sync on
-- every room create/update/delete and on each settings save thereafter.
-- Idempotent: the upsert is safe to re-run.
INSERT INTO settings (key, value)
VALUES (
  'assignable_room_count',
  (SELECT count(*)::text FROM rooms WHERE is_public = true)
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
