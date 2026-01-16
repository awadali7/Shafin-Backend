-- ========================================
-- Add KYC Requirements to Products
-- ========================================

-- Add two KYC requirement flags to products table
DO $$
BEGIN
    -- Flag 1: KYC required for single product purchase (quantity = 1)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'requires_kyc_single'
    ) THEN
        ALTER TABLE products ADD COLUMN requires_kyc_single BOOLEAN DEFAULT false;
        COMMENT ON COLUMN products.requires_kyc_single IS 'KYC verification required when purchasing 1 unit of this product';
    END IF;
    
    -- Flag 2: KYC required for multiple product purchases (quantity > 1)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'requires_kyc_multiple'
    ) THEN
        ALTER TABLE products ADD COLUMN requires_kyc_multiple BOOLEAN DEFAULT false;
        COMMENT ON COLUMN products.requires_kyc_multiple IS 'KYC verification required when purchasing 2+ units of this product';
    END IF;
END $$;

-- ========================================
-- Verification
-- ========================================
SELECT column_name, data_type, column_default, col_description('products'::regclass, ordinal_position)
FROM information_schema.columns 
WHERE table_name = 'products' 
  AND column_name IN ('requires_kyc_single', 'requires_kyc_multiple')
ORDER BY ordinal_position;

-- ========================================
-- Examples
-- ========================================

-- Example 1: Product that requires KYC only for single purchase
-- UPDATE products SET requires_kyc_single = true, requires_kyc_multiple = false 
-- WHERE slug = 'high-value-item';

-- Example 2: Product that requires KYC only for bulk purchases
-- UPDATE products SET requires_kyc_single = false, requires_kyc_multiple = true 
-- WHERE slug = 'wholesale-item';

-- Example 3: Product that requires KYC for any purchase
-- UPDATE products SET requires_kyc_single = true, requires_kyc_multiple = true 
-- WHERE slug = 'restricted-item';

-- Example 4: Product that never requires KYC (default)
-- UPDATE products SET requires_kyc_single = false, requires_kyc_multiple = false 
-- WHERE slug = 'regular-item';


