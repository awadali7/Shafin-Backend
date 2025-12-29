-- Quick fix: Add terms_accepted_at column to users table
-- Run this immediately to fix the purchase error

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_terms_accepted ON users(terms_accepted_at);

-- Verify it was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'terms_accepted_at';

