-- Migration: Rename profile_photo_url to id_proof_2_url in kyc_verifications table
-- Date: 2026-02-09
-- Description: Changes the profile_photo_url column name to id_proof_2_url to better reflect its purpose

-- Rename the column
ALTER TABLE kyc_verifications
RENAME COLUMN profile_photo_url TO id_proof_2_url;

-- Update the column comment for clarity
COMMENT ON COLUMN kyc_verifications.id_proof_2_url IS 'URL to uploaded ID proof 2 (secondary identification document)';

