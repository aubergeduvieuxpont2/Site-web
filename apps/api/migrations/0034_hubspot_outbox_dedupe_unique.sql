-- Migration 0034: DB backstop for outbox idempotency (finding H5).
-- A partial UNIQUE index on dedupe_key prevents two outbox rows from ever
-- carrying the same dedupe key (rows with a NULL dedupe_key are unconstrained).
-- This is the durable guarantee behind the search-before-create logic in the
-- HubSpot ops: even if two enqueues race, only one row per dedupe_key survives.
--
-- Idempotent: CREATE UNIQUE INDEX IF NOT EXISTS is safe to re-run.
-- NOTE: if the table already holds duplicate dedupe_key rows this will fail;
-- de-duplicate them first, then re-run.

CREATE UNIQUE INDEX IF NOT EXISTS hubspot_outbox_dedupe_key_uniq
  ON hubspot_outbox (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
