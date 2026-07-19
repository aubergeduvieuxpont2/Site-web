-- Stream 3: Stripe billing columns.
-- Idempotent via ADD COLUMN IF NOT EXISTS so re-running the migration is safe.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS stripe_invoice_id text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS invoice_status text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS paid_at timestamptz;
