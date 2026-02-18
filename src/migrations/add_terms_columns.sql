-- Add terms acceptance columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS course_terms_accepted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS product_terms_accepted_at TIMESTAMP WITH TIME ZONE;
