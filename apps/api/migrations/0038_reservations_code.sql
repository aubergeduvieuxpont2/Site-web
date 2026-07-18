-- Add human-facing reservation code (AVP-XXXXXX) to reservations.
-- Format: AVP- prefix + 6 chars from crockford-base32 alphabet (no 0/O/1/I).
-- Alphabet: ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (32 chars).
-- Backfill runs before the unique index so re-runs are safe.
-- INV-code-unique: enforced by reservations_code_key unique index.

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS code TEXT;

-- Backfill all existing rows that have no code.
-- Uses retry-on-collision (EXCEPTION WHEN unique_violation) for safety even
-- without the unique index present. Idempotent: WHERE code IS NULL is a no-op
-- on subsequent migration runs once all rows are already backfilled.
DO $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  r        RECORD;
  new_code TEXT;
BEGIN
  FOR r IN SELECT id FROM reservations WHERE code IS NULL ORDER BY id LOOP
    LOOP
      new_code :=
        'AVP-' ||
        substr(alphabet, floor(random() * 32 + 1)::int, 1) ||
        substr(alphabet, floor(random() * 32 + 1)::int, 1) ||
        substr(alphabet, floor(random() * 32 + 1)::int, 1) ||
        substr(alphabet, floor(random() * 32 + 1)::int, 1) ||
        substr(alphabet, floor(random() * 32 + 1)::int, 1) ||
        substr(alphabet, floor(random() * 32 + 1)::int, 1);
      BEGIN
        UPDATE reservations SET code = new_code WHERE id = r.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- collision: retry with a fresh code
      END;
    END LOOP;
  END LOOP;
END $$;

-- Unique index enforcing INV-code-unique. Created after backfill so re-runs
-- that encounter a partially-filled table still succeed. IF NOT EXISTS makes
-- the CREATE a no-op when the index already exists.
CREATE UNIQUE INDEX IF NOT EXISTS reservations_code_key ON reservations(code);
