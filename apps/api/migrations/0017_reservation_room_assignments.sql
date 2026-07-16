CREATE TABLE IF NOT EXISTS reservation_room_assignments (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservation_id BIGINT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  room_slug      TEXT   NOT NULL REFERENCES rooms(slug)       ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reservation_id, room_slug)
);
CREATE INDEX IF NOT EXISTS idx_rra_room_slug ON reservation_room_assignments (room_slug);
