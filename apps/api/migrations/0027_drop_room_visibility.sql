-- Migration 0027: drop the orphaned `room_visibility` table.
-- It was superseded by `rooms.is_public` (migration 0011) and has no runtime
-- readers/writers. Idempotent: DROP TABLE IF EXISTS is safe to re-run and on a
-- fresh database where the table was never created.
DROP TABLE IF EXISTS room_visibility;
