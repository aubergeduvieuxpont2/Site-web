CREATE TABLE IF NOT EXISTS room_visibility (
  slug       TEXT PRIMARY KEY,
  is_public  BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO room_visibility (slug) VALUES
  ('chambre-quart'),
  ('refuge-rider'),
  ('gite-familial')
ON CONFLICT (slug) DO NOTHING;
