-- ========================================
-- Phase 1.2: Add Business Fields to Student KYC
-- Allows students to upgrade to business owner by adding business info
-- ========================================

BEGIN;

\echo '========================================='
\echo 'Phase 1.2: Add Business Fields to KYC'
\echo '========================================='
\echo ''

-- ========================================
-- 1. Add business fields to kyc_verifications (Student KYC)
-- ========================================
\echo '1. Adding business upgrade fields to kyc_verifications...'

-- Add business_id field (optional - for upgrade)
ALTER TABLE kyc_verifications 
ADD COLUMN IF NOT EXISTS business_id VARCHAR(200);

-- Add business_location_link field (optional - for upgrade)
ALTER TABLE kyc_verifications 
ADD COLUMN IF NOT EXISTS business_location_link TEXT;

-- Add business_proof_url field (optional - for upgrade)
ALTER TABLE kyc_verifications 
ADD COLUMN IF NOT EXISTS business_proof_url VARCHAR(500);

-- Add flag to track if student upgraded to business
ALTER TABLE kyc_verifications 
ADD COLUMN IF NOT EXISTS upgraded_to_business BOOLEAN DEFAULT false;

-- Add timestamp for when business upgrade was done
ALTER TABLE kyc_verifications 
ADD COLUMN IF NOT EXISTS business_upgraded_at TIMESTAMP;

\echo '   ✓ business_id column added'
\echo '   ✓ business_location_link column added'
\echo '   ✓ business_proof_url column added'
\echo '   ✓ upgraded_to_business flag added'
\echo '   ✓ business_upgraded_at timestamp added'
\echo ''

-- ========================================
-- 2. Add index for business upgrades
-- ========================================
\echo '2. Adding indexes...'

CREATE INDEX IF NOT EXISTS idx_kyc_upgraded_to_business ON kyc_verifications(upgraded_to_business);

\echo '   ✓ Index created for business upgrades'
\echo ''

-- ========================================
-- 3. Add comments for documentation
-- ========================================

COMMENT ON COLUMN kyc_verifications.business_id IS 'Business ID/registration number - required for upgrading student to business owner';
COMMENT ON COLUMN kyc_verifications.business_location_link IS 'Business location link (Google Maps, etc) - required for upgrading student to business owner';
COMMENT ON COLUMN kyc_verifications.business_proof_url IS 'Business proof document URL - can be business license, GST certificate, etc';
COMMENT ON COLUMN kyc_verifications.upgraded_to_business IS 'Flag indicating if student upgraded to business owner status';
COMMENT ON COLUMN kyc_verifications.business_upgraded_at IS 'Timestamp when student upgraded to business owner';

\echo '3. Documentation comments added'
\echo ''

-- ========================================
-- 4. Show current KYC records
-- ========================================
\echo '4. Current KYC Records:'
SELECT 
    COUNT(*) as total_kyc_records,
    COUNT(CASE WHEN upgraded_to_business = true THEN 1 END) as upgraded_to_business,
    COUNT(CASE WHEN upgraded_to_business = false OR upgraded_to_business IS NULL THEN 1 END) as students_only
FROM kyc_verifications;

\echo ''
\echo '========================================='
\echo 'Phase 1.2 Complete!'
\echo '========================================='

COMMIT;

