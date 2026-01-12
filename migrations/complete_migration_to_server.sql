-- ========================================
-- COMPLETE DATABASE MIGRATION
-- Apply these changes to your server database
-- ========================================

-- 1. Add categories (JSONB) support to products
-- ========================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'categories'
    ) THEN
        ALTER TABLE products ADD COLUMN categories JSONB DEFAULT '[]'::jsonb;
        COMMENT ON COLUMN products.categories IS 'Array of categories: ["Main", "Sub", "SubSub", "Variant"]';
        
        -- Migrate existing category data to categories array
        UPDATE products 
        SET categories = CASE 
            WHEN category IS NOT NULL AND category != '' 
            THEN jsonb_build_array(category)
            ELSE '[]'::jsonb
        END
        WHERE categories = '[]'::jsonb;
        
        -- Create GIN index for efficient category filtering
        CREATE INDEX IF NOT EXISTS idx_products_categories ON products USING GIN (categories);
        
        -- Add check constraint to limit categories to 4 max
        ALTER TABLE products ADD CONSTRAINT check_categories_max_4 
        CHECK (jsonb_array_length(categories) <= 4);
    END IF;
END $$;

-- 2. Add tiered pricing (quantity-based pricing) to products
-- ========================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'tiered_pricing'
    ) THEN
        ALTER TABLE products ADD COLUMN tiered_pricing JSONB DEFAULT '[]'::jsonb;
        COMMENT ON COLUMN products.tiered_pricing IS 'Array of tiered pricing: [{"min_qty": 1, "max_qty": 5, "price_per_item": 90.00}]';
        
        -- Create GIN index for tiered pricing
        CREATE INDEX IF NOT EXISTS idx_products_tiered_pricing ON products USING GIN (tiered_pricing);
    END IF;
END $$;

-- If quantity_discounts column exists (old name), rename it to tiered_pricing
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'quantity_discounts'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'tiered_pricing'
    ) THEN
        ALTER TABLE products RENAME COLUMN quantity_discounts TO tiered_pricing;
        DROP INDEX IF EXISTS idx_products_quantity_discounts;
        CREATE INDEX IF NOT EXISTS idx_products_tiered_pricing ON products USING GIN (tiered_pricing);
        COMMENT ON COLUMN products.tiered_pricing IS 'Array of tiered pricing: [{"min_qty": 1, "max_qty": 5, "price_per_item": 90.00}]';
    END IF;
END $$;

-- 3. Add discount tracking to orders table
-- ========================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'discount'
    ) THEN
        ALTER TABLE orders ADD COLUMN discount DECIMAL(10,2) NOT NULL DEFAULT 0.00;
        COMMENT ON COLUMN orders.discount IS 'Total discount amount applied to order from tiered pricing';
    END IF;
END $$;

-- 4. Add discount tracking to order_items table
-- ========================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_items' AND column_name = 'discounted_price'
    ) THEN
        ALTER TABLE order_items ADD COLUMN discounted_price DECIMAL(10,2);
        COMMENT ON COLUMN order_items.discounted_price IS 'Final price per item after tiered pricing discount';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_items' AND column_name = 'discount_percent'
    ) THEN
        ALTER TABLE order_items ADD COLUMN discount_percent DECIMAL(5,2) DEFAULT 0.00;
        COMMENT ON COLUMN order_items.discount_percent IS 'Discount percentage applied from tiered pricing';
    END IF;
END $$;

-- ========================================
-- VERIFICATION QUERIES
-- ========================================

-- Check products table columns
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'products' 
  AND column_name IN ('category', 'categories', 'tiered_pricing', 'quantity_discounts')
ORDER BY ordinal_position;

-- Check orders table columns
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND column_name IN ('discount', 'shipping_cost', 'subtotal', 'total')
ORDER BY ordinal_position;

-- Check order_items table columns
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'order_items' 
  AND column_name IN ('price', 'discounted_price', 'discount_percent', 'quantity')
ORDER BY ordinal_position;

-- Check indexes
SELECT tablename, indexname, indexdef 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'products'
  AND (indexname LIKE '%categor%' OR indexname LIKE '%tier%' OR indexname LIKE '%discount%')
ORDER BY indexname;

-- ========================================
-- MIGRATION COMPLETE!
-- ========================================
-- Run \dt to see all tables
-- Run SELECT * FROM products LIMIT 1; to verify changes

