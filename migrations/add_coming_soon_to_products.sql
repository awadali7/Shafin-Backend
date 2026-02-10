-- Add is_coming_soon column to products table
-- This allows products to be marked as "Coming Soon" and disables purchase

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS is_coming_soon BOOLEAN DEFAULT FALSE;

-- Add comment to document the column
COMMENT ON COLUMN products.is_coming_soon IS 'If true, product is marked as coming soon and cannot be purchased';

-- Create an index for faster queries filtering by coming soon status
CREATE INDEX IF NOT EXISTS idx_products_is_coming_soon ON products(is_coming_soon) WHERE is_coming_soon = true;


