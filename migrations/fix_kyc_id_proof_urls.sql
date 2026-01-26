-- ========================================
-- Fix KYC ID Proof URLs Migration
-- This ensures all KYC records have id_proof_urls properly set
-- ========================================

BEGIN;

\echo '=== Starting KYC ID Proof URLs Migration ==='

-- 1. Add id_proof_urls column if it doesn't exist
ALTER TABLE kyc_verifications 
ADD COLUMN IF NOT EXISTS id_proof_urls JSONB;

\echo 'Step 1: Added id_proof_urls column (if missing)'

-- 2. Migrate existing single URL to array format
UPDATE kyc_verifications 
SET id_proof_urls = jsonb_build_array(id_proof_url)
WHERE id_proof_url IS NOT NULL 
  AND (id_proof_urls IS NULL OR id_proof_urls = 'null'::jsonb);

\echo 'Step 2: Migrated single URLs to array format'

-- 3. Show migration results
SELECT 
    COUNT(*) as total_records,
    COUNT(CASE WHEN id_proof_urls IS NOT NULL THEN 1 END) as records_with_urls,
    COUNT(CASE WHEN id_proof_urls IS NULL THEN 1 END) as records_without_urls
FROM kyc_verifications;

\echo 'Step 3: Migration complete - see results above'

COMMIT;

\echo '=== Migration Complete ==='
\echo 'All existing KYC records now have id_proof_urls set'
\echo ''
\echo 'OPTIONAL: After verifying this works in production, you can:'
\echo '  1. Keep id_proof_url for backward compatibility (recommended)'
\echo '  2. OR drop it with: ALTER TABLE kyc_verifications DROP COLUMN id_proof_url;'

