-- Migration: Add multilingual description fields to products table
-- This migration adds separate description fields for English, Malayalam, and Hindi

-- Add new description columns
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS english_description TEXT,
ADD COLUMN IF NOT EXISTS malayalam_description TEXT,
ADD COLUMN IF NOT EXISTS hindi_description TEXT;

-- Migrate existing description to english_description if exists
UPDATE products 
SET english_description = description
WHERE description IS NOT NULL AND description != '' AND english_description IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN products.english_description IS 'Product description in English';
COMMENT ON COLUMN products.malayalam_description IS 'Product description in Malayalam';
COMMENT ON COLUMN products.hindi_description IS 'Product description in Hindi';

