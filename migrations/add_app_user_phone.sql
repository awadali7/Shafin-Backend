-- ========================================
-- Pinout App Users: phone number, asked for together with the serial number
-- - Stored normalized: digits with an optional leading +
-- - Nullable: accounts that submitted a serial before this change have none
-- Run BEFORE deploying the backend that reads app_users.phone.
-- ========================================

BEGIN;

\echo '1. Adding phone to app_users...'
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);

COMMIT;

\echo 'App user phone migration complete.'
