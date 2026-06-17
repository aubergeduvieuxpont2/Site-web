-- Migration 0001: initial schema.
-- Idempotent: CREATE TABLE / CREATE INDEX with IF NOT EXISTS are safe to
-- re-run. No ALTER TABLE here (column adds are inherently non-idempotent in
-- SQLite/D1 and must live in their own migration if ever needed).

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at);
