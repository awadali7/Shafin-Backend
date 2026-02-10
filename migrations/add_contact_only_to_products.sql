-- Migration: Add is_contact_only field to products table
-- Date: 2026-02-10
-- Description: Adds a boolean field to mark products that should only be contacted via WhatsApp
--              instead of direct purchase (for high-price or special products)

-- Add the column
ALTER TABLE products
ADD COLUMN IF NOT EXISTS is_contact_only BOOLEAN DEFAULT false;

-- Update the column comment
COMMENT ON COLUMN products.is_contact_only IS 'If true, product can only be contacted via WhatsApp (no direct purchase)';

-- Create an index for filtering contact-only products
CREATE INDEX IF NOT EXISTS idx_products_is_contact_only ON products(is_contact_only);

