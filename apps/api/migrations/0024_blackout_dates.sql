-- Create blackout_dates table for admin-managed unavailable date ranges
-- Idempotent: CREATE TABLE IF NOT EXISTS allows safe re-runs

CREATE TABLE IF NOT EXISTS blackout_dates (
  date DATE PRIMARY KEY,
  rooms_blocked INTEGER NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
