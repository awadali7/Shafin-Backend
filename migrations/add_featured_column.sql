-- Add is_featured column to courses table
ALTER TABLE courses 
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;

-- Create index for better performance when querying featured courses
CREATE INDEX IF NOT EXISTS idx_courses_is_featured ON courses(is_featured, is_active);

-- Add is_featured column to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;

-- Create index for better performance when querying featured products
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON products(is_featured, is_active);

-- Optional: Mark some existing courses as featured (update as needed)
-- UPDATE courses SET is_featured = true WHERE slug IN ('course-slug-1', 'course-slug-2');

-- Optional: Mark some existing products as featured (update as needed)
-- UPDATE products SET is_featured = true WHERE slug IN ('product-slug-1', 'product-slug-2');

