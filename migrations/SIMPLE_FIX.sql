-- ============================================================
-- SIMPLE DATABASE FIX FOR SERVER
-- Copy and paste this directly into psql
-- ============================================================

-- 1. Rename quantity_pricing to tiered_pricing if needed
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

-- 2. Add missing columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS tiered_pricing JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS categories JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_coming_soon BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS requires_kyc BOOLEAN DEFAULT false;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount DECIMAL(10,2) NOT NULL DEFAULT 0.00;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS custom_price DECIMAL(10,2);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS price_type VARCHAR(20) DEFAULT 'regular';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_type VARCHAR(20);

-- 3. Drop old indexes and create new ones
DROP INDEX IF EXISTS idx_products_quantity_pricing;
CREATE INDEX IF NOT EXISTS idx_products_tiered_pricing ON products USING GIN (tiered_pricing);
CREATE INDEX IF NOT EXISTS idx_products_categories ON products USING GIN (categories);
CREATE INDEX IF NOT EXISTS idx_products_images ON products USING GIN (images);
CREATE INDEX IF NOT EXISTS idx_products_videos ON products USING GIN (videos);
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON products(is_featured, is_active);
CREATE INDEX IF NOT EXISTS idx_products_is_coming_soon ON products(is_coming_soon) WHERE is_coming_soon = true;

-- 4. Verify the fix
SELECT 'VERIFICATION: Checking tiered_pricing column exists...' as status;
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'products' AND column_name = 'tiered_pricing';

SELECT 'SUCCESS: Migration complete!' as status;


