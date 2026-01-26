-- ============================================================
-- Fix: Rename quantity_pricing to tiered_pricing
-- This ensures compatibility with the application code
-- ============================================================

-- Step 1: Check and rename quantity_pricing to tiered_pricing
DO $$
BEGIN
    -- If quantity_pricing exists and tiered_pricing doesn't, rename it
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'quantity_pricing'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'tiered_pricing'
    ) THEN
        ALTER TABLE products RENAME COLUMN quantity_pricing TO tiered_pricing;
        RAISE NOTICE 'Renamed quantity_pricing to tiered_pricing';
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'tiered_pricing'
    ) THEN
        RAISE NOTICE 'Column tiered_pricing already exists';
    ELSE
        -- Neither exists, create tiered_pricing
        ALTER TABLE products ADD COLUMN tiered_pricing JSONB DEFAULT '[]'::jsonb;
        RAISE NOTICE 'Created tiered_pricing column';
    END IF;
END $$;

-- Step 2: Drop old indexes
DROP INDEX IF EXISTS idx_products_quantity_pricing;
DROP INDEX IF EXISTS idx_products_quantity_discounts;

-- Step 3: Create new index for tiered_pricing
CREATE INDEX IF NOT EXISTS idx_products_tiered_pricing ON products USING GIN (tiered_pricing);

-- Step 4: Update column comment
COMMENT ON COLUMN products.tiered_pricing IS 'Tiered pricing array: [{"min_qty": 1, "max_qty": 5, "price_per_item": 90.00}, {"min_qty": 6, "max_qty": null, "price_per_item": 80.00}]. null max_qty means unlimited.';

-- Step 5: Verify the column exists
SELECT 
    column_name, 
    data_type, 
    column_default,
    col_description('products'::regclass, ordinal_position) as description
FROM information_schema.columns 
WHERE table_name = 'products' 
  AND column_name = 'tiered_pricing';

-- Expected output:
--   column_name   | data_type | column_default |              description
-- ----------------+-----------+----------------+----------------------------------------
--  tiered_pricing | jsonb     | '[]'::jsonb    | Tiered pricing array: [...]

