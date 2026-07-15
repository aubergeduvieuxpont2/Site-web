-- Migration 0003: hubspot_outbox table (Neon Postgres).
-- Idempotent: CREATE TABLE / CREATE INDEX with IF NOT EXISTS are safe to re-run.

CREATE TABLE IF NOT EXISTS hubspot_outbox (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind            TEXT NOT NULL,
  payload         JSONB NOT NULL,
  dedupe_key      TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT,
  hubspot_id      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hubspot_outbox_due_idx
  ON hubspot_outbox (next_attempt_at) WHERE status = 'pending';
