ALTER TABLE product_kyc_verifications
ADD COLUMN IF NOT EXISTS back_side_id_proof_url TEXT,
ADD COLUMN IF NOT EXISTS signature_url TEXT;
