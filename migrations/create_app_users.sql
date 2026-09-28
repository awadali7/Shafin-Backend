-- ========================================
-- Pinout App Users: accounts separate from website users
-- - app_users: email + password accounts created in the Pinout app, each
--   claiming one serial number that an admin approves or rejects
-- - app_sessions: at most one active session per app user (a new login
--   ends the previous device's session)
-- - app_email_otps: email codes for app signup and password reset
-- Run BEFORE deploying the backend that serves /api/app.
-- ========================================

BEGIN;

\echo '1. Creating app_users table...'
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL, -- stored lowercase
    password_hash VARCHAR(255) NOT NULL,
    serial_number VARCHAR(50), -- stored normalized: no spaces, uppercase
    status VARCHAR(20) NOT NULL DEFAULT 'serial_required'
        CHECK (status IN ('serial_required', 'pending', 'approved', 'rejected')),
    rejection_reason TEXT,
    serial_submitted_at TIMESTAMP,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMP,
    last_login_device JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- A serial can be held by only one pending/approved account. Rejected
-- accounts release it, so someone who claims a serial that isn't theirs
-- can't block the real owner once an admin rejects them.
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_serial_unique
    ON app_users(serial_number)
    WHERE status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS idx_app_users_status ON app_users(status, serial_submitted_at DESC);

DROP TRIGGER IF EXISTS update_app_users_updated_at ON app_users;
CREATE TRIGGER update_app_users_updated_at BEFORE UPDATE ON app_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

\echo '2. Creating app_sessions table...'
CREATE TABLE IF NOT EXISTS app_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    device_id VARCHAR(128) NOT NULL,
    device_info JSONB,
    ip_address VARCHAR(45),
    is_active BOOLEAN NOT NULL DEFAULT true,
    ended_reason VARCHAR(20) CHECK (ended_reason IN ('logout', 'replaced', 'password_reset')),
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_sessions_user_active ON app_sessions(app_user_id, is_active);

\echo '3. Creating app_email_otps table...'
CREATE TABLE IF NOT EXISTS app_email_otps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('signup', 'reset_password')),
    otp_hash VARCHAR(255) NOT NULL,
    payload JSONB, -- signup: { full_name, password_hash } until the code is verified
    attempts INT NOT NULL DEFAULT 0,
    used BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_email_otps_email ON app_email_otps(email, purpose);

COMMIT;

\echo 'Pinout app users migration complete.'
