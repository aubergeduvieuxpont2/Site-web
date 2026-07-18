-- Per-email-type kill switches, all OFF by default so the operator can
-- enable them one at a time from admin -> Parametres.
INSERT INTO settings (key, value) VALUES
  ('email_confirmation_enabled', 'false'),
  ('email_password_reset_enabled', 'false'),
  ('email_room_assignment_enabled', 'false'),
  ('email_welcome_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
