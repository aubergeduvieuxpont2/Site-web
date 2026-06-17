-- Canonical schema for the Neon Postgres database (site-web).
-- This file documents the full schema for reference. The applied source of
-- truth is the migrations/ directory (run with `npm run db:migrate`).

CREATE TABLE IF NOT EXISTS messages (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at);
