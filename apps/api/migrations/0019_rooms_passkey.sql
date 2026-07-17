-- Migration 0019: per-room pass-key (door/lock code) with an enable toggle.
-- Idempotent: Postgres supports ADD COLUMN IF NOT EXISTS.

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS passkey_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS passkey TEXT;
