-- Migration 0009 (neutralized): the `room_visibility` table was an early,
-- slug-keyed way to track per-room public visibility. It was superseded by the
-- `is_public` column on the `rooms` table (migration 0011) and is no longer read
-- or written by the application. Recreating/re-seeding it on every migrate run
-- (this runner re-applies all files each time) also kept resurrecting stale
-- room slugs, so this migration is now a no-op. The table is dropped in 0027.
SELECT 1;
