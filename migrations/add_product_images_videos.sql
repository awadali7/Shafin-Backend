-- Migration: Add multiple images and videos support to products table
-- This migration adds JSONB columns to store arrays of image URLs and video URLs

-- Add images column (JSONB array of image URLs)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- Add videos column (JSONB array of video objects with title, url, thumbnail)
-- Format: [{"title": "Video Title", "url": "https://youtube.com/...", "thumbnail": "https://..."}, ...]
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT '[]'::jsonb;

-- Migrate existing cover_image to images array if cover_image exists
-- This preserves existing data
UPDATE products 
SET images = CASE 
    WHEN cover_image IS NOT NULL AND cover_image != '' THEN jsonb_build_array(cover_image)
    ELSE '[]'::jsonb
END
WHERE images IS NULL OR images = '[]'::jsonb;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_products_images ON products USING GIN (images);
CREATE INDEX IF NOT EXISTS idx_products_videos ON products USING GIN (videos);

-- Add comment for documentation
COMMENT ON COLUMN products.images IS 'Array of image URLs in JSONB format: ["url1", "url2", ...]';
COMMENT ON COLUMN products.videos IS 'Array of video objects in JSONB format: [{"title": "...", "url": "...", "thumbnail": "..."}, ...]';


