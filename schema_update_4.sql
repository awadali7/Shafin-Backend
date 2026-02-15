-- Add product_terms_accepted_at column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS product_terms_accepted_at TIMESTAMP;
