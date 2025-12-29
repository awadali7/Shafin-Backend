-- Migration: Update KYC id_proof_url to support multiple files
-- Change id_proof_url from VARCHAR to JSONB to store array of URLs

BEGIN;

-- Add new column for multiple ID proof URLs
ALTER TABLE kyc_verifications 
ADD COLUMN IF NOT EXISTS id_proof_urls JSONB;

-- Migrate existing single URL to array format
UPDATE kyc_verifications 
SET id_proof_urls = CASE 
    WHEN id_proof_url IS NOT NULL THEN jsonb_build_array(id_proof_url)
    ELSE NULL
END
WHERE id_proof_urls IS NULL;

-- Keep id_proof_url column for backward compatibility (can be removed later after migration period)
-- For now, we'll use id_proof_urls for new entries

COMMIT;

-- Note: After verifying the migration works, you can optionally:
-- 1. Update backend code to use id_proof_urls instead of id_proof_url
-- 2. Drop id_proof_url column after migration period
-- ALTER TABLE kyc_verifications DROP COLUMN id_proof_url;

