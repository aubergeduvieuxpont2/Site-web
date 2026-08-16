-- Review-request lifecycle: reminder + response tracking.
-- Both columns are nullable; existing rows are unaffected and the
-- currently-deployed API ignores them.
ALTER TABLE review_requests ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE review_requests ADD COLUMN IF NOT EXISTS responded_at     TIMESTAMPTZ;

-- Supports the per-guest suppression subquery, which matches on lower(email).
CREATE INDEX IF NOT EXISTS idx_reservations_email_lower ON reservations (lower(email));
