-- OTA (Airbnb/Expedia) email-ingest support.
-- source: where the reservation came from ('website' | 'airbnb' | 'expedia').
-- external_ref: the OTA confirmation code / reservation id, used for dedupe.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'website';
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS external_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS reservations_source_external_ref
  ON reservations (source, external_ref)
  WHERE external_ref IS NOT NULL;

-- One row per processed booking-relevant email (parsed | parse_failed | duplicate | ignored).
CREATE TABLE IF NOT EXISTS email_ingest_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider TEXT,
  status TEXT NOT NULL,
  reservation_id BIGINT REFERENCES reservations(id) ON DELETE SET NULL,
  subject TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_ingest_log_created_at ON email_ingest_log (created_at DESC);
