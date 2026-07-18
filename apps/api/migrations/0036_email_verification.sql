-- Email verification (closes review findings M4-residual + M10).
-- An account must not auto-claim reservations by email match until the email is
-- proven owned, and an email change must be confirmed at the new address before
-- taking effect.
--
-- `email_verified` DEFAULT true grandfathers every existing user (they were
-- already trusted); the register handler explicitly inserts `false` for NEW
-- accounts. No backfill UPDATE here: the runner re-applies every file on each
-- run, so `ADD COLUMN IF NOT EXISTS` is the idempotent guard we rely on.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email TEXT;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL,
  new_email  TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user
  ON email_verification_tokens(user_id);
