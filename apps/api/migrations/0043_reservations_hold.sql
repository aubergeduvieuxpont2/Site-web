-- Stream 1: Reservation hold foundation columns.
-- Idempotent via ADD COLUMN IF NOT EXISTS so re-running the migration is safe.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;
