-- Durable, cross-isolate rate limiting (M1).
-- Replaces the per-isolate in-memory Map limiters. Fixed-window counters keyed
-- by (bucket_key, window_start) for generic/auth IP limiting, plus a per-account
-- failed-login table for lockout. All DDL is idempotent (safe to re-run).

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key   TEXT   NOT NULL,
  window_start BIGINT NOT NULL,           -- epoch ms of the fixed window start
  count        INT    NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);

-- Lets a sweep prune old windows efficiently (optional housekeeping).
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start
  ON rate_limits (window_start);

CREATE TABLE IF NOT EXISTS login_failures (
  email        TEXT   NOT NULL,
  window_start BIGINT NOT NULL,           -- epoch ms of the fixed window start
  count        INT    NOT NULL DEFAULT 0,
  PRIMARY KEY (email, window_start)
);

-- Supports the "recent failures for this email" sum in isAccountLocked.
CREATE INDEX IF NOT EXISTS idx_login_failures_email_window
  ON login_failures (email, window_start);
