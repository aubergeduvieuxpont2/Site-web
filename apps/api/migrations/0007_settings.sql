CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value) VALUES
  ('nightly_price',          '89'),
  ('contact_email',          'info@aubergeduvieuxpont.ca'),
  ('marketing_room_count',   '12'),
  ('assignable_room_count',  '12')
ON CONFLICT (key) DO NOTHING;
