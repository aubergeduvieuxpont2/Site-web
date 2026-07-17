-- Migration 0018: seed the configurable public phone number.
-- Idempotent: ON CONFLICT DO NOTHING leaves an operator-edited value untouched.

INSERT INTO settings (key, value)
VALUES ('contact_phone', '418 655-1212')
ON CONFLICT (key) DO NOTHING;
