CREATE TABLE IF NOT EXISTS rooms (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  capacity    INTEGER NOT NULL DEFAULT 1,
  image_key   TEXT,
  is_public   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bootstrap seed for a FRESH database only. This runner re-applies every
-- migration on each run, so an unconditional `INSERT ... ON CONFLICT DO NOTHING`
-- kept resurrecting rooms the admin had deleted. The `WHERE NOT EXISTS` gate
-- makes the seed all-or-nothing: it populates an empty rooms table on first
-- setup and is a no-op whenever any room already exists. Values mirror the
-- current room roster (chambre-01..12).
INSERT INTO rooms (slug, name, capacity, image_key, is_public)
SELECT slug, name, capacity, image_key, is_public
FROM (VALUES
  ('chambre-01', 'Chambre 01', 4, 'bedroom', true),
  ('chambre-02', 'Chambre 02', 2, 'bedroom', true),
  ('chambre-03', 'Chambre 03', 2, 'bedroom', true),
  ('chambre-04', 'Chambre 04', 2, 'bedroom', true),
  ('chambre-05', 'Chambre 05', 4, 'bedroom', true),
  ('chambre-06', 'Chambre 06', 4, 'bedroom', true),
  ('chambre-07', 'Chambre 07', 2, 'bedroom', true),
  ('chambre-08', 'Chambre 08', 2, 'bedroom', false),
  ('chambre-09', 'Chambre 09', 3, 'bedroom', false),
  ('chambre-10', 'Chambre 10', 1, 'bedroom', false),
  ('chambre-11', 'Chambre 11', 1, 'bedroom', false),
  ('chambre-12', 'Chambre 12', 1, 'bedroom', false)
) AS v(slug, name, capacity, image_key, is_public)
WHERE NOT EXISTS (SELECT 1 FROM rooms);
