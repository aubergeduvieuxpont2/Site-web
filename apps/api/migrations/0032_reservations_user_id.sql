-- Durable reservation -> portal-account link (email matching breaks the
-- moment a guest replaces their OTA relay address with their real email).
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS reservations_user_id ON reservations (user_id);
