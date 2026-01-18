-- ========================================
-- Add Product KYC Requirement Flag
-- ========================================

-- Add requires_kyc flag to products table
DO $$
BEGIN
    -- Flag: KYC required for this product purchase
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'requires_kyc'
    ) THEN
        ALTER TABLE products ADD COLUMN requires_kyc BOOLEAN DEFAULT false;
        COMMENT ON COLUMN products.requires_kyc IS 'KYC verification required to purchase this product';
    END IF;
END $$;

-- ========================================
-- Verification
-- ========================================
SELECT column_name, data_type, column_default, col_description('products'::regclass, ordinal_position)
FROM information_schema.columns 
WHERE table_name = 'products' 
  AND column_name = 'requires_kyc'
ORDER BY ordinal_position;

-- ========================================
-- Examples
-- ========================================

-- Example 1: Product that requires KYC
-- UPDATE products SET requires_kyc = true WHERE slug = 'high-value-item';

-- Example 2: Product that does NOT require KYC (default)
-- UPDATE products SET requires_kyc = false WHERE slug = 'regular-item';

