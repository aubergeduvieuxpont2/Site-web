-- Outbound transactional email queue, drained by the API worker's cron.
-- Mirrors the hubspot_outbox lifecycle (pending -> delivered | failed).
CREATE TABLE IF NOT EXISTS email_outbox (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  to_email TEXT NOT NULL,
  template TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'fr',
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  provider_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_outbox_status_next_attempt
  ON email_outbox (status, next_attempt_at);
