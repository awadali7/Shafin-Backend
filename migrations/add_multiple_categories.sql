-- Migration: Add support for multiple categories per product
-- This converts the single 'category' VARCHAR field to a 'categories' JSONB array

-- Step 1: Add new categories column (JSONB array)
ALTER TABLE products ADD COLUMN IF NOT EXISTS categories JSONB DEFAULT '[]'::jsonb;

-- Step 2: Migrate existing category data to categories array
-- If category exists, wrap it in an array; otherwise set to empty array
UPDATE products 
SET categories = 
    CASE 
        WHEN category IS NOT NULL AND category != '' 
        THEN jsonb_build_array(category)
        ELSE '[]'::jsonb
    END
WHERE categories = '[]'::jsonb OR categories IS NULL;

-- Step 3: Create index on categories for faster filtering
CREATE INDEX IF NOT EXISTS idx_products_categories ON products USING GIN (categories);

-- Step 4: (Optional) Drop old category column after confirming migration worked
-- Uncomment the line below after verifying data migration
-- ALTER TABLE products DROP COLUMN IF EXISTS category;

-- Step 5: Add check constraint to limit maximum 4 categories
ALTER TABLE products ADD CONSTRAINT chk_max_4_categories 
CHECK (jsonb_array_length(categories) <= 4);

-- Verify migration
SELECT 
    id, 
    name, 
    category as old_category, 
    categories as new_categories 
FROM products 
LIMIT 10;

