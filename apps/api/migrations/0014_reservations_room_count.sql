-- Migration 0014: add room_count to reservations.
-- Idempotent: ADD COLUMN IF NOT EXISTS is safe to re-run.

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS room_count INTEGER;
