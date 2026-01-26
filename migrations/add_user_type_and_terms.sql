-- ========================================
-- Phase 1: Add User Type and Terms Columns
-- This migration adds user type selection and separate terms acceptance
-- ========================================

BEGIN;

\echo '========================================='
\echo 'Phase 1: Database Schema Updates'
\echo '========================================='
\echo ''

-- ========================================
-- 1. Add user_type to users table
-- ========================================
\echo '1. Adding user_type column to users table...'

-- Add user_type column
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS user_type VARCHAR(20) CHECK (user_type IN ('student', 'business_owner'));

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);

\echo '   ✓ user_type column added'
\echo ''

-- ========================================
-- 2. Add separate terms acceptance columns
-- ========================================
\echo '2. Adding separate terms acceptance columns...'

-- Add course_terms_accepted_at (for course purchases)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS course_terms_accepted_at TIMESTAMP;

-- Add product_terms_accepted_at (for product purchases)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS product_terms_accepted_at TIMESTAMP;

\echo '   ✓ course_terms_accepted_at column added'
\echo '   ✓ product_terms_accepted_at column added'
\echo ''

-- ========================================
-- 3. Migrate existing terms_accepted_at data
-- ========================================
\echo '3. Migrating existing terms_accepted_at data...'

-- If user has accepted terms, apply to both course and product terms
UPDATE users 
SET 
    course_terms_accepted_at = terms_accepted_at,
    product_terms_accepted_at = terms_accepted_at
WHERE terms_accepted_at IS NOT NULL;

\echo '   ✓ Existing terms data migrated'
\echo ''

-- ========================================
-- 4. Show migration results
-- ========================================
\echo '4. Migration Results:'
SELECT 
    COUNT(*) as total_users,
    COUNT(CASE WHEN user_type = 'student' THEN 1 END) as students,
    COUNT(CASE WHEN user_type = 'business_owner' THEN 1 END) as business_owners,
    COUNT(CASE WHEN user_type IS NULL THEN 1 END) as no_type_set,
    COUNT(CASE WHEN course_terms_accepted_at IS NOT NULL THEN 1 END) as course_terms_accepted,
    COUNT(CASE WHEN product_terms_accepted_at IS NOT NULL THEN 1 END) as product_terms_accepted
FROM users;

\echo ''
\echo '========================================='
\echo 'Phase 1.1 Complete!'
\echo '========================================='

COMMIT;

