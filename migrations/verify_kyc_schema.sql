-- ========================================
-- KYC Schema Verification and Fix Script
-- Run this to verify and fix your KYC implementation
-- ========================================

-- Check current schema for both KYC tables
\echo '=== Checking KYC Tables Schema ==='

-- 1. Check kyc_verifications table columns
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'kyc_verifications'
ORDER BY ordinal_position;

-- 2. Check product_kyc_verifications table columns
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'product_kyc_verifications'
ORDER BY ordinal_position;

-- 3. Check for id_proof_urls column (should exist for multiple files)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'kyc_verifications' 
        AND column_name = 'id_proof_urls'
    ) THEN
        RAISE NOTICE 'GOOD: id_proof_urls column exists in kyc_verifications';
    ELSE
        RAISE WARNING 'MISSING: id_proof_urls column not found in kyc_verifications - need to run migration';
    END IF;
END $$;

-- 4. Check notification types
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'notifications_type_check';

-- 5. Count KYC records by status
\echo '=== KYC Records Summary ==='
SELECT 
    'Course KYC' as kyc_type,
    status,
    COUNT(*) as count
FROM kyc_verifications
GROUP BY status
UNION ALL
SELECT 
    'Product KYC' as kyc_type,
    status,
    COUNT(*) as count
FROM product_kyc_verifications
GROUP BY status
ORDER BY kyc_type, status;

-- 6. Check for records with multiple ID proofs in id_proof_urls
\echo '=== Checking ID Proof Arrays ==='
SELECT 
    id,
    user_id,
    CASE 
        WHEN id_proof_urls IS NOT NULL THEN jsonb_array_length(id_proof_urls)
        ELSE 0
    END as id_proof_count,
    status
FROM kyc_verifications
WHERE id_proof_urls IS NOT NULL
LIMIT 5;

-- 7. Check for any records still using old id_proof_url without id_proof_urls
SELECT 
    COUNT(*) as records_needing_migration
FROM kyc_verifications
WHERE id_proof_url IS NOT NULL AND id_proof_urls IS NULL;

\echo '=== Schema verification complete ==='

