-- ========================================
-- Pinout App Auth: email OTP login + single-device lock
-- - users.pinout_device_*: the one device an account may use in the Pinout app
-- - user_sessions.client: separates web sessions from Pinout app sessions so
--   single-session enforcement on one never logs out the other
-- - pinout_login_otps: pending email OTP challenges
-- ========================================

BEGIN;

\echo '1. Adding pinout device columns to users...'
ALTER TABLE users ADD COLUMN IF NOT EXISTS pinout_device_id VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS pinout_device_info JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pinout_device_bound_at TIMESTAMP;

\echo '2. Adding client column to user_sessions (existing rows become web)...'
ALTER TABLE user_sessions
ADD COLUMN IF NOT EXISTS client VARCHAR(20) NOT NULL DEFAULT 'web'
CHECK (client IN ('web', 'pinout'));

CREATE INDEX IF NOT EXISTS idx_user_sessions_client ON user_sessions(user_id, client, is_active);

\echo '3. Creating pinout_login_otps table...'
CREATE TABLE IF NOT EXISTS pinout_login_otps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(128) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    used BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pinout_login_otps_user_id ON pinout_login_otps(user_id);

COMMIT;

\echo 'Pinout app auth migration complete.'
