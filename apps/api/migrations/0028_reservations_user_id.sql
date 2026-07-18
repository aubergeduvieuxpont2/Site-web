-- Link reservations to users for portal access.

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS reservations_user_id ON reservations (user_id);
