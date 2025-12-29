-- Add terms_accepted_at column to users table
-- This tracks when user accepted terms and conditions (required for course purchase)

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_terms_accepted ON users(terms_accepted_at);

COMMENT ON COLUMN users.terms_accepted_at IS 'Timestamp when user accepted terms and conditions (required for course purchase)';

