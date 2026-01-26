-- ========================================
-- Phase 1.3: Update Notification Types
-- Add new notification types for the updated KYC flow
-- ========================================

BEGIN;

\echo '========================================='
\echo 'Phase 1.3: Update Notification Types'
\echo '========================================='
\echo ''

-- ========================================
-- 1. Drop existing constraint
-- ========================================
\echo '1. Removing old notification type constraint...'

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

\echo '   ✓ Old constraint removed'
\echo ''

-- ========================================
-- 2. Add new constraint with all notification types
-- ========================================
\echo '2. Adding new notification types...'

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
    CHECK (type IN (
        -- Course related
        'course_access_granted',
        'course_request_approved',
        'course_request_rejected',
        
        -- KYC related
        'kyc_verified',
        'kyc_rejected',
        'kyc_pending',
        'kyc_business_upgrade_verified',
        'kyc_business_upgrade_rejected',
        
        -- Product KYC related
        'product_kyc_verified',
        'product_kyc_rejected',
        'product_kyc_pending',
        
        -- Terms related
        'course_terms_required',
        'product_terms_required',
        
        -- Security related
        'multiple_device_login',
        
        -- General
        'announcement',
        'system_update',
        'order_status_update',
        'payment_success',
        'payment_failed'
    ));

\echo '   ✓ New notification types added:'
\echo '     - kyc_pending'
\echo '     - kyc_business_upgrade_verified'
\echo '     - kyc_business_upgrade_rejected'
\echo '     - product_kyc_pending'
\echo '     - course_terms_required'
\echo '     - product_terms_required'
\echo '     - order_status_update'
\echo '     - payment_success'
\echo '     - payment_failed'
\echo ''

-- ========================================
-- 3. Show current notification types
-- ========================================
\echo '3. Current Notification Statistics:'
SELECT 
    type,
    COUNT(*) as count
FROM notifications
GROUP BY type
ORDER BY count DESC
LIMIT 10;

\echo ''
\echo '========================================='
\echo 'Phase 1.3 Complete!'
\echo '========================================='

COMMIT;

