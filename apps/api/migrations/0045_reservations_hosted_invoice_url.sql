-- Add hosted invoice URL column to reservations table.
-- Populated when a Stripe invoice is finalized; NULL for pre-existing rows.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS hosted_invoice_url TEXT;
