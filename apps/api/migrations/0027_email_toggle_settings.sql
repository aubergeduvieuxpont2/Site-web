-- Seed email toggle settings (all off by default). Idempotent.

INSERT INTO settings (key, value) VALUES
  ('email_confirmation_enabled',    'false'),
  ('email_password_reset_enabled',  'false'),
  ('email_room_assignment_enabled', 'false'),
  ('email_welcome_enabled',         'false')
ON CONFLICT (key) DO NOTHING;
