-- Check if users table exists and has required columns
\d users

-- Check if we can run the query that the API uses
SELECT 
    k.id, k.full_name, k.address, k.contact_number, k.whatsapp_number,
    k.id_proofs, k.business_proofs, k.status, k.rejection_reason,
    k.verified_by, k.verified_at, k.created_at, k.updated_at,
    u.id as user_id, u.email as user_email,
    u.first_name as user_first_name, u.last_name as user_last_name,
    verifier.email as verifier_email
FROM product_kyc_verifications k
JOIN users u ON k.user_id = u.id
LEFT JOIN users verifier ON k.verified_by = verifier.id
LIMIT 1;

-- Count total records
SELECT COUNT(*) as total_product_kyc FROM product_kyc_verifications;

