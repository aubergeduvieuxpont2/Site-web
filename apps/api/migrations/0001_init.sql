-- Migration 0001: initial schema (Neon Postgres).
-- Idempotent: CREATE TABLE / CREATE INDEX with IF NOT EXISTS are safe to
-- re-run. Postgres supports `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so
-- future column additions can be idempotent too — still keep each schema
-- change in its own numbered migration file.

CREATE TABLE IF NOT EXISTS messages (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at);
