-- ========================================
-- PHASE 1 COMPLETE: New KYC System Database Migration
-- ========================================
-- This migration implements the new KYC flow:
-- - Student KYC → Can buy courses (after approval)
-- - Student can upgrade to Business Owner → Can buy KYC products
-- - Business Owner KYC → Can buy products and courses
-- - Separate Course Terms and Product Terms acceptance
-- ========================================

\echo ''
\echo '╔════════════════════════════════════════╗'
\echo '║   PHASE 1: New KYC System Migration    ║'
\echo '║   Student & Business Owner Flows       ║'
\echo '╚════════════════════════════════════════╝'
\echo ''

-- ========================================
-- STEP 1: Add User Type and Terms
-- ========================================
\echo '📋 STEP 1: Adding user type and terms columns...'
\echo ''

BEGIN;

-- Add user_type column
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS user_type VARCHAR(20) CHECK (user_type IN ('student', 'business_owner'));

CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);

-- Add separate terms acceptance columns
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS course_terms_accepted_at TIMESTAMP;

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS product_terms_accepted_at TIMESTAMP;

-- Migrate existing terms_accepted_at data
UPDATE users 
SET 
    course_terms_accepted_at = terms_accepted_at,
    product_terms_accepted_at = terms_accepted_at
WHERE terms_accepted_at IS NOT NULL;

COMMIT;

\echo '✓ User type and terms columns added'
\echo ''

-- ========================================
-- STEP 2: Add Business Fields to Student KYC
-- ========================================
\echo '📋 STEP 2: Adding business upgrade fields to Student KYC...'
\echo ''

BEGIN;

-- Add business upgrade fields
ALTER TABLE kyc_verifications 
ADD COLUMN IF NOT EXISTS business_id VARCHAR(200);

ALTER TABLE kyc_verifications 
ADD COLUMN IF NOT EXISTS business_location_link TEXT;

ALTER TABLE kyc_verifications 
ADD COLUMN IF NOT EXISTS business_proof_url VARCHAR(500);

ALTER TABLE kyc_verifications 
ADD COLUMN IF NOT EXISTS upgraded_to_business BOOLEAN DEFAULT false;

ALTER TABLE kyc_verifications 
ADD COLUMN IF NOT EXISTS business_upgraded_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_kyc_upgraded_to_business ON kyc_verifications(upgraded_to_business);

-- Add documentation
COMMENT ON COLUMN kyc_verifications.business_id IS 'Business ID/registration number - required for upgrading student to business owner';
COMMENT ON COLUMN kyc_verifications.business_location_link IS 'Business location link (Google Maps, etc) - required for upgrading student to business owner';
COMMENT ON COLUMN kyc_verifications.business_proof_url IS 'Business proof document URL - can be business license, GST certificate, etc';
COMMENT ON COLUMN kyc_verifications.upgraded_to_business IS 'Flag indicating if student upgraded to business owner status';
COMMENT ON COLUMN kyc_verifications.business_upgraded_at IS 'Timestamp when student upgraded to business owner';

COMMIT;

\echo '✓ Business upgrade fields added to Student KYC'
\echo ''

-- ========================================
-- STEP 3: Update Notification Types
-- ========================================
\echo '📋 STEP 3: Updating notification types...'
\echo ''

BEGIN;

-- Drop existing constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add new constraint with all notification types
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
    CHECK (type IN (
        -- Course related
        'course_access_granted',
        'course_request_approved',
        'course_request_rejected',
        
        -- KYC related (Student)
        'kyc_verified',
        'kyc_rejected',
        'kyc_pending',
        'kyc_business_upgrade_verified',
        'kyc_business_upgrade_rejected',
        
        -- Product KYC related (Business Owner)
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

COMMIT;

\echo '✓ Notification types updated'
\echo ''

-- ========================================
-- STEP 4: Verification - Show Results
-- ========================================
\echo '╔════════════════════════════════════════╗'
\echo '║      MIGRATION VERIFICATION            ║'
\echo '╚════════════════════════════════════════╝'
\echo ''

\echo '1️⃣  Users Table:'
SELECT 
    COUNT(*) as total_users,
    COUNT(CASE WHEN user_type = 'student' THEN 1 END) as students,
    COUNT(CASE WHEN user_type = 'business_owner' THEN 1 END) as business_owners,
    COUNT(CASE WHEN user_type IS NULL THEN 1 END) as no_type_set,
    COUNT(CASE WHEN course_terms_accepted_at IS NOT NULL THEN 1 END) as course_terms_accepted,
    COUNT(CASE WHEN product_terms_accepted_at IS NOT NULL THEN 1 END) as product_terms_accepted
FROM users;

\echo ''
\echo '2️⃣  KYC Verifications (Student KYC):'
SELECT 
    COUNT(*) as total_student_kyc,
    COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
    COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
    COUNT(CASE WHEN upgraded_to_business = true THEN 1 END) as upgraded_to_business
FROM kyc_verifications;

\echo ''
\echo '3️⃣  Product KYC Verifications (Business Owner KYC):'
SELECT 
    COUNT(*) as total_business_kyc,
    COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
    COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
FROM product_kyc_verifications;

\echo ''
\echo '4️⃣  Schema Verification:'
\echo '   Checking new columns exist...'

DO $$
DECLARE
    missing_columns TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Check users table columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'user_type') THEN
        missing_columns := array_append(missing_columns, 'users.user_type');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'course_terms_accepted_at') THEN
        missing_columns := array_append(missing_columns, 'users.course_terms_accepted_at');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'product_terms_accepted_at') THEN
        missing_columns := array_append(missing_columns, 'users.product_terms_accepted_at');
    END IF;
    
    -- Check kyc_verifications table columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kyc_verifications' AND column_name = 'business_id') THEN
        missing_columns := array_append(missing_columns, 'kyc_verifications.business_id');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kyc_verifications' AND column_name = 'business_location_link') THEN
        missing_columns := array_append(missing_columns, 'kyc_verifications.business_location_link');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kyc_verifications' AND column_name = 'upgraded_to_business') THEN
        missing_columns := array_append(missing_columns, 'kyc_verifications.upgraded_to_business');
    END IF;
    
    -- Report results
    IF array_length(missing_columns, 1) IS NULL THEN
        RAISE NOTICE '   ✓ All required columns exist!';
    ELSE
        RAISE WARNING '   ⚠ Missing columns: %', array_to_string(missing_columns, ', ');
    END IF;
END $$;

\echo ''
\echo '╔════════════════════════════════════════╗'
\echo '║    PHASE 1 MIGRATION COMPLETE! ✅       ║'
\echo '╚════════════════════════════════════════╝'
\echo ''
\echo '📊 Summary:'
\echo '   ✓ User type system added (student/business_owner)'
\echo '   ✓ Separate course and product terms tracking'
\echo '   ✓ Student → Business upgrade capability'
\echo '   ✓ Notification types updated'
\echo ''
\echo '🎯 Next Steps:'
\echo '   - Implement Phase 2: Backend API updates'
\echo '   - Implement Phase 3: Frontend UI updates'
\echo '   - Test the complete flow'
\echo ''

