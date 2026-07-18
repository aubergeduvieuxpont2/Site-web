-- L6: audit trail for sensitive admin actions (e.g. minting a live password
-- reset link). Idempotent so re-running the migration runner is safe.
CREATE TABLE IF NOT EXISTS admin_audit (
  id             SERIAL PRIMARY KEY,
  admin_user_id  INTEGER NOT NULL,
  action         TEXT NOT NULL,
  target_user_id INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit (created_at DESC);
