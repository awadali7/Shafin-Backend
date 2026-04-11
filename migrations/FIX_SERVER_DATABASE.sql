-- ============================================================
-- COMPREHENSIVE SERVER DATABASE FIX
-- Run this on your production server to ensure all columns exist
-- This is safe to run multiple times (uses IF NOT EXISTS)
-- ============================================================

-- ==================================
-- FIXING PRODUCTS TABLE
-- ==================================

-- 1. Rename quantity_pricing to tiered_pricing
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'quantity_pricing'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'tiered_pricing'
    ) THEN
        ALTER TABLE products RENAME COLUMN quantity_pricing TO tiered_pricing;
        RAISE NOTICE '✓ Renamed quantity_pricing to tiered_pricing';
    END IF;
END $$;

-- 2. Add tiered_pricing if it doesn't exist
ALTER TABLE products ADD COLUMN IF NOT EXISTS tiered_pricing JSONB DEFAULT '[]'::jsonb;

-- 3. Add other missing columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS categories JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_coming_soon BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS requires_kyc BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS origin_city VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS origin_state VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS origin_pincode VARCHAR(20);

-- 4. Drop old indexes
DROP INDEX IF EXISTS idx_products_quantity_pricing;
DROP INDEX IF EXISTS idx_products_quantity_discounts;

-- 5. Create new indexes
CREATE INDEX IF NOT EXISTS idx_products_tiered_pricing ON products USING GIN (tiered_pricing);
CREATE INDEX IF NOT EXISTS idx_products_categories ON products USING GIN (categories);
CREATE INDEX IF NOT EXISTS idx_products_images ON products USING GIN (images);
CREATE INDEX IF NOT EXISTS idx_products_videos ON products USING GIN (videos);
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON products(is_featured, is_active);
CREATE INDEX IF NOT EXISTS idx_products_is_coming_soon ON products(is_coming_soon) WHERE is_coming_soon = true;

-- 6. Add constraints
ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_max_4_categories;
ALTER TABLE products ADD CONSTRAINT chk_max_4_categories 
    CHECK (jsonb_array_length(categories) <= 4);

-- ==================================
-- FIXING ORDERS TABLE
-- ==================================

-- 7. Add discount column to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- ==================================
-- FIXING ORDER_ITEMS TABLE
-- ==================================

-- 8. Add columns to order_items
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS custom_price DECIMAL(10,2);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS price_type VARCHAR(20) DEFAULT 'regular';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_type VARCHAR(20);

-- ================================== 
-- MIGRATION COMPLETE!
-- ==================================

-- Verify critical columns exist
SELECT '=== Verifying products table columns ===' as status;
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'products' 
  AND column_name IN ('tiered_pricing', 'categories', 'images', 'videos', 'is_featured', 'is_coming_soon', 'requires_kyc', 'origin_city', 'origin_state', 'origin_pincode')
ORDER BY column_name;

SELECT '=== Verifying orders table columns ===' as status;
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND column_name = 'discount';

SELECT '=== Verifying order_items table columns ===' as status;
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'order_items' 
  AND column_name IN ('custom_price', 'price_type', 'product_type')
ORDER BY column_name;

SELECT '✓ All done! Your database should now match your application code.' as status;
