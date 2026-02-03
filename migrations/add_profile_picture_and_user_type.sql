-- ============================================
-- Migration: Add profile_picture and user_type columns to users table
-- Date: 2026-02-03
-- Description: Adds profile_picture (optional) and user_type columns to support user profiles
-- ============================================

-- Add profile_picture column (optional field for user profile images)
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture VARCHAR(500);

-- Add user_type column if not exists (for student/business_owner classification)
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type VARCHAR(20) CHECK (user_type IN ('student', 'business_owner'));

-- Add index for user_type for faster queries
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);

-- Display confirmation message
SELECT 'Migration completed: profile_picture and user_type columns added successfully!' as status;

