-- Canonical schema for the Neon Postgres database (site-web).
-- This file documents the full schema for reference. The applied source of
-- truth is the migrations/ directory (run with `npm run db:migrate`).

CREATE TABLE IF NOT EXISTS messages (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at);

CREATE TABLE IF NOT EXISTS reservations (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT,
  room       TEXT,
  arrive     DATE,
  depart     DATE,
  people     INT NOT NULL DEFAULT 1,
  message    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservations_created_at ON reservations (created_at);

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
