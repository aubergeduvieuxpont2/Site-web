-- Moderated guest reviews.
-- One review per reservation (UNIQUE on reservation_id enforces INV-one-review-per-reservation).
-- display_name is pre-masked server-side at submission (e.g. "Marie T.") — raw guest
-- identity is never stored in this table (INV-masked-identity).
-- stays_count / nights_total are snapshots computed at submission time.
-- status lifecycle: pending → approved | rejected (re-moderation allowed).

CREATE TABLE IF NOT EXISTS reviews (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservation_id BIGINT NOT NULL UNIQUE REFERENCES reservations(id),
  rating         INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  display_name   TEXT NOT NULL,
  stays_count    INT NOT NULL,
  nights_total   INT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  moderated_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reviews_status        ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_reservation_id ON reviews(reservation_id);
