INSERT INTO settings (key, value) VALUES
  ('tps',               '5'),
  ('tvq',               '9.975'),
  ('accommodation_tax', '3.5')
ON CONFLICT (key) DO NOTHING;
