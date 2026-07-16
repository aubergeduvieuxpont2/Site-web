CREATE TABLE IF NOT EXISTS rooms (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  capacity    INTEGER NOT NULL DEFAULT 1,
  image_key   TEXT,
  is_public   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO rooms (slug, name, capacity, image_key, is_public) VALUES
  ('chambre-quart', 'La Chambre du Quart', 2, 'bedroom', true),
  ('refuge-rider',  'La Chambre de la Rivière', 2, 'balcony', true),
  ('gite-familial', 'Le Gîte Familial', 5, 'living-dining', true)
ON CONFLICT (slug) DO NOTHING;
