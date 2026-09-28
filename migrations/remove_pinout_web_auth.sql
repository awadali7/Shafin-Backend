-- ========================================
-- Remove the old Pinout app login that used website accounts
-- (added by add_pinout_app_auth.sql). The app now has its own accounts —
-- see create_app_users.sql.
-- Run AFTER deploying the backend that no longer uses these columns.
-- Safe to run on a database that never had add_pinout_app_auth.sql applied.
-- ========================================

BEGIN;

\echo '1. Dropping pinout_login_otps table...'
DROP TABLE IF EXISTS pinout_login_otps;

\echo '2. Dropping pinout device columns from users...'
ALTER TABLE users DROP COLUMN IF EXISTS pinout_device_id;
ALTER TABLE users DROP COLUMN IF EXISTS pinout_device_info;
ALTER TABLE users DROP COLUMN IF EXISTS pinout_device_bound_at;

\echo '3. Removing Pinout app sessions and the client column from user_sessions...'
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_sessions' AND column_name = 'client'
    ) THEN
        DELETE FROM user_sessions WHERE client = 'pinout';
    END IF;
END $$;

DROP INDEX IF EXISTS idx_user_sessions_client;
ALTER TABLE user_sessions DROP COLUMN IF EXISTS client;

COMMIT;

\echo 'Old Pinout app login removed.'
