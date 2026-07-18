-- Review requests deduplication table.
-- One row per reservation (PRIMARY KEY) enforces INV-request-dedupe: a cron
-- that was temporarily down cannot re-send a review-request email on catch-up
-- once a row is present.
-- channel is reserved for future SMS support; current value is always 'email'.

CREATE TABLE IF NOT EXISTS review_requests (
  reservation_id BIGINT PRIMARY KEY REFERENCES reservations(id),
  channel        TEXT NOT NULL DEFAULT 'email',
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
