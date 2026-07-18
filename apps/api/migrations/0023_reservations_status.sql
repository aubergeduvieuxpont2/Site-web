-- Add reservation status (pending | confirmed | cancelled).
--
-- Backfill strategy: existing rows are real bookings and must count as
-- 'confirmed'. Rather than an UPDATE keyed on now() (which the runner — it
-- re-applies every file on each migrate — would use to flip *newly* pending
-- reservations to confirmed on a later run), we add the column defaulting to
-- 'confirmed' (so pre-existing rows are backfilled exactly once, when the column
-- is first created) and then switch the default to 'pending' for future inserts.
-- New public reservations set status = 'pending' explicitly at INSERT time, so the
-- column default only matters as a safety net. Both statements are idempotent.

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed';
ALTER TABLE reservations ALTER COLUMN status SET DEFAULT 'pending';
