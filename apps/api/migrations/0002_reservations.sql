-- Migration 0002: reservations table (Neon Postgres).
-- Idempotent: CREATE TABLE / CREATE INDEX with IF NOT EXISTS are safe to
-- re-run. Each schema change stays in its own numbered migration file.

CREATE TABLE IF NOT EXISTS reservations (
  id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name     TEXT NOT NULL,
  email    TEXT NOT NULL,
  phone    TEXT,
  room     TEXT,
  arrive   DATE,
  depart   DATE,
  people   INT NOT NULL DEFAULT 1,
  message  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservations_created_at ON reservations (created_at);
