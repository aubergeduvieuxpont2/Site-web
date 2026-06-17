-- Canonical schema for site-web-db.
-- This file documents the full schema and can be used to bootstrap a fresh DB
-- for reference. The applied source of truth is the migrations/ directory.

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at);
