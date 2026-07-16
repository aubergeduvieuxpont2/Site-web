-- Migration 0013: split reservations.name into first_name and last_name.
-- Idempotent: ADD COLUMN IF NOT EXISTS is safe to re-run.

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS last_name TEXT;
